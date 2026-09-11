"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { getWeekStart, getEffectiveWeek, getBadReihenfolge } from "@/lib/dienstplan";
import { DIENSTE_VORLAGE, TAGESROUTINEN_VORLAGE, KOERPERPFLEGE_VORLAGE } from "@/lib/schichtsystemVorlage";
import { revalidatePath } from "next/cache";

export async function getWoche(datum?: string) {
  const wocheStart = getWeekStart(datum ? new Date(datum) : new Date());
  const woche = await getEffectiveWeek(wocheStart);
  return { wocheStart: wocheStart.toISOString(), woche };
}

export async function getBadplan(wocheStartIso: string) {
  const wocheStart = new Date(wocheStartIso);
  return getBadReihenfolge(wocheStart);
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
      where: { wocheStart_zeitpunkt_position: { wocheStart, zeitpunkt: data.zeitpunkt, position: data.positionA } },
    }),
    prisma.badZuweisung.findUnique({
      where: { wocheStart_zeitpunkt_position: { wocheStart, zeitpunkt: data.zeitpunkt, position: data.positionB } },
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

export async function listAktiveTausche(wocheStartIso: string) {
  const wocheStart = new Date(wocheStartIso);
  return prisma.dienstTausch.findMany({
    where: { wocheStart, aufgehoben: false },
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
  await prisma.dienstTausch.update({ where: { id }, data: { aufgehoben: true } });
  await logAenderung({ entityTyp: "DIENST_TAUSCH", entityId: id, aktion: "aufgehoben", geaendertVonId: person.id });
  revalidatePath("/dienstplan");
  revalidatePath("/dashboard");
}

// ---------- Dienstkatalog: Regeltexte bearbeiten (Fahrplan §3, Batch 4) ----------

export async function updateDienstBeschreibung(id: string, beschreibung: string) {
  await requireParent();
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

// ---------- Zusätzliche Aufgaben — freier Bereich für Ad-hoc-Dienste (Fahrplan §3, Batch 4) ----------

export async function listZusatzAufgaben() {
  return prisma.zusatzAufgabe.findMany({ include: { person: true }, orderBy: [{ erledigt: "asc" }, { createdAt: "desc" }] });
}

export async function addZusatzAufgabe(titel: string, personId?: string) {
  const ersteller = await requireParent();
  await prisma.zusatzAufgabe.create({ data: { titel, personId: personId || null, erstelltVonId: ersteller.id } });
  revalidatePath("/dienstplan");
}

export async function toggleZusatzAufgabe(id: string) {
  await requirePerson();
  const a = await prisma.zusatzAufgabe.findUnique({ where: { id } });
  if (!a) return;
  await prisma.zusatzAufgabe.update({ where: { id }, data: { erledigt: !a.erledigt } });
  revalidatePath("/dienstplan");
}

export async function deleteZusatzAufgabe(id: string) {
  await requireParent();
  await prisma.zusatzAufgabe.delete({ where: { id } });
  revalidatePath("/dienstplan");
}

// ---------- Dienstkatalog dauerhaft verwalten (Florians Wunsch, 11.09.2026) ----------
// Dienste sind reine Nachschlage-/Anzeigedaten je Schicht (keine Fremdschlüssel von
// Dienstzuweisung/-Tausch darauf), Ändern/Verschieben/Löschen ist daher jederzeit
// gefahrlos möglich und wirkt sich sofort (auch rückwirkend) auf die Anzeige aus.

export async function listDienstkatalog() {
  return prisma.dienstDefinition.findMany({ orderBy: [{ schichtNummer: "asc" }, { reihenfolge: "asc" }] });
}

export async function addDienst(schichtNummer: number, bezeichnung: string, beschreibung?: string) {
  await requireParent();
  const anzahl = await prisma.dienstDefinition.count({ where: { schichtNummer } });
  await prisma.dienstDefinition.create({ data: { schichtNummer, reihenfolge: anzahl + 1, bezeichnung, beschreibung } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function updateDienst(id: string, data: { bezeichnung?: string; beschreibung?: string }) {
  await requireParent();
  await prisma.dienstDefinition.update({ where: { id }, data });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

// Verschiebt einen Dienst dauerhaft in eine andere Schicht (ans Ende der Ziel-Schicht).
export async function verschiebeDienstSchicht(id: string, neueSchichtNummer: number) {
  await requireParent();
  const anzahl = await prisma.dienstDefinition.count({ where: { schichtNummer: neueSchichtNummer } });
  await prisma.dienstDefinition.update({ where: { id }, data: { schichtNummer: neueSchichtNummer, reihenfolge: anzahl + 1 } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

export async function verschiebeDienstReihenfolge(id: string, richtung: "hoch" | "runter") {
  await requireParent();
  const dienst = await prisma.dienstDefinition.findUnique({ where: { id } });
  if (!dienst) return;
  const geschwister = await prisma.dienstDefinition.findMany({
    where: { schichtNummer: dienst.schichtNummer },
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
  await requireParent();
  await prisma.dienstDefinition.delete({ where: { id } });
  revalidatePath("/dienstplan");
  revalidatePath("/einstellungen");
}

// Lädt einmalig Florians tatsächlichen Dokumenttext (Dienste, Tagesroutinen, Körperpflegeplan)
// in die Datenbank — ersetzt die bisherigen Platzhalter-Bezeichnungen/-texte. Kann gefahrlos
// mehrfach ausgeführt werden (Dienste/Körperpflegeplan werden überschrieben, nicht verdoppelt;
// Tagesroutinen werden komplett ersetzt, damit keine doppelten Einträge entstehen).
export async function installiereSchichtsystemVorlage() {
  await requireParent();

  for (const d of DIENSTE_VORLAGE) {
    const existing = await prisma.dienstDefinition.findFirst({ where: { schichtNummer: d.schichtNummer, reihenfolge: d.reihenfolge } });
    if (existing) {
      await prisma.dienstDefinition.update({ where: { id: existing.id }, data: { bezeichnung: d.bezeichnung, beschreibung: d.beschreibung } });
    } else {
      await prisma.dienstDefinition.create({ data: d });
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
