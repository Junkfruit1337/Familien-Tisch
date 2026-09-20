"use server";

import { prisma } from "@/lib/prisma";
import { verifyPin, createSession } from "@/lib/auth";
import { redirect } from "next/navigation";

// Fix-Batch 131 (Florians Wunsch, nach dem Account-Vorfall): Brute-Force-Schutz für die
// 4-stellige PIN — nur 10.000 mögliche Kombinationen, ohne Sperre beliebig oft erratbar.
const MAX_FEHLVERSUCHE = 5;
const SPERR_DAUER_MINUTEN = 5;

export async function login(personId: string, pin: string) {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person || !person.aktiv) {
    return { error: "Person nicht gefunden." };
  }
  if (person.pinGesperrtBis && person.pinGesperrtBis > new Date()) {
    const minuten = Math.max(1, Math.ceil((person.pinGesperrtBis.getTime() - Date.now()) / 60000));
    return { error: `Zu viele Fehlversuche. Bitte in ${minuten} Minute(n) erneut versuchen.` };
  }
  const ok = await verifyPin(person, pin);
  if (!ok) {
    const neueFehlversuche = person.pinFehlversuche + 1;
    const gesperrt = neueFehlversuche >= MAX_FEHLVERSUCHE;
    await prisma.person.update({
      where: { id: person.id },
      data: {
        pinFehlversuche: gesperrt ? 0 : neueFehlversuche,
        pinGesperrtBis: gesperrt ? new Date(Date.now() + SPERR_DAUER_MINUTEN * 60000) : null,
      },
    });
    return {
      error: gesperrt
        ? `Zu viele Fehlversuche. Bitte in ${SPERR_DAUER_MINUTEN} Minuten erneut versuchen.`
        : "PIN ist falsch.",
    };
  }
  await prisma.person.update({ where: { id: person.id }, data: { pinFehlversuche: 0, pinGesperrtBis: null } });
  await createSession(person.id);
  if (person.pinAendernErforderlich) redirect("/pin-aendern");
  redirect("/dashboard");
}

export async function getLoginPersonen() {
  return prisma.person.findMany({
    where: { aktiv: true, rolle: { in: ["ELTERN", "KIND"] } },
    orderBy: { reihenfolge: "asc" },
  });
}
