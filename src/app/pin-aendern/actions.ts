"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, hashPin } from "@/lib/auth";

// Fix-Batch 131 (Florians Wunsch): jede Person darf ihre EIGENE PIN selbst ändern (vorher
// konnte nur ein Elternteil über die Einstellungen die PIN einer anderen Person setzen —
// Kinder hatten gar keine Möglichkeit, ihre eigene PIN selbst zu ändern). Bewusst ohne
// Abfrage der alten PIN: wer schon eingeloggt ist, hat die PIN bereits bewiesen.
export async function aendereEigenePin(neuePin: string) {
  const person = await requirePerson();
  if (!/^\d{4}$/.test(neuePin)) throw new Error("PIN muss aus genau 4 Ziffern bestehen.");
  await prisma.person.update({
    where: { id: person.id },
    data: { pinHash: await hashPin(neuePin), pinAendernErforderlich: false, pinFehlversuche: 0, pinGesperrtBis: null },
  });
}
