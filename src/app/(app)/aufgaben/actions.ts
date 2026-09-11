"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

// Sicherheitsgrenze gegen versehentliche Endlos-Serien — analog Kalender (Fix-Batch 7).
// Bei "Unbegrenzt" (kein Enddatum gewählt) wird pragmatisch bis zu diesem Zeit-/Stück-Horizont
// im Voraus angelegt statt echter unbegrenzter Wiederholung, die eine laufende Hintergrund-
// Erzeugung bräuchte (bewusst in Kauf genommene, dokumentierte Vereinfachung).
const MAX_SERIEN_AUFGABEN = 200;
const UNBEGRENZT_HORIZONT_TAGE = 365 * 2;

function naechsteAufgabe(datum: Date, wiederholung: string): Date {
  const d = new Date(datum);
  if (wiederholung === "TAEGLICH") d.setDate(d.getDate() + 1);
  else if (wiederholung === "WOECHENTLICH") d.setDate(d.getDate() + 7);
  else if (wiederholung === "ZWEIWOECHENTLICH") d.setDate(d.getDate() + 14);
  else if (wiederholung === "MONATLICH") d.setMonth(d.getMonth() + 1);
  return d;
}

export async function listAufgaben() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? {}
      : { OR: [{ personId: person.id }, { personId: null }] };
  return prisma.aufgabe.findMany({
    where,
    include: { person: true },
    orderBy: [{ erledigt: "asc" }, { faelligkeit: "asc" }],
  });
}

export async function createAufgabe(data: {
  titel: string;
  faelligkeit?: string;
  personId: string | null;
  wiederholung?: string;
  wiederholungBis?: string; // leer/undefined bei "Unbegrenzt"
}) {
  const person = await requirePerson();
  const personId = person.rolle === "ELTERN" ? data.personId : person.id;

  const wiederholung = data.wiederholung && data.wiederholung !== "KEINE" && data.faelligkeit ? data.wiederholung : "KEINE";
  const seriesId = wiederholung !== "KEINE" ? randomUUID() : null;
  const unbegrenzt = wiederholung !== "KEINE" && !data.wiederholungBis;
  const horizont = new Date();
  horizont.setDate(horizont.getDate() + UNBEGRENZT_HORIZONT_TAGE);
  const wiederholungBis = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : null) : null;
  const grenze = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : horizont) : null;

  const ersteFaelligkeit = data.faelligkeit ? new Date(data.faelligkeit) : null;
  const faelligkeitsDaten: (Date | null)[] = [ersteFaelligkeit];
  if (wiederholung !== "KEINE" && grenze && ersteFaelligkeit) {
    let naechste = naechsteAufgabe(ersteFaelligkeit, wiederholung);
    while (naechste <= grenze && faelligkeitsDaten.length < MAX_SERIEN_AUFGABEN) {
      faelligkeitsDaten.push(naechste);
      naechste = naechsteAufgabe(naechste, wiederholung);
    }
  }

  const erstellte = [];
  for (const faelligkeit of faelligkeitsDaten) {
    const aufgabe = await prisma.aufgabe.create({
      data: {
        titel: data.titel,
        faelligkeit,
        personId,
        seriesId,
        wiederholung: wiederholung as any,
        wiederholungBis: unbegrenzt ? null : wiederholungBis,
        erstelltVonId: person.id,
      },
    });
    erstellte.push(aufgabe);
  }

  await logAenderung({
    entityTyp: "AUFGABE",
    entityId: erstellte[0].id,
    aktion: "erstellt",
    neuerWert: erstellte.length > 1 ? `${erstellte[0].titel} (Serie, ${erstellte.length}×)` : erstellte[0].titel,
    geaendertVonId: person.id,
  });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}

export async function toggleAufgabe(id: string) {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return;
  if (person.rolle !== "ELTERN" && aufgabe.personId !== null && aufgabe.personId !== person.id) {
    throw new Error("Das ist nicht deine Aufgabe.");
  }
  const updated = await prisma.aufgabe.update({ where: { id }, data: { erledigt: !aufgabe.erledigt } });
  await logAenderung({
    entityTyp: "AUFGABE",
    entityId: id,
    aktion: updated.erledigt ? "erledigt" : "wieder offen",
    geaendertVonId: person.id,
  });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}

// scope "serie" löscht alle Aufgaben derselben Serie (Outlook-Stil-Rückfrage wie beim Kalender).
export async function deleteAufgabe(id: string, scope: "eins" | "serie" = "eins") {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return;
  if (person.rolle !== "ELTERN" && aufgabe.personId !== person.id) {
    throw new Error("Das darfst du nicht löschen.");
  }
  if (scope === "serie" && aufgabe.seriesId) {
    await prisma.aufgabe.deleteMany({ where: { seriesId: aufgabe.seriesId } });
    await logAenderung({ entityTyp: "AUFGABE", entityId: id, aktion: "geloescht", alterWert: `${aufgabe.titel} (ganze Serie)`, geaendertVonId: person.id });
  } else {
    await prisma.aufgabe.delete({ where: { id } });
    await logAenderung({ entityTyp: "AUFGABE", entityId: id, aktion: "geloescht", alterWert: aufgabe.titel, geaendertVonId: person.id });
  }
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}
