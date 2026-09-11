import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ErkanntesRezept = { name: string; zutaten: string; zubereitung: string };

const PROMPT =
  "Auf diesem Foto ist ein Rezept (aus einem Kochbuch, einer Zeitschrift oder handschriftlich notiert). " +
  "Lies den Namen des Gerichts, die Zutatenliste und die Zubereitung heraus.\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  '{"name": "Gerichtname", "zutaten": "eine Zutat pro Zeile, Format \'Menge Einheit Name\', z.B. 500 g Spaghetti", "zubereitung": "Zubereitungsschritte als Fließtext oder nummerierte Liste"}\n' +
  "Wenn du eine Zutatenmenge nicht sicher lesen kannst, schätze plausibel oder lass die Mengenangabe weg und schreibe nur den Namen der Zutat. " +
  'Wenn keine Zubereitung erkennbar ist, lass das Feld als leeren String ("").';

// Rezept-Erfassung per Foto (Fragenkatalog Frage 25, Batch 8) — Cloud-KI-Bilderkennung
// statt einfacher Texterkennung, wie von Florian entschieden (10.09.2026). Braucht
// ANTHROPIC_API_KEY als Umgebungsvariable in Coolify.
export async function erkenneRezeptAusBild(fotoDataUrl: string): Promise<ErkanntesRezept> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen).");
  }

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
  const raw = textBlock?.text ?? "";
  const bereinigt = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let daten: unknown;
  try {
    daten = JSON.parse(bereinigt);
  } catch {
    throw new Error("Konnte die Antwort der Bilderkennung nicht lesen. Bitte erneut versuchen oder die Felder manuell ausfüllen.");
  }

  const d = daten as Record<string, unknown>;
  return {
    name: typeof d.name === "string" ? d.name : "",
    zutaten: typeof d.zutaten === "string" ? d.zutaten : "",
    zubereitung: typeof d.zubereitung === "string" ? d.zubereitung : "",
  };
}
