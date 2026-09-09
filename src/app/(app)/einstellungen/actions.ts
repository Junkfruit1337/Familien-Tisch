"use server";

import { prisma } from "@/lib/prisma";
import { requireParent, requirePerson, hashPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function listPersonen() {
  await requirePerson();
  return prisma.person.findMany({ orderBy: { reihenfolge: "asc" } });
}

export async function createPerson(data: { name: string; rolle: string; pin?: string; farbe: string }) {
  await requireParent();
  const anzahl = await prisma.person.count();
  await prisma.person.create({
    data: {
      name: data.name,
      rolle: data.rolle as any,
      farbe: data.farbe,
      pinHash: data.pin ? await hashPin(data.pin) : null,
      reihenfolge: anzahl,
    },
  });
  revalidatePath("/einstellungen");
}

export async function setPin(personId: string, pin: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { pinHash: await hashPin(pin) } });
  revalidatePath("/einstellungen");
}

export async function setFarbe(personId: string, farbe: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { farbe } });
  revalidatePath("/einstellungen");
}

export async function setAktiv(personId: string, aktiv: boolean) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { aktiv } });
  revalidatePath("/einstellungen");
}
