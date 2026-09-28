"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneAufgabeAusSprache, type ErkannteAufgabe } from "@/lib/spracheErkennung";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

// Sicherheitsgrenze gegen versehentliche Endlos-Serien — analog Kalender (Fix-Batch 7).
// Bei "Unbegrenzt" (kein Enddatum gewählt) wird pragmatisch bis zu diesem Zeit-/Stück-Horizont
// im Voraus angelegt statt echter unbegrenzter Wiederholung, die eine laufende Hintergrund-
// Erzeugung bräuchte (bewusst in Kauf genommene, dokumentierte Vereinfachung).
const MAX_SERIEN_AUFGABEN = 200;
const UNBEGRENZT_HORIZONT_TAGE = 365 * 2;

function letzterTagDesMonats(jahr: number, monatNullBasiert: number): number {
  return new Date(jahr, monatNullBasiert + 1, 0).getDate();
}

// Fix-Batch 149 (Audit-Fund): `setMonth`/`setFullYear` auf einen Tag, den der Zielmonat nicht
// hat, ließ JS automatisch in den übernächsten Monat überlaufen (z. B. "31. Jan" + 1 Monat →
// nicht Ende Februar, sondern automatisch der 2./3. März, weil Februar keinen 31. Tag hat) —
// und weil jede Iteration nur den zuletzt berechneten (ggf. schon verschobenen) Tag kannte,
// verschob sich danach die GANZE restliche Serie dauerhaft. `ankerTag` ist deshalb immer der
// Tag des ALLERERSTEN Serien-Termins, nicht der zuletzt berechnete — jeder Sprung geht vom
// Ankertag aus, geklemmt auf den letzten Tag des jeweiligen Zielmonats.
function naechsteAufgabe(datum: Date, wiederholung: string, ankerTag: number): Date {
  const d = new Date(datum);
  if (wiederholung === "TAEGLICH") d.setDate(d.getDate() + 1);
  else if (wiederholung === "WERKTAEGLICH") {
    // Fix-Batch 30: Mo–Fr — Samstag/Sonntag überspringen.
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
  } else if (wiederholung === "WOECHENTLICH") d.setDate(d.getDate() + 7);
  else if (wiederholung === "ZWEIWOECHENTLICH") d.setDate(d.getDate() + 14);
  else if (wiederholung === "MONATLICH" || wiederholung === "ALLE_3_MONATE" || wiederholung === "JAEHRLICH") {
    const schritt = wiederholung === "JAEHRLICH" ? 12 : wiederholung === "ALLE_3_MONATE" ? 3 : 1;
    d.setDate(1); // verhindert Monatsüberlauf während der Verschiebung
    d.setMonth(d.getMonth() + schritt);
    d.setDate(Math.min(ankerTag, letzterTagDesMonats(d.getFullYear(), d.getMonth())));
  }
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

// Spracheingabe (Fragenkatalog Frage 25/51, Fix-Batch 19) — wandelt einen diktierten Text in
// Aufgaben-Formularfelder um, die im Client noch geprüft/korrigiert werden müssen; es wird hier
// nichts gespeichert. Fehler werden abgefangen und als Ergebnis-Objekt zurückgegeben statt
// geworfen, damit die echte Meldung den Nutzer erreicht (siehe Fix-Batch 19, Rezept-Foto-Fehler).
export async function erkenneAufgabeAusText(
  text: string
): Promise<{ ok: true; aufgabe: ErkannteAufgabe } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const personen = await prisma.person.findMany({ where: { aktiv: true }, select: { id: true, name: true } });
    const aufgabe = await erkenneAufgabeAusSprache(text, personen);
    return { ok: true, aufgabe };
  } catch (err) {
    console.error("Spracheingabe (Aufgabe) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// personIds: leer = Familie (alle). Für mehrere ausgewählte Personen wird pro Person eine
// eigene Zeile (bzw. eigene Serie) angelegt — analog Termine/Schul-Einträge (Fix-Batch 23).
export async function createAufgabe(data: {
  titel: string;
  faelligkeit?: string;
  personIds: string[];
  wiederholung?: string;
  wiederholungBis?: string; // leer/undefined bei "Unbegrenzt"
}): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requirePerson();
  try {
  const zielIds: (string | null)[] =
    person.rolle === "ELTERN" ? (data.personIds.length > 0 ? data.personIds : [null]) : [person.id];

  const wiederholung = data.wiederholung && data.wiederholung !== "KEINE" && data.faelligkeit ? data.wiederholung : "KEINE";
  const unbegrenzt = wiederholung !== "KEINE" && !data.wiederholungBis;
  const horizont = new Date();
  horizont.setDate(horizont.getDate() + UNBEGRENZT_HORIZONT_TAGE);
  const wiederholungBis = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : null) : null;
  const grenze = wiederholung !== "KEINE" ? (data.wiederholungBis ? new Date(data.wiederholungBis) : horizont) : null;

  const ersteFaelligkeit = data.faelligkeit ? new Date(data.faelligkeit) : null;
  const faelligkeitsDaten: (Date | null)[] = [ersteFaelligkeit];
  if (wiederholung !== "KEINE" && grenze && ersteFaelligkeit) {
    const ankerTag = ersteFaelligkeit.getDate();
    let naechste = naechsteAufgabe(ersteFaelligkeit, wiederholung, ankerTag);
    while (naechste <= grenze && faelligkeitsDaten.length < MAX_SERIEN_AUFGABEN) {
      faelligkeitsDaten.push(naechste);
      naechste = naechsteAufgabe(naechste, wiederholung, ankerTag);
    }
  }

  const erstellte = [];
  for (const personId of zielIds) {
    const seriesId = wiederholung !== "KEINE" ? randomUUID() : null;
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
  }

  await logAenderung({
    entityTyp: "AUFGABE",
    entityId: erstellte[0].id,
    aktion: "erstellt",
    neuerWert: erstellte.length > 1 ? `${erstellte[0].titel} (${erstellte.length}×)` : erstellte[0].titel,
    geaendertVonId: person.id,
  });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
  return { ok: true };
  } catch (err) {
    // Fix-Batch 151 (Audit-Fund): kein try/catch um den gesamten Erstellungsvorgang — ein
    // DB-Fehler mitten in der Schleife (z. B. bei einer großen Serie) hätte bisher unbehandelt
    // durchgeschlagen und wäre in Produktion nur als generische, redaktierte Meldung
    // angekommen.
    console.error("createAufgabe fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen der Aufgabe.";
    return { ok: false, fehler };
  }
}

export async function toggleAufgabe(id: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return { ok: false, fehler: "Aufgabe nicht gefunden." };
  // Fix-Batch 149 (Audit-Fund): rohes throw statt {ok,fehler} — betrifft z. B. den Fall, dass
  // eine familienweite Aufgabe zwischenzeitlich einer bestimmten Person zugewiesen wurde.
  if (person.rolle !== "ELTERN" && aufgabe.personId !== null && aufgabe.personId !== person.id) {
    return { ok: false, fehler: "Das ist nicht deine Aufgabe." };
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
  return { ok: true };
}

// scope "serie" löscht alle Aufgaben derselben Serie (Outlook-Stil-Rückfrage wie beim Kalender).
// Fix-Batch 30: Kinder dürfen nur noch selbst angelegte Aufgaben löschen (vorher reichte es,
// dass die Aufgabe ihnen zugewiesen war — auch von Eltern gesetzte Aufgaben ließen sich so
// löschen), analog derselben Korrektur bei Terminen.
export async function deleteAufgabe(id: string, scope: "eins" | "serie" = "eins"): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return { ok: false, fehler: "Aufgabe nicht gefunden." };
  // Fix-Batch 149 (Audit-Fund): rohes throw statt {ok,fehler} — genau dieser Fall trat live
  // auf, weil der Löschen-Button clientseitig auf `personId` statt `erstelltVonId` prüfte
  // (siehe Fix in AufgabenClient.tsx) und dadurch sichtbar war, wo der Server ablehnt.
  if (person.rolle !== "ELTERN" && aufgabe.erstelltVonId !== person.id) {
    return { ok: false, fehler: "Das darfst du nicht löschen — nur selbst angelegte Aufgaben." };
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
  return { ok: true };
}
