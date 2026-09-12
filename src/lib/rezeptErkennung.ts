import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ErkanntesRezept = { name: string; zutaten: string; zubereitung: string; portionen: number | null };

function holeApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen).");
  return apiKey;
}

// Gemeinsame Antwort-Verarbeitung für alle Rezept-Erkennungswege (Foto/Sprache/Vorrat/
// Umschreiben) — Fix-Batch 63: vorher an drei Stellen dupliziert, jetzt einmal zentral.
function parseRezeptAntwort(raw: string, fehlermeldung: string): ErkanntesRezept {
  const bereinigt = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let daten: unknown;
  try {
    daten = JSON.parse(bereinigt);
  } catch {
    throw new Error(fehlermeldung);
  }
  const d = daten as Record<string, unknown>;
  return {
    name: typeof d.name === "string" ? d.name : "",
    zutaten: typeof d.zutaten === "string" ? d.zutaten : "",
    zubereitung: typeof d.zubereitung === "string" ? d.zubereitung : "",
    portionen: typeof d.portionen === "number" && d.portionen > 0 ? Math.round(d.portionen) : null,
  };
}

const PROMPT =
  "Auf diesem Foto ist ein Rezept (aus einem Kochbuch, einer Zeitschrift oder handschriftlich notiert). " +
  "Lies den Namen des Gerichts, die Zutatenliste, die Zubereitung sowie — falls angegeben — für wie viele Portionen/Personen das Rezept geschrieben ist heraus (z. B. \"Für 1 Portion\", \"für 4 Personen\").\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  '{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format \'Menge Einheit Name\', z.B. 500 g Spaghetti", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, falls keine Portionsangabe erkennbar ist}\n' +
  "Wenn du eine Zutatenmenge nicht sicher lesen kannst, schätze plausibel oder lass die Mengenangabe weg und schreibe nur den Namen der Zutat. " +
  'Wenn keine Zubereitung erkennbar ist, lass das Feld als leeren String ("").';

// Rezept-Erfassung per Foto (Fragenkatalog Frage 25, Batch 8) — Cloud-KI-Bilderkennung
// statt einfacher Texterkennung, wie von Florian entschieden (10.09.2026). Braucht
// ANTHROPIC_API_KEY als Umgebungsvariable in Coolify.
export async function erkenneRezeptAusBild(fotoDataUrl: string): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const match = fotoDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error("Ungültiges Bildformat.");
  const mediaType = match[1];
  const base64Data = match[2];

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64Data } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte die Antwort der Bilderkennung nicht lesen. Bitte erneut versuchen oder die Felder manuell ausfüllen."
  );
}

const SPRACHE_PROMPT =
  "Das ist eine gesprochene Beschreibung eines Rezepts, die per Spracherkennung in Text umgewandelt wurde. " +
  "Extrahiere daraus den Namen des Gerichts, die Zutatenliste, die Zubereitung sowie — falls genannt — für wie viele Portionen/Personen.\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  '{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format \'Menge Einheit Name\', z.B. 500 g Spaghetti", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null}\n' +
  "Wenn Mengen nicht genannt wurden, schätze plausibel oder lass die Mengenangabe weg. Wenn keine Zubereitung erkennbar ist, lass das Feld leer (\"\").\n\n" +
  "Gesprochener Text: ";

// Spracheingabe fürs "Neues Rezept"-Formular (Fix-Batch 35 Nachtrag, Standing-Regel:
// Formulare mit mehr als zwei Feldern brauchen Spracheingabe UND Bildfunktionen) — nutzt
// denselben Antwort-Typ wie die Foto-Erkennung.
export async function erkenneRezeptAusSprache(text: string): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: SPRACHE_PROMPT + text }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte die Antwort der Spracherkennung nicht lesen. Bitte erneut versuchen oder die Felder manuell ausfüllen."
  );
}

// Fix-Batch 64 (Florians KI-Vorschlag "Saisonale Rezeptideen"): schlägt ein Rezept passend zur
// aktuellen Jahreszeit vor. "bisherigeVorschlaege" enthält zuletzt schon vorgeschlagene Namen
// aus derselben Saison, damit die KI nicht wiederholt dasselbe Gericht nennt (Florians expliziter
// Einwand: "nicht dass dann immer Kürbis angeboten wird, weil es nur ein Kürbisgericht gibt").
export async function schlageSaisonalesRezeptVor(saison: string, bisherigeVorschlaege: string[]): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const vermeidenHinweis =
    bisherigeVorschlaege.length > 0
      ? `\nDiese Gerichte wurden erst kürzlich vorgeschlagen, schlage etwas ANDERES vor: ${bisherigeVorschlaege.join(", ")}.`
      : "";
  const prompt =
    `Schlage ein einfaches, alltagstaugliches Familien-Rezept passend zur Jahreszeit "${saison}" vor, mit Zutaten, die in dieser Saison typisch/frisch verfügbar sind.` +
    vermeidenHinweis +
    "\nAntworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format \'Menge Einheit Name\'", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null}';
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte keinen saisonalen Vorschlag erzeugen. Bitte erneut versuchen oder die Felder manuell ausfüllen."
  );
}

// Fix-Batch 64 (Florians KI-Vorschlag "Kochanleitungen verdichten"): fasst eine bestehende,
// evtl. sehr lange Zubereitung in klare, kurze nummerierte Schritte — reine Textumformung, keine
// inhaltliche Änderung an Zutaten oder Mengen.
export async function verdichteZubereitung(zubereitung: string): Promise<string> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const prompt =
    "Hier ist eine Kochanleitung, teils lang und unübersichtlich:\n\n" +
    zubereitung +
    '\n\nFasse sie in klare, kurze, nummerierte Schritte (jeweils ein Satz, keine Substanz weglassen). ' +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"zubereitung": "1. ...\\n2. ...\\n3. ..."}';
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = (textBlock?.text ?? "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const daten = JSON.parse(raw) as Record<string, unknown>;
    if (typeof daten.zubereitung === "string" && daten.zubereitung.trim()) return daten.zubereitung;
  } catch {
    // fällt durch zur Fehlermeldung unten
  }
  throw new Error("Konnte die Anleitung nicht verdichten. Bitte erneut versuchen.");
}

// Fix-Batch 63 (Florians KI-Vorschlag "Rezept-Umschreibung"): schreibt ein bestehendes Rezept
// gemäß einer freien Anweisung um (z. B. "vegetarisch", "ohne Nüsse") — ersetzt/entfernt
// problematische Zutaten sinnvoll und passt die Zubereitung entsprechend an. Das Ergebnis wird
// (wie bei Foto/Sprache) nur als Vorschau zurückgegeben, nie automatisch gespeichert — der
// Nutzer entscheidet danach in der App, ob als neues Rezept oder als Überschreiben der Vorlage.
export async function schreibeRezeptUm(
  rezept: { name: string; zutaten: string; zubereitung: string },
  anweisung: string
): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const prompt =
    "Hier ist ein bestehendes Rezept:\n" +
    `Name: ${rezept.name}\nZutaten:\n${rezept.zutaten}\nZubereitung:\n${rezept.zubereitung}\n\n` +
    `Passe dieses Rezept gemäß folgender Anweisung an: "${anweisung}"\n` +
    "Ersetze oder entferne problematische Zutaten durch sinnvolle Alternativen (z. B. bei \"vegetarisch\" Fleisch durch Tofu/Pilze/Hülsenfrüchte, bei \"ohne Nüsse\" Nüsse durch Kerne o. Ä.) und passe die Zubereitung entsprechend an, falls nötig. " +
    "Der Rezeptname darf einen Zusatz bekommen (z. B. \"(vegetarisch)\").\n" +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format \'Menge Einheit Name\'", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null}';
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte das Rezept nicht umschreiben. Bitte erneut versuchen oder die Felder manuell anpassen."
  );
}
