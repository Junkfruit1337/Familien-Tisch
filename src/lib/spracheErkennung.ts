import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type PersonFuerSprache = { id: string; name: string };

export type ErkannterTermin = {
  titel: string;
  datum: string | null; // JJJJ-MM-TT
  uhrzeit: string | null; // HH:MM
  personId: string | null;
  wiederholung: "KEINE" | "TAEGLICH" | "WOECHENTLICH" | "ZWEIWOECHENTLICH" | "MONATLICH";
  wiederholungBis: string | null; // JJJJ-MM-TT, null = unbegrenzt (falls wiederholung != KEINE)
};

export type ErkannteAufgabe = {
  titel: string;
  datum: string | null;
  personId: string | null;
  wiederholung: "KEINE" | "TAEGLICH" | "WOECHENTLICH" | "ZWEIWOECHENTLICH" | "MONATLICH";
  wiederholungBis: string | null;
};

const WIEDERHOLUNG_WERTE = ["KEINE", "TAEGLICH", "WOECHENTLICH", "ZWEIWOECHENTLICH", "MONATLICH"];

// Aktuelles Datum als Kontext für relative Angaben ("morgen", "nächsten Montag" etc.),
// in der Zeitzone der Familie statt der Server-Zeitzone.
function heutigerKontext(): string {
  const jetzt = new Date();
  const wochentag = jetzt.toLocaleDateString("de-DE", { weekday: "long", timeZone: "Europe/Berlin" });
  const datum = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  return `Heute ist ${wochentag}, der ${datum} (Format JJJJ-MM-TT).`;
}

async function rufeSpracheNluAuf(prompt: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen).");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text ?? "";
  const bereinigt = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(bereinigt) as Record<string, unknown>;
  } catch {
    throw new Error("Konnte die Spracheingabe nicht verarbeiten. Bitte erneut versuchen oder die Felder manuell ausfüllen.");
  }
}

function leseWiederholung(d: Record<string, unknown>): ErkannterTermin["wiederholung"] {
  return typeof d.wiederholung === "string" && WIEDERHOLUNG_WERTE.includes(d.wiederholung)
    ? (d.wiederholung as ErkannterTermin["wiederholung"])
    : "KEINE";
}

function leseDatumsfeld(wert: unknown): string | null {
  return typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : null;
}

export async function erkenneTerminAusSprache(text: string, personen: PersonFuerSprache[]): Promise<ErkannterTermin> {
  const personenListe = personen.length > 0 ? personen.map((p) => `${p.id} = ${p.name}`).join(", ") : "(keine Personen bekannt)";
  const prompt =
    `${heutigerKontext()}\n` +
    `Ein Familienmitglied hat per Spracheingabe folgenden Kalender-Termin diktiert:\n"${text}"\n\n` +
    `Bekannte Personen (ID = Name): ${personenListe}\n\n` +
    "Extrahiere die Termin-Angaben und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"titel": "kurzer prägnanter Titel", "datum": "JJJJ-MM-TT", "uhrzeit": "HH:MM oder null, falls keine Uhrzeit genannt wurde", ' +
    '"personId": "eine ID aus der Liste oder null, falls niemand Bestimmtes genannt wurde", ' +
    '"wiederholung": "KEINE oder TAEGLICH oder WOECHENTLICH oder ZWEIWOECHENTLICH oder MONATLICH", ' +
    '"wiederholungBis": "JJJJ-MM-TT oder null (null bedeutet unbegrenzt, nur relevant falls wiederholung nicht KEINE ist)"}\n' +
    "Rechne relative Datumsangaben (\"morgen\", \"übermorgen\", \"nächsten Montag\", \"in zwei Wochen\") anhand des heutigen Datums in ein konkretes Datum um. " +
    "Wenn kein Datum erkennbar ist, nimm das heutige Datum.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    titel: typeof d.titel === "string" && d.titel.trim() ? d.titel.trim() : text.trim(),
    datum: leseDatumsfeld(d.datum),
    uhrzeit: typeof d.uhrzeit === "string" && /^\d{1,2}:\d{2}$/.test(d.uhrzeit) ? d.uhrzeit : null,
    personId: typeof d.personId === "string" && personen.some((p) => p.id === d.personId) ? d.personId : null,
    wiederholung: leseWiederholung(d),
    wiederholungBis: leseDatumsfeld(d.wiederholungBis),
  };
}

export async function erkenneAufgabeAusSprache(text: string, personen: PersonFuerSprache[]): Promise<ErkannteAufgabe> {
  const personenListe = personen.length > 0 ? personen.map((p) => `${p.id} = ${p.name}`).join(", ") : "(keine Personen bekannt)";
  const prompt =
    `${heutigerKontext()}\n` +
    `Ein Familienmitglied hat per Spracheingabe folgende Aufgabe diktiert:\n"${text}"\n\n` +
    `Bekannte Personen (ID = Name): ${personenListe}\n\n` +
    "Extrahiere die Aufgaben-Angaben und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"titel": "kurzer prägnanter Titel", "datum": "JJJJ-MM-TT oder null, falls kein Fälligkeitsdatum genannt wurde", ' +
    '"personId": "eine ID aus der Liste oder null, falls niemand Bestimmtes genannt wurde", ' +
    '"wiederholung": "KEINE oder TAEGLICH oder WOECHENTLICH oder ZWEIWOECHENTLICH oder MONATLICH", ' +
    '"wiederholungBis": "JJJJ-MM-TT oder null (null bedeutet unbegrenzt, nur relevant falls wiederholung nicht KEINE ist)"}\n' +
    "Rechne relative Datumsangaben (\"morgen\", \"übermorgen\", \"nächsten Montag\", \"in zwei Wochen\") anhand des heutigen Datums in ein konkretes Datum um. " +
    "Wenn erkennbar keine Fälligkeit gemeint ist, lass \"datum\" auf null.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    titel: typeof d.titel === "string" && d.titel.trim() ? d.titel.trim() : text.trim(),
    datum: leseDatumsfeld(d.datum),
    personId: typeof d.personId === "string" && personen.some((p) => p.id === d.personId) ? d.personId : null,
    wiederholung: leseWiederholung(d),
    wiederholungBis: leseDatumsfeld(d.wiederholungBis),
  };
}
