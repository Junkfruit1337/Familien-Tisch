import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type PersonFuerSprache = { id: string; name: string };

export type ErkannterTermin = {
  titel: string;
  datum: string | null; // JJJJ-MM-TT
  uhrzeit: string | null; // HH:MM
  personIds: string[]; // leer = niemand Bestimmtes genannt/Familie
  wiederholung: "KEINE" | "TAEGLICH" | "WOECHENTLICH" | "ZWEIWOECHENTLICH" | "MONATLICH";
  wiederholungBis: string | null; // JJJJ-MM-TT, null = unbegrenzt (falls wiederholung != KEINE)
};

export type ErkannteAufgabe = {
  titel: string;
  datum: string | null;
  personIds: string[]; // leer = niemand Bestimmtes genannt/Familie
  wiederholung: "KEINE" | "TAEGLICH" | "WOECHENTLICH" | "ZWEIWOECHENTLICH" | "MONATLICH";
  wiederholungBis: string | null;
};

export type ErkannteNote = {
  fachId: string | null;
  art: "KLASSENARBEIT" | "HAUSAUFGABEN_KONTROLLE" | "EPOCHALNOTE";
  note: number | null;
  datum: string | null; // JJJJ-MM-TT, null = heute (Client setzt Default)
  notiz: string | null;
};

export type ErkanntesTicket = {
  titel: string;
  beschreibung: string;
};

export type ErkannterArtikel = {
  name: string;
  menge: string | null;
};

export type ErkannterSchulEintrag = {
  fachId: string | null;
  thema: string;
  art: "KLASSENARBEIT" | "HAUSAUFGABEN_KONTROLLE" | "EPOCHALNOTE";
  datum: string | null; // JJJJ-MM-TT, null = heute
  personIds: string[]; // leer = konnte kein Kind erkannt werden (Client fällt auf aktuell gewähltes Kind zurück)
};

export type FachDuplikatPruefung = {
  istVermutlichDuplikat: boolean;
  aehnlichesFach: string | null;
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

function lesePersonIds(wert: unknown, personen: PersonFuerSprache[]): string[] {
  if (!Array.isArray(wert)) return [];
  return wert.filter((id): id is string => typeof id === "string" && personen.some((p) => p.id === id));
}

export async function erkenneTerminAusSprache(text: string, personen: PersonFuerSprache[]): Promise<ErkannterTermin> {
  const personenListe = personen.length > 0 ? personen.map((p) => `${p.id} = ${p.name}`).join(", ") : "(keine Personen bekannt)";
  const prompt =
    `${heutigerKontext()}\n` +
    `Ein Familienmitglied hat per Spracheingabe folgenden Kalender-Termin diktiert:\n"${text}"\n\n` +
    `Bekannte Personen (ID = Name): ${personenListe}\n\n` +
    "Extrahiere die Termin-Angaben und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"titel": "kurzer prägnanter Titel", "datum": "JJJJ-MM-TT", "uhrzeit": "HH:MM oder null, falls keine Uhrzeit genannt wurde", ' +
    '"personIds": ["eine oder mehrere IDs aus der Liste — leeres Array, falls niemand Bestimmtes/die ganze Familie gemeint ist"], ' +
    '"wiederholung": "KEINE oder TAEGLICH oder WOECHENTLICH oder ZWEIWOECHENTLICH oder MONATLICH", ' +
    '"wiederholungBis": "JJJJ-MM-TT oder null (null bedeutet unbegrenzt, nur relevant falls wiederholung nicht KEINE ist)"}\n' +
    "Wenn mehrere Personen genannt werden (z. B. \"Termin für Emma und Emil\"), gib alle passenden IDs in personIds an. " +
    "Rechne relative Datumsangaben (\"morgen\", \"übermorgen\", \"nächsten Montag\", \"in zwei Wochen\") anhand des heutigen Datums in ein konkretes Datum um. " +
    "Wenn kein Datum erkennbar ist, nimm das heutige Datum.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    titel: typeof d.titel === "string" && d.titel.trim() ? d.titel.trim() : text.trim(),
    datum: leseDatumsfeld(d.datum),
    uhrzeit: typeof d.uhrzeit === "string" && /^\d{1,2}:\d{2}$/.test(d.uhrzeit) ? d.uhrzeit : null,
    personIds: lesePersonIds(d.personIds, personen),
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
    '"personIds": ["eine oder mehrere IDs aus der Liste — leeres Array, falls niemand Bestimmtes/die ganze Familie gemeint ist"], ' +
    '"wiederholung": "KEINE oder TAEGLICH oder WOECHENTLICH oder ZWEIWOECHENTLICH oder MONATLICH", ' +
    '"wiederholungBis": "JJJJ-MM-TT oder null (null bedeutet unbegrenzt, nur relevant falls wiederholung nicht KEINE ist)"}\n' +
    "Wenn mehrere Personen genannt werden (z. B. \"Aufgabe für Emma und Emil\"), gib alle passenden IDs in personIds an. " +
    "Rechne relative Datumsangaben (\"morgen\", \"übermorgen\", \"nächsten Montag\", \"in zwei Wochen\") anhand des heutigen Datums in ein konkretes Datum um. " +
    "Wenn erkennbar keine Fälligkeit gemeint ist, lass \"datum\" auf null.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    titel: typeof d.titel === "string" && d.titel.trim() ? d.titel.trim() : text.trim(),
    datum: leseDatumsfeld(d.datum),
    personIds: lesePersonIds(d.personIds, personen),
    wiederholung: leseWiederholung(d),
    wiederholungBis: leseDatumsfeld(d.wiederholungBis),
  };
}

const NOTE_ART_WERTE = ["KLASSENARBEIT", "HAUSAUFGABEN_KONTROLLE", "EPOCHALNOTE"];

// Spracheingabe fürs Noten-Formular (Fix-Batch 26 — Florians Wunsch, Spracheingabe auch
// für weitere Mehrfeld-Formulare anzubieten, nicht nur Termine/Aufgaben).
export async function erkenneNoteAusSprache(text: string, faecher: { id: string; name: string }[]): Promise<ErkannteNote> {
  const faecherListe = faecher.length > 0 ? faecher.map((f) => `${f.id} = ${f.name}`).join(", ") : "(keine Fächer bekannt)";
  const prompt =
    `${heutigerKontext()}\n` +
    `Ein Familienmitglied hat per Spracheingabe folgende Schulnote diktiert:\n"${text}"\n\n` +
    `Bekannte Fächer dieses Kindes (ID = Name): ${faecherListe}\n\n` +
    "Extrahiere die Noten-Angaben und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"fachId": "eine ID aus der Liste oder null, falls kein passendes Fach erkennbar ist", ' +
    '"art": "KLASSENARBEIT oder HAUSAUFGABEN_KONTROLLE oder EPOCHALNOTE (Standard: KLASSENARBEIT, falls nichts erkennbar)", ' +
    '"note": "Zahl von 1 bis 6, oder null falls nicht erkennbar", ' +
    '"datum": "JJJJ-MM-TT oder null, falls kein Datum genannt wurde (dann gilt heute)", ' +
    '"notiz": "kurze zusätzliche Anmerkung oder null, falls keine erkennbar ist"}\n' +
    "Rechne relative Datumsangaben (\"heute\", \"gestern\", \"letzten Montag\") anhand des heutigen Datums in ein konkretes Datum um.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    fachId: typeof d.fachId === "string" && faecher.some((f) => f.id === d.fachId) ? d.fachId : null,
    art: typeof d.art === "string" && NOTE_ART_WERTE.includes(d.art) ? (d.art as ErkannteNote["art"]) : "KLASSENARBEIT",
    note: typeof d.note === "number" && d.note >= 1 && d.note <= 6 ? Math.round(d.note) : null,
    datum: leseDatumsfeld(d.datum),
    notiz: typeof d.notiz === "string" && d.notiz.trim() ? d.notiz.trim() : null,
  };
}

// Spracheingabe für "Fehler melden"/Verbesserungsvorschläge (Fix-Batch 26) — formt einen
// frei gesprochenen Bericht in einen kurzen Titel + eine ausformulierte Beschreibung um.
export async function erkenneTicketAusSprache(text: string): Promise<ErkanntesTicket> {
  const prompt =
    `Ein Familienmitglied hat per Spracheingabe folgenden Fehler/Verbesserungsvorschlag zur Familientisch-App diktiert:\n"${text}"\n\n` +
    "Fasse das in einen kurzen, prägnanten Titel (wenige Worte) und eine vollständige, klare Beschreibung (ganze Sätze, alle genannten Details) um. " +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"titel": "kurzer Titel", "beschreibung": "ausformulierte Beschreibung"}';

  const d = await rufeSpracheNluAuf(prompt);
  return {
    titel: typeof d.titel === "string" && d.titel.trim() ? d.titel.trim() : text.trim().slice(0, 60),
    beschreibung: typeof d.beschreibung === "string" && d.beschreibung.trim() ? d.beschreibung.trim() : text.trim(),
  };
}

// Spracheingabe für "Artikel hinzufügen" / Einkaufs-Wunsch (Fix-Batch 30) — trennt
// Artikelname und Menge aus einem frei gesprochenen Satz wie "wir brauchen noch 2 Kilo Mehl".
export async function erkenneArtikelAusSprache(text: string): Promise<ErkannterArtikel> {
  const prompt =
    `Ein Familienmitglied hat per Spracheingabe folgenden Einkaufsliste-Artikel diktiert:\n"${text}"\n\n` +
    "Extrahiere den Artikelnamen und, falls genannt, die Menge. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, " +
    "ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"name": "Artikelname", "menge": "Menge inkl. Einheit, z.B. \'2 kg\' oder null, falls keine Menge genannt wurde"}';

  const d = await rufeSpracheNluAuf(prompt);
  return {
    name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : text.trim(),
    menge: typeof d.menge === "string" && d.menge.trim() ? d.menge.trim() : null,
  };
}

const SCHUL_ART_WERTE = ["KLASSENARBEIT", "HAUSAUFGABEN_KONTROLLE", "EPOCHALNOTE"];

// Spracheingabe für Klassenarbeiten/HÜ-Kontrollen (Fix-Batch 30) — erkennt Fach (gegen die
// Fächerliste des jeweiligen Kindes), Thema, Art und Datum aus dem gesprochenen Text.
export async function erkenneSchulEintragAusSprache(
  text: string,
  faecher: { id: string; name: string }[],
  personen: PersonFuerSprache[]
): Promise<ErkannterSchulEintrag> {
  const faecherListe = faecher.length > 0 ? faecher.map((f) => `${f.id} = ${f.name}`).join(", ") : "(keine Fächer bekannt)";
  const personenListe = personen.length > 0 ? personen.map((p) => `${p.id} = ${p.name}`).join(", ") : "(keine Personen bekannt)";
  const prompt =
    `${heutigerKontext()}\n` +
    `Ein Familienmitglied hat per Spracheingabe folgende Klassenarbeit/HÜ-Kontrolle diktiert:\n"${text}"\n\n` +
    `Bekannte Fächer (ID = Name): ${faecherListe}\n` +
    `Bekannte Kinder (ID = Name): ${personenListe}\n\n` +
    "Extrahiere die Angaben und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"fachId": "eine ID aus der Fächerliste oder null", ' +
    '"thema": "worum es geht, kurz und prägnant", ' +
    '"art": "KLASSENARBEIT oder HAUSAUFGABEN_KONTROLLE oder EPOCHALNOTE (Standard: KLASSENARBEIT)", ' +
    '"datum": "JJJJ-MM-TT oder null, falls kein Datum genannt wurde", ' +
    '"personIds": ["IDs aus der Kinderliste, falls ein oder mehrere Kinder namentlich genannt wurden — sonst leeres Array"]}\n' +
    "Rechne relative Datumsangaben (\"nächsten Montag\", \"in zwei Wochen\") anhand des heutigen Datums in ein konkretes Datum um.";

  const d = await rufeSpracheNluAuf(prompt);
  return {
    fachId: typeof d.fachId === "string" && faecher.some((f) => f.id === d.fachId) ? d.fachId : null,
    thema: typeof d.thema === "string" && d.thema.trim() ? d.thema.trim() : text.trim(),
    art: typeof d.art === "string" && SCHUL_ART_WERTE.includes(d.art) ? (d.art as ErkannterSchulEintrag["art"]) : "KLASSENARBEIT",
    datum: leseDatumsfeld(d.datum),
    personIds: lesePersonIds(d.personIds, personen),
  };
}

// KI-gestützter Duplikat-Check beim Anlegen eines neuen Fachs (Fix-Batch 30, Florians
// Wunsch: "mit der KI automatisch überprüft werden ob ein Fach eventuell schon angelegt
// ist") — erkennt auch Schreibvarianten/Abkürzungen/Synonyme ("Bio" vs. "Biologie"), die
// der bisherige reine Textvergleich (exakte Übereinstimmung ignoriert Groß-/Kleinschreibung)
// nicht abdeckt.
export async function pruefeFachDuplikatKI(neuerName: string, bestehende: string[]): Promise<FachDuplikatPruefung> {
  if (bestehende.length === 0) return { istVermutlichDuplikat: false, aehnlichesFach: null };
  const prompt =
    `Ein Familienmitglied möchte für ein Schulkind das neue Schulfach "${neuerName}" anlegen.\n` +
    `Bereits vorhandene Fächer dieses Kindes: ${bestehende.join(", ")}\n\n` +
    "Ist \"" +
    neuerName +
    "\" wahrscheinlich dasselbe Fach wie eines der vorhandenen (z. B. Abkürzung, andere Schreibweise, Synonym — " +
    "z. B. \"Bio\"/\"Biologie\", \"Deutsch\"/\"DE\", \"Erdkunde\"/\"Geographie\")? " +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"istVermutlichDuplikat": true oder false, "aehnlichesFach": "Name des vermutlich gleichen bestehenden Fachs, oder null"}';

  const d = await rufeSpracheNluAuf(prompt);
  return {
    istVermutlichDuplikat: d.istVermutlichDuplikat === true,
    aehnlichesFach: typeof d.aehnlichesFach === "string" && d.aehnlichesFach.trim() ? d.aehnlichesFach.trim() : null,
  };
}
