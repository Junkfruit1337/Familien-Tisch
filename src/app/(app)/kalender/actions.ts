"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneTerminKategorie } from "@/lib/terminkategorisierung";
import { erkenneTerminAusSprache, type ErkannterTermin } from "@/lib/spracheErkennung";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

// Sicherheitsgrenze gegen versehentliche Endlos-Serien (z. B. "täglich, bis 2099").
// Bei "Unbegrenzt" (kein Enddatum) wird pragmatisch bis zu diesem Horizont im Voraus
// angelegt statt echter unbegrenzter Wiederholung (analog Aufgaben, Fix-Batch 12).
const MAX_SERIEN_TERMINE = 200;
const UNBEGRENZT_HORIZONT_TAGE = 365 * 2;

function naechsterTermin(datum: Date, wiederholung: string): Date {
  const d = new Date(datum);
  if (wiederholung === "TAEGLICH") d.setDate(d.getDate() + 1);
  else if (wiederholung === "WOECHENTLICH") d.setDate(d.getDate() + 7);
  else if (wiederholung === "ZWEIWOECHENTLICH") d.setDate(d.getDate() + 14);
  else if (wiederholung === "MONATLICH") d.setMonth(d.getMonth() + 1);
  return d;
}

export async function listTermine() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? {}
      : { OR: [{ personId: person.id }, { personId: null }] };
  return prisma.termin.findMany({
    where,
    include: { person: true },
    orderBy: { start: "asc" },
  });
}

export async function listPersonenFuerFilter() {
  return prisma.person.findMany({ where: { aktiv: true }, orderBy: { reihenfolge: "asc" } });
}

// Aufgaben mit Fälligkeitsdatum sollen automatisch im Kalender erscheinen.
export async function listAufgabenMitFaelligkeit() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? { faelligkeit: { not: null } }
      : { faelligkeit: { not: null }, OR: [{ personId: person.id }, { personId: null }] };
  return prisma.aufgabe.findMany({
    where,
    include: { person: true },
    orderBy: { faelligkeit: "asc" },
  });
}

// Spracheingabe (Fragenkatalog Frage 25/51, Fix-Batch 19) — wandelt einen diktierten Text in
// Termin-Formularfelder um, die im Client noch geprüft/korrigiert werden müssen; es wird hier
// nichts gespeichert. Fehler werden abgefangen und als Ergebnis-Objekt zurückgegeben statt
// geworfen, damit die echte Meldung den Nutzer erreicht (siehe Fix-Batch 19, Rezept-Foto-Fehler).
export async function erkenneTerminAusText(
  text: string
): Promise<{ ok: true; termin: ErkannterTermin } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const personen = await prisma.person.findMany({ where: { aktiv: true }, select: { id: true, name: true } });
    const termin = await erkenneTerminAusSprache(text, personen);
    return { ok: true, termin };
  } catch (err) {
    console.error("Spracheingabe (Termin) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// personIds: leer = Familie (alle). Für mehrere ausgewählte Personen wird pro Person eine
// eigene Zeile (bzw. eigene Serie) angelegt — analog dem bereits bestehenden Muster bei
// Schul-Einträgen (createSchulEintrag), damit jede Person ihre Zuweisung unabhängig
// bearbeiten/löschen kann (Fix-Batch 23: "für mehrere Personen gleichzeitig").
export async function createTermin(data: {
  titel: string;
  start: string;
  ende?: string;
  ganztaegig: boolean;
  personIds: string[];
  wiederholung?: string;
  wiederholungBis?: string;
}) {
  const person = await requirePerson();
  const zielIds: (string | null)[] =
    person.rolle === "ELTERN" ? (data.personIds.length > 0 ? data.personIds : [null]) : [person.id];
  // Kategorie wird nicht mehr manuell ausgewählt, sondern serverseitig erkannt
  // (Fragenkatalog Frage 3: "die App soll das selbst erkennen/zuordnen").
  const kategorie = erkenneTerminKategorie(data.titel);

  const wiederholung = data.wiederholung && data.wiederholung !== "KEINE" ? data.wiederholung : "KEINE";
  const unbegrenzt = wiederholung !== "KEINE" && !data.wiederholungBis;
  const horizont = new Date();
  horizont.setDate(horizont.getDate() + UNBEGRENZT_HORIZONT_TAGE);
  const wiederholungBis = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : null) : null;
  const grenze = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : horizont) : null;

  const startDaten: Date[] = [new Date(data.start)];
  if (wiederholung !== "KEINE" && grenze) {
    let naechster = naechsterTermin(startDaten[0], wiederholung);
    while (naechster <= grenze && startDaten.length < MAX_SERIEN_TERMINE) {
      startDaten.push(naechster);
      naechster = naechsterTermin(naechster, wiederholung);
    }
  }

  const enDauer = data.ende ? new Date(data.ende).getTime() - new Date(data.start).getTime() : null;

  const erstellte = [];
  for (const personId of zielIds) {
    const seriesId = wiederholung !== "KEINE" ? randomUUID() : null;
    for (const start of startDaten) {
      const termin = await prisma.termin.create({
        data: {
          titel: data.titel,
          start,
          ende: enDauer !== null ? new Date(start.getTime() + enDauer) : null,
          ganztaegig: data.ganztaegig,
          kategorie,
          personId,
          seriesId,
          wiederholung: wiederholung as any,
          wiederholungBis: unbegrenzt ? null : wiederholungBis,
          erstelltVonId: person.id,
        },
      });
      erstellte.push(termin);
    }
  }

  await logAenderung({
    entityTyp: "TERMIN",
    entityId: erstellte[0].id,
    aktion: "erstellt",
    neuerWert: erstellte.length > 1 ? `${erstellte[0].titel} (${erstellte.length}×)` : erstellte[0].titel,
    geaendertVonId: person.id,
  });

  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  return erstellte[0];
}

export async function updateTermin(id: string, data: { titel: string; start: string; ende?: string; personId: string | null }) {
  const person = await requirePerson();
  const termin = await prisma.termin.findUnique({ where: { id } });
  if (!termin) return;
  if (person.rolle !== "ELTERN" && termin.personId !== person.id) {
    throw new Error("Das darfst du nicht bearbeiten.");
  }
  const personId = person.rolle === "ELTERN" ? data.personId : person.id;
  const kategorie = erkenneTerminKategorie(data.titel);
  await prisma.termin.update({
    where: { id },
    data: {
      titel: data.titel,
      start: new Date(data.start),
      ende: data.ende ? new Date(data.ende) : null,
      kategorie,
      personId,
    },
  });
  await logAenderung({
    entityTyp: "TERMIN",
    entityId: id,
    aktion: "geaendert",
    alterWert: termin.titel,
    neuerWert: data.titel,
    geaendertVonId: person.id,
  });
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
}

// scope "serie" löscht alle Termine derselben Serie (Outlook-Stil-Rückfrage, Fragenkatalog Frage 2).
export async function deleteTermin(id: string, scope: "eins" | "serie" = "eins") {
  const person = await requirePerson();
  const termin = await prisma.termin.findUnique({ where: { id } });
  if (!termin) return;
  if (person.rolle !== "ELTERN" && termin.personId !== person.id) {
    throw new Error("Das darfst du nicht löschen.");
  }
  if (scope === "serie" && termin.seriesId) {
    await prisma.termin.deleteMany({ where: { seriesId: termin.seriesId } });
    await logAenderung({
      entityTyp: "TERMIN",
      entityId: id,
      aktion: "geloescht",
      alterWert: `${termin.titel} (ganze Serie)`,
      geaendertVonId: person.id,
    });
  } else {
    await prisma.termin.delete({ where: { id } });
    await logAenderung({
      entityTyp: "TERMIN",
      entityId: id,
      aktion: "geloescht",
      alterWert: termin.titel,
      geaendertVonId: person.id,
    });
  }
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
}

// Schul-Einträge (Klassenarbeiten/HÜ-Kontrollen) erscheinen automatisch im Kalender (read-only).
export async function listSchulEintraegeFuerKalender() {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? {} : { personId: person.id };
  return prisma.schulEintrag.findMany({ where, include: { person: true }, orderBy: { datum: "asc" } });
}

