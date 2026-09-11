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
  else if (wiederholung === "WERKTAEGLICH") {
    // Fix-Batch 30: Mo–Fr — Samstag/Sonntag überspringen.
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
  } else if (wiederholung === "WOECHENTLICH") d.setDate(d.getDate() + 7);
  else if (wiederholung === "ZWEIWOECHENTLICH") d.setDate(d.getDate() + 14);
  else if (wiederholung === "MONATLICH") d.setMonth(d.getMonth() + 1);
  else if (wiederholung === "ALLE_3_MONATE") d.setMonth(d.getMonth() + 3);
  else if (wiederholung === "JAEHRLICH") d.setFullYear(d.getFullYear() + 1);
  return d;
}

// Fasst mehrere Personen-Zeilen desselben Anlege-Vorgangs (gemeinsame gruppeId + gleicher
// Zeitpunkt) zu einem Anzeige-Eintrag zusammen (Fix-Batch 30) — ein Termin für mehrere
// Personen erscheint dadurch im Kalender nur einmal, mit allen betroffenen Personen.
export async function listTermine() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? {}
      : { OR: [{ personId: person.id }, { personId: null }] };
  const rows = await prisma.termin.findMany({
    where,
    include: { person: true },
    orderBy: { start: "asc" },
  });

  const gruppen = new Map<string, typeof rows>();
  const einzelne: typeof rows = [];
  for (const row of rows) {
    if (row.gruppeId) {
      const key = `${row.gruppeId}|${row.start.getTime()}`;
      const liste = gruppen.get(key);
      if (liste) liste.push(row);
      else gruppen.set(key, [row]);
    } else {
      einzelne.push(row);
    }
  }

  const ergebnis = [
    ...einzelne.map((r) => ({
      id: r.id,
      ids: [r.id],
      titel: r.titel,
      start: r.start,
      ende: r.ende,
      ganztaegig: r.ganztaegig,
      kategorie: r.kategorie,
      seriesId: r.seriesId,
      gruppeId: r.gruppeId,
      erstelltVonId: r.erstelltVonId,
      personen: r.person ? [r.person] : [],
    })),
    ...[...gruppen.values()].map((liste) => ({
      id: liste[0].id,
      ids: liste.map((r) => r.id),
      titel: liste[0].titel,
      start: liste[0].start,
      ende: liste[0].ende,
      ganztaegig: liste[0].ganztaegig,
      kategorie: liste[0].kategorie,
      seriesId: liste[0].seriesId,
      gruppeId: liste[0].gruppeId,
      erstelltVonId: liste[0].erstelltVonId,
      personen: liste.filter((r) => r.person).map((r) => r.person!),
    })),
  ];

  return ergebnis.sort((a, b) => a.start.getTime() - b.start.getTime());
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

// Geburtstage aller aktiven Familienmitglieder (Fix-Batch 30) — erscheinen bei JEDEM im
// Kalender, nicht nur bei der Person selbst ("die ganze Familie soll informiert sein").
// Pragmatischer Horizont statt echter Ewigkeits-Wiederholung (analog Termin-/Aufgaben-Serien).
export async function listGeburtstageFuerKalender() {
  await requirePerson();
  const personen = await prisma.person.findMany({ where: { aktiv: true, geburtsdatum: { not: null } } });
  const heute = new Date();
  const eintraege: { id: string; titel: string; start: Date; personName: string; personFarbe: string }[] = [];
  for (const p of personen) {
    if (!p.geburtsdatum) continue;
    const monat = p.geburtsdatum.getUTCMonth();
    const tag = p.geburtsdatum.getUTCDate();
    for (let jahr = heute.getFullYear() - 1; jahr <= heute.getFullYear() + 5; jahr++) {
      eintraege.push({
        id: `geburtstag-${p.id}-${jahr}`,
        titel: `🎂 ${p.name} hat Geburtstag`,
        start: new Date(Date.UTC(jahr, monat, tag)),
        personName: p.name,
        personFarbe: p.farbe,
      });
    }
  }
  return eintraege;
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
// bearbeiten/löschen kann (Fix-Batch 23: "für mehrere Personen gleichzeitig"). Alle Zeilen
// EINES Anlege-Vorgangs teilen sich eine gruppeId (Fix-Batch 30), damit sie im Kalender als
// EIN Eintrag mit allen Personen erscheinen statt dupliziert.
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
  const gruppeId = zielIds.length > 1 ? randomUUID() : null;
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
          gruppeId,
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

// Personen-Zuweisung ist nach dem Anlegen nicht mehr änderbar (Fix-Batch 30) — dafür bitte
// löschen und neu anlegen; das vereinfacht das Bearbeiten von Mehrfach-Personen-Terminen
// (jede Zeile der Gruppe wird beim Bearbeiten einzeln mit denselben Titel-/Zeit-Werten
// aktualisiert, ohne ihre individuelle Personen-Zuordnung anzufassen).
export async function updateTermin(id: string, data: { titel: string; start: string; ende?: string }) {
  const person = await requirePerson();
  const termin = await prisma.termin.findUnique({ where: { id } });
  if (!termin) return;
  if (person.rolle !== "ELTERN" && termin.personId !== person.id) {
    throw new Error("Das darfst du nicht bearbeiten.");
  }
  const kategorie = erkenneTerminKategorie(data.titel);
  await prisma.termin.update({
    where: { id },
    data: {
      titel: data.titel,
      start: new Date(data.start),
      ende: data.ende ? new Date(data.ende) : null,
      kategorie,
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
// Fix-Batch 30: (1) Kinder dürfen nur noch selbst angelegte Termine löschen (vorher reichte
// es, dass der Termin ihnen zugewiesen war — auch von Eltern gesetzte Termine ließen sich so
// löschen). (2) Ein Mehrfach-Personen-Termin (gruppeId) wird als Gruppe gelöscht: "eins"
// entfernt alle Personen-Zeilen dieses Zeitpunkts, "serie" alle Zeilen/Zeitpunkte der Gruppe.
export async function deleteTermin(id: string, scope: "eins" | "serie" = "eins") {
  const person = await requirePerson();
  const termin = await prisma.termin.findUnique({ where: { id } });
  if (!termin) return;
  if (person.rolle !== "ELTERN" && termin.erstelltVonId !== person.id) {
    throw new Error("Das darfst du nicht löschen — nur selbst angelegte Termine.");
  }
  if (scope === "serie") {
    const where = termin.gruppeId ? { gruppeId: termin.gruppeId } : termin.seriesId ? { seriesId: termin.seriesId } : { id };
    await prisma.termin.deleteMany({ where });
    await logAenderung({
      entityTyp: "TERMIN",
      entityId: id,
      aktion: "geloescht",
      alterWert: `${termin.titel} (ganze Serie)`,
      geaendertVonId: person.id,
    });
  } else if (termin.gruppeId) {
    await prisma.termin.deleteMany({ where: { gruppeId: termin.gruppeId, start: termin.start } });
    await logAenderung({ entityTyp: "TERMIN", entityId: id, aktion: "geloescht", alterWert: termin.titel, geaendertVonId: person.id });
  } else {
    await prisma.termin.delete({ where: { id } });
    await logAenderung({ entityTyp: "TERMIN", entityId: id, aktion: "geloescht", alterWert: termin.titel, geaendertVonId: person.id });
  }
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
}

// Schul-Einträge (Klassenarbeiten/HÜ-Kontrollen) erscheinen automatisch im Kalender (read-only).
export async function listSchulEintraegeFuerKalender() {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? {} : { personId: person.id };
  return prisma.schulEintrag.findMany({ where, include: { person: true, fach: true }, orderBy: { datum: "asc" } });
}
