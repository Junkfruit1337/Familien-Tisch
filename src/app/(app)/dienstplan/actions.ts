"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { getWeekStart, getEffectiveWeek } from "@/lib/dienstplan";
import { revalidatePath } from "next/cache";

export async function getWoche(datum?: string) {
  const wocheStart = getWeekStart(datum ? new Date(datum) : new Date());
  const woche = await getEffectiveWeek(wocheStart);
  return { wocheStart: wocheStart.toISOString(), woche };
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
