"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung, getHistorieFuerTyp } from "@/lib/history";
import { getWeekStart, getEffectiveWeek, getBadReihenfolge } from "@/lib/dienstplan";
import { DIENSTE_VORLAGE, TAGESROUTINEN_VORLAGE, KOERPERPFLEGE_VORLAGE } from "@/lib/schichtsystemVorlage";
import { revalidatePath } from "next/cache";

export async function getWoche(datum?: string) {
  const person = await requirePerson();
  const wocheStart = getWeekStart(datum ? new Date(datum) : new Date());
  const woche = await getEffectiveWeek(wocheStart, person.familieId!);
  return { wocheStart: wocheStart.toISOString(), woche };
}

export async function getBadplan(wocheStartIso: string) {
  const person = await requirePerson();
  const wocheStart = new Date(wocheStartIso);
  return getBadReihenfolge(wocheStart, person.familieId!);
}

// Eltern: zwei Positionen der Bad-Reihenfolge (morgens ODER abends) tauschen.
// Unabhängig vom Dienst-Tausch — ändert direkt, welches Kind an welcher Position steht.
export async function tauscheBadPosition(data: {
  wocheStartIso: string;
  zeitpunkt: "morgens" | "abends";
  positionA: number;
  positionB: number;
}) {
  const person = await requireParent();
  if (data.positionA === data.positionB) return;
  const wocheStart = new Date(data.wocheStartIso);

  const [rowA, rowB] = await Promise.all([
    prisma.badZuweisung.findUnique({
      where: { familieId_wocheStart_zeitpunkt_position: { familieId: person.familieId!, wocheStart, zeitpunkt: data.zeitpunkt, position: data.positionA } },
    }),
    prisma.badZuweisung.findUnique({
      where: { familieId_wocheStart_zeitpunkt_position: { familieId: person.familieId!, wocheStart, zeitpunkt: data.zeitpunkt, position: data.positionB } },
    }),
  ]);
  if (!rowA || !rowB) return;

  await prisma.$transaction([
    prisma.badZuweisung.update({ where: { id: rowA.id }, data: { kindId: rowB.kindId } }),
    prisma.badZuweisung.update({ where: { id: rowB.id }, data: { kindId: rowA.kindId } }),
  ]);

  await logAenderung({
    entityTyp: "DIENST_TAUSCH",
    entityId: `${data.wocheStartIso}-bad-${data.zeitpunkt}`,
    aktion: "Bad-Reihenfolge getauscht",
    neuerWert: `Position ${data.positionA} ↔ ${data.positionB} (${data.zeitpunkt})`,
    geaendertVonId: person.id,
  });
  revalidatePath("/dienstplan");
}

// ---------- Dauerhafte Zuordnungen (Fix-Batch 35, Florians Wunsch) ----------
// Im Unterschied zu erstelleTausch (immer nur für eine Woche/einen Tag) bzw.
// tauscheBadPosition (nur für die eine gerade angezeigte Woche) legt das hier fest, wer einen
// Schicht-/Bad-Positions-Slot ab jetzt DAUERHAFT innehat. Überschreibt sowohl bereits erzeugte
// aktuelle/zukünftige Wochen (rückwirkend ab der übergebenen Woche) als auch — über
// lib/dienstplan.ts — alle danach neu erzeugten Wochen.

async function setzeDauerhafteZuordnungIntern(
  art: "DIENST" | "BAD_MORGENS" | "BAD_ABENDS",
  slot: number,
  kindId: string,
  abWocheStart: Date,
  familieId: string
) {
  await prisma.dauerhafteZuordnung.upsert({
    where: { familieId_art_slot: { familieId, art, slot } },
    update: { kindId },
    create: { familieId, art, slot, kindId },
  });
  if (art === "DIENST") {
    await prisma.dienstZuweisung.updateMany({
      where: { familieId, schichtNummer: slot, wocheStart: { gte: abWocheStart } },
      data: { kindId },
    });
  } else {
    await prisma.badZuweisung.updateMany({
      where: { familieId, zeitpunkt: art === "BAD_MORGENS" ? "morgens" : "abends", position: slot, wocheStart: { gte: abWocheStart } },
      data: { kindId },
    });
  }
}

export async function listDauerhafteZuordnungen() {
  const person = await requirePerson();
  return prisma.dauerhafteZuordnung.findMany({ where: { familieId: person.familieId }, include: { kind: true } });
}

// Dienst dauerhaft abgeben/tauschen — ermittelt zuerst, welche Schicht von/mit gerade
// (effektiv, inkl. bereits laufender Tausche) innehaben, und macht genau diese Zuordnung
// dauerhaft (ABGEBEN: nur vonKind → mitKind; TAUSCH: beide Schichten wechseln dauerhaft).
export async function erstelleDauerhaftenTausch(data: {
  wocheStartIso: string;
  vonKindId: string;
  mitKindId: string;
  modus: "ABGEBEN" | "TAUSCH";
}) {
  const person = await requireParent();
  const wocheStart = new Date(data.wocheStartIso);
  const effektiv = await getEffectiveWeek(wocheStart, person.familieId!);
  const vonSchicht = effektiv.find((s) => s.kind?.id === data.vonKindId)?.schichtNummer;
  const mitSchicht = effektiv.find((s) => s.kind?.id === data.mitKindId)?.schichtNummer;
  if (!vonSchicht) throw new Error("Diese Person hat aktuell keinen Dienst.");

  await setzeDauerhafteZuordnungIntern("DIENST", vonSchicht, data.mitKindId, wocheStart, person.familieId!);
  if (data.modus === "TAUSCH" && mitSchicht) {
    await setzeDauerhafteZuordnungIntern("DIENST", mitSchicht, data.vonKindId, wocheStart, person.familieId!);
  }

  await logAenderung({
    entityTyp: "DIENST_TAUSCH",
    entityId: `dauerhaft-dienst-${vonSchicht}`,
    aktion: "dauerhaft getauscht",
    neuerWert: `Schicht ${vonSchicht}${mitSchicht && data.modus === "TAUSCH" ? ` ↔ Schicht ${mitSchicht}` : ""}`,
    geaendertVonId: person.id,
  });
  revalidatePath("/dienstplan");
}

// Bad-Reihenfolge-Position dauerhaft neu besetzen.
export async function setzeDauerhafteBadZuordnung(data: {
  wocheStartIso: string;
  zeitpunkt: "morgens" | "abends";
  position: number;
  kindId: string;
}) {
  const person = await requireParent();
  const wocheStart = new Date(data.wocheStartIso);
  await setzeDauerhafteZuordnungIntern(data.zeitpunkt === "morgens" ? "BAD_MORGENS" : "BAD_ABENDS", data.position, data.kindId, wocheStart, person.familieId!);
  await logAenderung({
    entityTyp: "DIENST_TAUSCH",
    entityId: `dauerhaft-bad-${data.zeitpunkt}-${data.position}`,
    aktion: "Bad-Reihenfolge dauerhaft geändert",
    neuerWert: `Position ${data.position} (${data.zeitpunkt})`,
    geaendertVonId: person.id,
  });
  revalidatePath("/dienstplan");
}

// Dienste-Historie fürs Dienstplan-Tab (Fix-Batch 35, Florians Wunsch) — alle bisherigen
// Dienst-/Bad-Reihenfolge-Tausche (auch aufgehobene/vergangene Wochen), nicht nur die
// aktuell aktiven. Jede Person darf mitlesen, nicht nur Eltern (reine Info, keine Aktion).
export async function listDienstHistorie() {
  const person = await requirePerson();
  const eintraege = await getHistorieFuerTyp("DIENST_TAUSCH", person.familieId!, 40);
  return eintraege.map((e) => ({
    id: e.id,
    zeitpunkt: e.zeitpunkt.toISOString(),
    personName: e.geaendertVon.name,
    aktion: e.aktion,
    bezug: e.neuerWert ?? e.alterWert ?? null,
  }));
}

export async function listAktiveTausche(wocheStartIso: string) {
  const person = await requirePerson();
  const wocheStart = new Date(wocheStartIso);
  return prisma.dienstTausch.findMany({
    where: { wocheStart, aufgehoben: false, familieId: person.familieId },
    include: { vonKind: true, mitKind: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function erstelleTausch(data: {
  wocheStartIso: string;
  tag?: string;
  vonKindId: string;
  mitKindId: string;
  modus: "ABGEBEN" | "TAUSCH";
}) {
  const person = await requireParent();
  if (data.vonKindId === data.mitKindId) throw new Error("Man kann nicht mit sich selbst tauschen.");

  const tausch = await prisma.dienstTausch.create({
    data: {
      familieId: person.familieId,
      wocheStart: new Date(data.wocheStartIso),
      tag: data.tag ? new Date(data.tag) : null,
      modus: data.modus,
      vonKindId: data.vonKindId,
      mitKindId: data.mitKindId,
      erstelltVonId: person.id,
    },
  });

  await logAenderung({
    entityTyp: "DIENST_TAUSCH",
    entityId: tausch.id,
    aktion: "erstellt",
    neuerWert: `${data.modus}: ${data.vonKindId} -> ${data.mitKindId}`,
    geaendertVonId: person.id,
  });

  revalidatePath("/dienstplan");
  revalidatePath("/dashboard");
}

export async function hebeTauschAuf(id: string) {
  const person = await requireParent();
  const tausch = await prisma.dienstTausch.findUnique({ where: { id } });
  if (!tausch || tausch.familieId !== person.familieId) return;
  await prisma.dienstTausch.update({ where: { id }, data: { aufgehoben: true } });
  await logAenderung({ entityTyp: "DIENST_TAUSCH", entityId: id, aktion: "aufgehoben", geaendertVonId: person.id });
  revalidatePath("/dienstplan");
  revalidatePath("/dashboard");
}

// ---------- Dienstkatalog: Regeltexte bearbeiten (Fahrplan §3, Batch 4) ----------

export async function updateDienstBeschreibung(id: string, beschreibung: string) {
  const person = await requireParent();
  const dienst = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!dienst || dienst.familieId !== person.familieId) return;
  await prisma.dienstDefinition.update({ where: { id }, data: { beschreibung } });
  revalidatePath("/dienstplan");
}

// ---------- Tagesroutinen & Körperpflege-Nachschlagewerk (Fahrplan §3, Batch 4) ----------

export async function listTagesroutinen() {
  return prisma.tagesroutine.findMany({ orderBy: [{ kategorie: "asc" }, { reihenfolge: "asc" }] });
}

// Fix-Batch 30: Bearbeiten/Löschen ist jetzt nur noch über die Einstellungen möglich
// (vorher zusätzlich direkt im Dienstplan-Tab, was dort laut Florian nicht hingehört) —
// revalidiert deshalb auch /einstellungen.
export async function addTagesroutine(kategorie: string, text: string) {
  await requireParent();
  const anzahl = await prisma.tagesroutine.count({ where: { kategorie } });
  await prisma.tagesroutine.create({ data: { kategorie, text, reihenfolge: anzahl } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function updateTagesroutine(id: string, text: string) {
  await requireParent();
  await prisma.tagesroutine.update({ where: { id }, data: { text } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function deleteTagesroutine(id: string) {
  await requireParent();
  await prisma.tagesroutine.delete({ where: { id } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function listKoerperpflegeplan() {
  return prisma.koerperpflegetag.findMany({ orderBy: { wochentag: "asc" } });
}

export async function setKoerperpflegetag(wochentag: number, text: string) {
  await requireParent();
  await prisma.koerperpflegetag.upsert({
    where: { wochentag },
    update: { text },
    create: { wochentag, text },
  });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

// ---------- Dienstkatalog dauerhaft verwalten (Florians Wunsch, 11.09.2026) ----------
// Dienste sind reine Nachschlage-/Anzeigedaten je Schicht (keine Fremdschlüssel von
// Dienstzuweisung/-Tausch darauf), Ändern/Verschieben/Löschen ist daher jederzeit
// gefahrlos möglich und wirkt sich sofort (auch rückwirkend) auf die Anzeige aus.

export async function listDienstkatalog() {
  const person = await requirePerson();
  return prisma.dienstDefinition.findMany({
    where: { familieId: person.familieId },
    orderBy: [{ schichtNummer: "asc" }, { reihenfolge: "asc" }],
  });
}

export async function addDienst(schichtNummer: number, bezeichnung: string, beschreibung?: string) {
  const person = await requireParent();
  const anzahl = await prisma.dienstDefinition.count({ where: { schichtNummer, familieId: person.familieId } });
  await prisma.dienstDefinition.create({ data: { familieId: person.familieId, schichtNummer, reihenfolge: anzahl + 1, bezeichnung, beschreibung } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function updateDienst(id: string, data: { bezeichnung?: string; beschreibung?: string }) {
  const person = await requireParent();
  const dienst = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!dienst || dienst.familieId !== person.familieId) return;
  await prisma.dienstDefinition.update({ where: { id }, data });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

// Verschiebt einen Dienst dauerhaft in eine andere Schicht (ans Ende der Ziel-Schicht).
export async function verschiebeDienstSchicht(id: string, neueSchichtNummer: number) {
  const person = await requireParent();
  const bestehend = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!bestehend || bestehend.familieId !== person.familieId) return;
  const anzahl = await prisma.dienstDefinition.count({ where: { schichtNummer: neueSchichtNummer, familieId: person.familieId } });
  await prisma.dienstDefinition.update({ where: { id }, data: { schichtNummer: neueSchichtNummer, reihenfolge: anzahl + 1 } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function verschiebeDienstReihenfolge(id: string, richtung: "hoch" | "runter") {
  const person = await requireParent();
  const dienst = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!dienst || dienst.familieId !== person.familieId) return;
  const geschwister = await prisma.dienstDefinition.findMany({
    where: { schichtNummer: dienst.schichtNummer, familieId: person.familieId },
    orderBy: { reihenfolge: "asc" },
  });
  const index = geschwister.findIndex((d) => d.id === id);
  const zielIndex = richtung === "hoch" ? index - 1 : index + 1;
  if (zielIndex < 0 || zielIndex >= geschwister.length) return;
  const a = geschwister[index];
  const b = geschwister[zielIndex];
  await prisma.$transaction([
    prisma.dienstDefinition.update({ where: { id: a.id }, data: { reihenfolge: b.reihenfolge } }),
    prisma.dienstDefinition.update({ where: { id: b.id }, data: { reihenfolge: a.reihenfolge } }),
  ]);
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function deleteDienst(id: string) {
  const person = await requireParent();
  const dienst = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!dienst || dienst.familieId !== person.familieId) return;
  await prisma.dienstDefinition.delete({ where: { id } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

// Lädt einmalig Florians tatsächlichen Dokumenttext (Dienste, Tagesroutinen, Körperpflegeplan)
// in die Datenbank — ersetzt die bisherigen Platzhalter-Bezeichnungen/-texte. Kann gefahrlos
// mehrfach ausgeführt werden (Dienste/Körperpflegeplan werden überschrieben, nicht verdoppelt;
// Tagesroutinen werden komplett ersetzt, damit keine doppelten Einträge entstehen).
export async function installiereSchichtsystemVorlage() {
  const person = await requireParent();

  for (const d of DIENSTE_VORLAGE) {
    const existing = await prisma.dienstDefinition.findFirst({
      where: { familieId: person.familieId, schichtNummer: d.schichtNummer, reihenfolge: d.reihenfolge },
    });
    if (existing) {
      await prisma.dienstDefinition.update({ where: { id: existing.id }, data: { bezeichnung: d.bezeichnung, beschreibung: d.beschreibung } });
    } else {
      await prisma.dienstDefinition.create({ data: { ...d, familieId: person.familieId } });
    }
  }

  await prisma.tagesroutine.deleteMany({});
  for (const gruppe of TAGESROUTINEN_VORLAGE) {
    for (let i = 0; i < gruppe.texte.length; i++) {
      await prisma.tagesroutine.create({ data: { kategorie: gruppe.kategorie, reihenfolge: i, text: gruppe.texte[i] } });
    }
  }

  for (const [wochentag, text] of Object.entries(KOERPERPFLEGE_VORLAGE)) {
    await prisma.koerperpflegetag.upsert({
      where: { wochentag: Number(wochentag) },
      update: { text },
      create: { wochentag: Number(wochentag), text },
    });
  }

  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}
