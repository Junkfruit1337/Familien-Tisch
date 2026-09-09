"use server";

import { prisma } from "@/lib/prisma";
import { verifyPin, createSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function login(personId: string, pin: string) {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person || !person.aktiv) {
    return { error: "Person nicht gefunden." };
  }
  const ok = await verifyPin(person, pin);
  if (!ok) {
    return { error: "PIN ist falsch." };
  }
  await createSession(person.id);
  redirect("/dashboard");
}

export async function getLoginPersonen() {
  return prisma.person.findMany({
    where: { aktiv: true, rolle: { in: ["ELTERN", "KIND"] } },
    orderBy: { reihenfolge: "asc" },
  });
}
