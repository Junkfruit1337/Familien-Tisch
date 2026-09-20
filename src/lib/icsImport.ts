import "server-only";
import * as ical from "node-ical";
import Anthropic from "@anthropic-ai/sdk";

// Fix-Batch 96 (Florians Wunsch): Umzug von Faminice zu Familientisch — Termine aus einer
// exportierten ICS-Datei importieren. Bewusst NICHT primär per KI ausgelesen: das Datumsrechnen
// (insbesondere wiederkehrende Termine mit RRULE/EXDATE) ist mit einer echten iCalendar-
// Bibliothek verlässlich und deterministisch lösbar, eine KI könnte sich bei der Aufzählung
// vieler Wiederholungen leicht vertun — genau das darf laut Florian nicht passieren ("nichts
// darf verloren gehen"). KI kommt stattdessen als Rückfallebene zum Einsatz, exakt für den von
// Florian genannten Fall "wenn es in dem anderen Kalender anders steht" — also wenn die Datei
// keine gültige ICS-Datei ist (node-ical scheitert oder findet keine Termine).
export type IcsVorschauEreignis = {
  titel: string;
  start: string; // ISO
  ende: string | null; // ISO
  ganztaegig: boolean;
};

export type IcsImportErgebnis =
  | { ok: true; ereignisse: IcsVorschauEreignis[]; quelle: "ics" | "ki" }
  | { ok: false; fehler: string };

// Horizont: 30 Tage rückwirkend (kurzer Puffer für gerade verstrichene Termine) bis 2 Jahre
// voraus (analog UNBEGRENZT_HORIZONT_TAGE in kalender/actions.ts) — verhindert, dass jahrealte
// Karteileichen aus der alten App mit importiert werden.
function horizont(): { von: Date; bis: Date } {
  const von = new Date();
  von.setDate(von.getDate() - 30);
  const bis = new Date();
  bis.setFullYear(bis.getFullYear() + 2);
  return { von, bis };
}

function textWert(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in (v as any)) return String((v as any).val);
  return "";
}

// Ganztags-Termine: node-ical konstruiert das Date-Objekt aus den reinen Jahr/Monat/Tag-
// Angaben der ICS-Datei über die LOKALE Zeitzone des Node-Prozesses — .toISOString() würde
// deshalb, je nach Server-Zeitzone, den falschen Kalendertag zurückgeben (Tag ±1 verschoben).
// Über die lokalen Getter (die exakt die Konstruktion spiegeln, unabhängig davon, welche
// Zeitzone der Prozess hat) den Kalendertag zuverlässig zurückgewinnen und als "Mitternacht
// UTC"-ISO-String schreiben — dieselbe Konvention, die ganztägige Termine im Rest der App schon
// verwenden (siehe kalender/KalenderClient.tsx, submit()).
function ganztaegigIso(d: Date): string {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}T00:00:00.000Z`;
}

function minusEinTag(d: Date): Date {
  const kopie = new Date(d);
  kopie.setDate(kopie.getDate() - 1);
  return kopie;
}

// ICS-DTEND ist bei Ganztags-Terminen EXKLUSIV (der Tag NACH dem letzten Tag) — Familientisch
// (Fix-Batch 89, Mehrtägige Termine) behandelt "ende" dagegen INKLUSIV (der letzte Tag selbst).
// Ein Ein-Tages-Termin bekommt hier bewusst gar kein "ende" (leer lassen wie beim manuellen
// Anlegen eines normalen Ganztags-Termins).
function baueEreignis(titel: string, start: Date, ende: Date | null, ganztaegig: boolean): IcsVorschauEreignis {
  if (ganztaegig) {
    const startIso = ganztaegigIso(start);
    const endeIso = ende ? ganztaegigIso(minusEinTag(ende)) : null;
    return { titel, start: startIso, ende: endeIso !== startIso ? endeIso : null, ganztaegig: true };
  }
  return { titel, start: start.toISOString(), ende: ende ? ende.toISOString() : null, ganztaegig: false };
}

function parseMitNodeIcal(text: string): IcsVorschauEreignis[] {
  const daten = ical.default.parseICS(text);
  const { von, bis } = horizont();
  const ereignisse: IcsVorschauEreignis[] = [];

  for (const key of Object.keys(daten)) {
    const eintrag = daten[key];
    if (!eintrag || eintrag.type !== "VEVENT") continue;
    const event = eintrag as ical.VEvent;
    const titel = textWert(event.summary) || "Termin";

    if (event.rrule) {
      const instanzen = ical.default.expandRecurringEvent(event, { from: von, to: bis });
      for (const inst of instanzen) {
        ereignisse.push(baueEreignis(textWert(inst.summary) || titel, inst.start, inst.end ?? null, inst.isFullDay));
      }
    } else if (event.start && event.start >= von && event.start <= bis) {
      ereignisse.push(baueEreignis(titel, event.start, event.end ?? null, event.datetype === "date"));
    }
  }

  return ereignisse.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

// Rückfallebene per KI (siehe Kommentar oben): nur für den Fall, dass die Datei keine
// standardkonforme ICS-Datei ist. Datei wird gekappt, um den Kontext nicht zu sprengen —
// für den realistischen Fall (Familienkalender-Export) reichlich Puffer.
async function parseMitKi(text: string): Promise<IcsVorschauEreignis[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen).");
  const gekappt = text.slice(0, 150000);
  const { von, bis } = horizont();

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content:
          "Die folgende Datei sollte eine iCalendar (ICS)-Datei sein, ist aber nicht standardkonform genug, um sie automatisch zu parsen. " +
          `Lies trotzdem so viele Termine wie möglich heraus (auch bei ungewöhnlicher Formatierung), beschränkt auf den Zeitraum ${von.toISOString().slice(0, 10)} bis ${bis.toISOString().slice(0, 10)}. ` +
          "Wenn ein Termin sich wiederholt (z. B. ein RRULE-artiges Muster erkennbar ist), liste JEDE einzelne Wiederholung als eigenes Ereignis im genannten Zeitraum auf — fasse nicht zusammen, damit nichts verloren geht.\n\n" +
          "Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
          '[{"titel": "...", "start": "JJJJ-MM-TTTHH:MM:SS", "ende": "JJJJ-MM-TTTHH:MM:SS oder null", "ganztaegig": true oder false}]\n\n' +
          `Datei-Inhalt:\n${gekappt}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const roh = (textBlock?.text ?? "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const geparst = JSON.parse(roh) as unknown;
  if (!Array.isArray(geparst)) throw new Error("Unerwartetes Antwortformat der KI.");

  return geparst
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      titel: typeof e.titel === "string" && e.titel.trim() ? e.titel.trim() : "Termin",
      start: typeof e.start === "string" ? e.start : new Date().toISOString(),
      ende: typeof e.ende === "string" ? e.ende : null,
      ganztaegig: e.ganztaegig === true,
    }))
    .filter((e) => !Number.isNaN(new Date(e.start).getTime()));
}

export async function parseIcsDatei(text: string): Promise<IcsImportErgebnis> {
  try {
    const ereignisse = parseMitNodeIcal(text);
    if (ereignisse.length > 0) return { ok: true, ereignisse, quelle: "ics" };
    // Keine Termine gefunden — könnte eine leere, aber gültige Datei sein, oder eine, die
    // node-ical nicht sauber lesen konnte. Rückfall auf KI, um sicherzugehen.
  } catch (err) {
    console.error("ICS-Import: node-ical konnte die Datei nicht lesen, versuche KI-Rückfallebene:", err);
  }

  try {
    const ereignisse = await parseMitKi(text);
    return { ok: true, ereignisse, quelle: "ki" };
  } catch (err) {
    console.error("ICS-Import: auch die KI-Rückfallebene ist fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Lesen der Datei.";
    return { ok: false, fehler: `Konnte die Datei nicht lesen: ${fehler}` };
  }
}
