import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { REZEPT_KATEGORIEN, istGueltigeKategorie } from "./rezeptKategorien";

export type ErkanntesRezept = {
  name: string;
  zutaten: string;
  zubereitung: string;
  portionen: number | null;
  kategorie: string;
  quelle?: string | null;
};

const KATEGORIE_FORMAT_HINWEIS = `"kategorie": "eine dieser Kategorien: ${REZEPT_KATEGORIEN.join(", ")}"`;

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
    kategorie: istGueltigeKategorie(d.kategorie) ? d.kategorie : "Hauptgang",
    quelle: typeof d.quelle === "string" && d.quelle.trim() ? d.quelle.trim() : null,
  };
}

const PROMPT =
  "Auf diesem Foto ist ein Rezept (aus einem Kochbuch, einer Zeitschrift oder handschriftlich notiert). " +
  "Lies den Namen des Gerichts, die Zutatenliste, die Zubereitung sowie — falls angegeben — für wie viele Portionen/Personen das Rezept geschrieben ist heraus (z. B. \"Für 1 Portion\", \"für 4 Personen\").\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  `{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format 'Menge Einheit Name', z.B. 500 g Spaghetti", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, falls keine Portionsangabe erkennbar ist, ${KATEGORIE_FORMAT_HINWEIS}}\n` +
  "Wenn du eine Zutatenmenge nicht sicher lesen kannst, schätze plausibel oder lass die Mengenangabe weg und schreibe nur den Namen der Zutat. " +
  'Wenn keine Zubereitung erkennbar ist, lass das Feld als leeren String ("").';

// Rezept-Erfassung per Foto ODER PDF-Datei (Fragenkatalog Frage 25, Batch 8; PDF-Unterstützung
// Fix-Batch 76, Florians Wunsch: "auch Dateien hochladen können, wie eine PDF-Datei") —
// Cloud-KI-Bilderkennung statt einfacher Texterkennung. Braucht ANTHROPIC_API_KEY als
// Umgebungsvariable in Coolify. Claude liest ein PDF nativ als Dokument-Block (Text+Layout),
// kein Umweg über eine Bildkonvertierung nötig.
export async function erkenneRezeptAusDatei(datenUrl: string): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const bildMatch = datenUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  const pdfMatch = datenUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!bildMatch && !pdfMatch) throw new Error("Ungültiges Datei-Format (nur Bilder oder PDF werden unterstützt).");

  const client = new Anthropic({ apiKey });
  const inhaltsBlock = bildMatch
    ? { type: "image" as const, source: { type: "base64" as const, media_type: bildMatch[1] as any, data: bildMatch[2] } }
    : { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: pdfMatch![1] } };

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [inhaltsBlock, { type: "text", text: PROMPT }],
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte die Antwort der Erkennung nicht lesen. Bitte erneut versuchen oder die Felder manuell ausfüllen."
  );
}

const SPRACHE_PROMPT =
  "Das ist eine gesprochene Beschreibung eines Rezepts, die per Spracherkennung in Text umgewandelt wurde — jemand diktiert ein " +
  "Rezept, das er/sie schon kennt (z. B. auswendig, ohne es aufgeschrieben zu haben). " +
  "Extrahiere daraus den Namen des Gerichts, die Zutatenliste, die Zubereitung sowie — falls genannt — für wie viele Portionen/Personen. " +
  "Übernimm die Angaben so, wie diktiert — erfinde nichts hinzu.\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  `{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format 'Menge Einheit Name', z.B. 500 g Spaghetti", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, ${KATEGORIE_FORMAT_HINWEIS}}\n` +
  "Wenn Mengen nicht genannt wurden, schätze plausibel oder lass die Mengenangabe weg. Wenn keine Zubereitung erkennbar ist, lass das Feld leer (\"\").\n\n" +
  "Gesprochener Text: ";

// Fix-Batch 76 (Florians Korrektur an Fix-Batch 75): "Vorhandenes Rezept hinzufügen" (Foto/
// Datei/Diktieren) und "KI erstellt ein Rezept" sollen wieder zwei klar getrennte Bereiche
// sein — Diktieren eines bekannten Rezepts ist kein "Erfinden" und braucht eine eigene,
// treue Transkriptions-Funktion statt der Vorschlag-Funktion weiter unten.
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

// Fix-Batch 74/75 (Florian: "vorerst ein KI-Rezept", dann: Formular vereinfachen — nur noch
// EIN Text-/Sprachfeld statt getrennter Wege für "eigenes Rezept diktieren" und "Idee
// vorschlagen lassen"). Deckt deshalb bewusst BEIDE Fälle in einem Aufruf ab: wenn die
// Beschreibung schon ein vollständiges, selbst diktiertes/getipptes Rezept mit Mengen ist,
// wird es nur sauber strukturiert (nicht neu erfunden); wenn es nur eine grobe Idee/ein
// Wunsch ist (Gerichtsart oder vorhandene Zutaten), wird ein passendes Rezept vorgeschlagen.
// Günstig: reine Modell-Generierung ohne Web-Suche (ca. 1/10 bis 1/20 der Websuche-Kosten).
export async function schlageRezeptZuBeschreibungVor(beschreibung: string): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const prompt =
    `Ein Familienmitglied hat Folgendes eingegeben (getippt oder per Sprache diktiert), um ein Rezept anzulegen:\n"${beschreibung}"\n\n` +
    "Zwei Fälle sind möglich:\n" +
    "1. Es ist bereits ein vollständiges, eigenes Rezept mit Zutaten/Mengen (ggf. auch Zubereitung) — dann strukturiere es NUR sauber, ohne es zu verändern oder zu erfinden.\n" +
    "2. Es ist nur eine grobe Idee/ein Wunsch (z. B. eine Gerichtsart wie \"eine Suppe\", oder was gerade an Zutaten zuhause ist, z. B. \"ich hab Zucchini und Reis da\") — dann schlage " +
    "ein einfaches, alltagstaugliches Familien-Rezept vor, das dazu passt.\n" +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    `{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format 'Menge Einheit Name'", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, ${KATEGORIE_FORMAT_HINWEIS}}`;
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return parseRezeptAntwort(
    textBlock?.text ?? "",
    "Konnte keinen Rezeptvorschlag erzeugen. Bitte erneut versuchen oder die Felder manuell ausfüllen."
  );
}

// Fix-Batch 73 (Florians Wunsch): Rezept-Finder per freier Beschreibung ("eine Suppe",
// "was mit Hähnchen", "ich hab Zucchini und Reis da") — nutzt Claudes serverseitiges
// Web-Such-Werkzeug, damit ein ECHTES, im Internet auffindbares und gut bewertetes Rezept
// vorgeschlagen wird, statt eines von der KI frei erfundenen (Florian ausdrücklich: "muss
// immer gut bewertet sein, das ist sehr wichtig"). Läuft über denselben ANTHROPIC_API_KEY,
// verursacht aber zusätzliche Kosten pro Suche (Anthropics Web-Suche wird separat abgerechnet).
// Fix-Batch 74: nachdem Florian die Kosten dafür erfahren hat, ist dies jetzt bewusst NICHT
// mehr die Standard-Option im Formular, sondern eine sekundäre, klar mit Kostenhinweis
// versehene Wahl (siehe EssensplanClient) — der günstige Weg oben ist der Standard.
// Da die Antwort neben reinem Text auch Such-Werkzeug-Blöcke enthalten kann, werden alle
// "text"-Blöcke aneinandergehängt statt nur den ersten zu nehmen.
export async function findeRezeptImInternet(beschreibung: string): Promise<ErkanntesRezept> {
  const apiKey = holeApiKey();
  const client = new Anthropic({ apiKey });
  const prompt =
    `Ein Familienmitglied sucht ein Rezept und beschreibt es so: "${beschreibung}"\n\n` +
    "Suche im Internet nach einem ECHTEN, existierenden Rezept, das dazu passt — bevorzugt von bekannten Rezeptportalen " +
    "(z. B. Chefkoch, Küchengötter, EAT SMARTER, Allrecipes) und ausdrücklich nur eines, das dort GUT BEWERTET ist " +
    "(viele positive Bewertungen/Kommentare). Erfinde KEIN Rezept selbst — wenn du kein passendes, gut bewertetes " +
    "Rezept findest, sag das im \"name\"-Feld statt eines Rezepts.\n" +
    "Antworte GANZ ZUM SCHLUSS AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    `{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format 'Menge Einheit Name', z.B. 500 g Spaghetti", ` +
    `"zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, ${KATEGORIE_FORMAT_HINWEIS}, ` +
    `"quelle": "Name der Seite, auf der das Rezept gefunden wurde, z.B. 'Chefkoch.de'"}`;
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } satisfies Anthropic.WebSearchTool20250305],
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseRezeptAntwort(
    text,
    "Konnte kein passendes Rezept im Internet finden. Bitte anders beschreiben oder die Felder manuell ausfüllen."
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
    `{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format 'Menge Einheit Name'", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste", "portionen": Zahl oder null, ${KATEGORIE_FORMAT_HINWEIS}}`;
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
