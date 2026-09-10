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

export async function erstelleTausch(data: { wocheStartIso: string; tag?: string; vonKindId: string; mitKindId: string }) {
  const person = await requireParent();
  if (data.vonKindId === data.mitKindId) throw new Error("Man kann nicht mit sich selbst tauschen.");

  const tausch = await prisma.dienstTausch.create({
    data: {
      wocheStart: new Date(data.wocheStartIso),
      tag: data.tag ? new Date(data.tag) : null,
      vonKindId: data.vonKindId,
      mitKindId: data.mitKindId,
      erstelltVonId: person.id,
    },
  });

  await logAenderung({
    entityTyp: "DIENST_TAUSCH",
    entityId: tausch.id,
    aktion: "erstellt",
    neuerWert: `${data.vonKindId} -> ${data.mitKindId}`,
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
