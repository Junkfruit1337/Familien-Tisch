"use server";

import { getCurrentPerson, requirePerson } from "@/lib/auth";
import { getWochenplan } from "../essensplan/actions";
import { listAnstehendeSchulEintraege, createSchulEintrag } from "../schule/actions";
import { prisma } from "@/lib/prisma";

function lerntipp(tageBis: number): string {
  if (tageBis <= 0) return "Heute ist es so weit — nochmal kurz die Zusammenfassung durchlesen!";
  if (tageBis === 1) return "Morgen schon! Heute Abend nochmal in Ruhe wiederholen.";
  if (tageBis <= 3) return "Noch ein paar Tage — jeden Tag 15–20 Minuten üben bringt mehr als alles auf einmal.";
  return "Ist noch etwas hin — schon mal die Übersicht/Zusammenfassung anlegen.";
}

export async function getDashboardDaten() {
  const person = await requirePerson();
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const morgenFrueh = new Date(heute);
  morgenFrueh.setDate(morgenFrueh.getDate() + 1);

  const plan = await getWochenplan(0);
  const heutigesEssen = plan.tage.find((t) => new Date(t.tag).toDateString() === heute.toDateString());

  const schulEintraege = await listAnstehendeSchulEintraege();

  const terminWhere =
    person.rolle === "ELTERN"
      ? { start: { gte: heute, lt: morgenFrueh } }
      : { start: { gte: heute, lt: morgenFrueh }, OR: [{ personId: person.id }, { personId: null }] };
  const termineHeute = await prisma.termin.findMany({ where: terminWhere as any, include: { person: true }, orderBy: { start: "asc" } });

  const aufgabenWhere =
    person.rolle === "ELTERN" ? { erledigt: false } : { erledigt: false, OR: [{ personId: person.id }, { personId: null }] };
  const offeneAufgaben = await prisma.aufgabe.count({ where: aufgabenWhere as any });

  return {
    person: { name: person.name, rolle: person.rolle },
    heutigesEssen: heutigesEssen?.eintrag?.rezeptName ?? null,
    schulEintraege: schulEintraege.map((s) => {
      const tageBis = Math.ceil((s.datum.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: s.id,
        titel: s.titel,
        fachName: s.fachName,
        datum: s.datum.toISOString(),
        personName: s.person.name,
        tageBis,
        lerntipp: person.rolle === "KIND" ? lerntipp(tageBis) : null,
      };
    }),
    termineHeute: termineHeute.map((t) => ({ id: t.id, titel: t.titel, start: t.start.toISOString(), personName: t.person?.name ?? "Familie" })),
    offeneAufgaben,
  };
}

export { createSchulEintrag };
