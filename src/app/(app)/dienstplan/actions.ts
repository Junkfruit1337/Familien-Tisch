"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { getWeekStart, getEffectiveWeek, getBadReihenfolge } from "@/lib/dienstplan";
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

export async function addTagesroutine(kategorie: string, text: string) {
  await requireParent();
  const anzahl = await prisma.tagesroutine.count({ where: { kategorie } });
  await prisma.tagesroutine.create({ data: { kategorie, text, reihenfolge: anzahl } });
  revalidatePath("/dienstplan");
}

export async function updateTagesroutine(id: string, text: string) {
  await requireParent();
  await prisma.tagesroutine.update({ where: { id }, data: { text } });
  revalidatePath("/dienstplan");
}

export async function deleteTagesroutine(id: string) {
  await requireParent();
  await prisma.tagesroutine.delete({ where: { id } });
  revalidatePath("/dienstplan");
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
