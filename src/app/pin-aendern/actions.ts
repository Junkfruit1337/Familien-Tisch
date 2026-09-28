"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentPerson, hashPin } from "@/lib/auth";
import { redirect } from "next/navigation";

// Fix-Batch 131 (Florians Wunsch): jede Person darf ihre EIGENE PIN selbst ändern (vorher
// konnte nur ein Elternteil über die Einstellungen die PIN einer anderen Person setzen —
// Kinder hatten gar keine Möglichkeit, ihre eigene PIN selbst zu ändern). Bewusst ohne
// Abfrage der alten PIN: wer schon eingeloggt ist, hat die PIN bereits bewiesen.
// Fix-Batch 150 (Audit-Fund): rohes throw statt {ok,fehler} — Next.js verschluckt geworfene
// Fehler aus Server Actions in Produktion. Läuft z. B. die Session während des PIN-Ändern-
// Vorgangs ab (oder wird die Person zwischenzeitlich deaktiviert, siehe Fix-Batch 149s
// `aktiv`-Check in getCurrentPerson), hing der Nutzer bisher auf dieser Seite fest, ohne
// erkennbaren Grund und ohne Weiterleitung zum Login — jetzt explizit redirect("/login").
export async function aendereEigenePin(neuePin: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await getCurrentPerson();
  if (!person) redirect("/login");
  if (!/^\d{4}$/.test(neuePin)) return { ok: false, fehler: "PIN muss aus genau 4 Ziffern bestehen." };
  await prisma.person.update({
    where: { id: person.id },
    data: { pinHash: await hashPin(neuePin), pinAendernErforderlich: false, pinFehlversuche: 0, pinGesperrtBis: null },
  });
  return { ok: true };
}
