import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ErkannterListenArtikel = { name: string; menge: string | null };

const PROMPT =
  "Auf diesem Foto oder Screenshot ist eine Einkaufsliste (handschriftlich notiert, oder ein Screenshot aus einer anderen Notiz-/Einkaufslisten-App). " +
  "Lies ALLE Artikel heraus, die auf der Liste stehen, jeweils mit Mengenangabe, falls eine erkennbar ist (z. B. \"2\", \"500 g\", \"1 Packung\").\n" +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
  '{"artikel": [{"name": "Artikelname", "menge": "Mengenangabe oder null, falls keine erkennbar"}]}\n' +
  "Ignoriere bereits durchgestrichene/abgehakte Einträge nicht — nimm auch sie mit auf, das Entscheiden ob etwas gebraucht wird trifft der Nutzer selbst danach.";

// Massenimport per Foto (Fix-Batch 35 Nachtrag, Ticket "Massenimport von Einkaufslisten per
// Foto/Screenshot") — analog zur Rezept-Fotoerkennung (rezeptErkennung.ts), braucht denselben
// ANTHROPIC_API_KEY. Ergebnis füllt nur eine Vorschau, die der Nutzer noch prüfen/anpassen
// kann, bevor irgendetwas wirklich zur Liste hinzugefügt wird.
export async function erkenneEinkaufslisteAusBild(fotoDataUrl: string): Promise<ErkannterListenArtikel[]> {
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
    max_tokens: 2000,
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
    throw new Error("Konnte die Antwort der Bilderkennung nicht lesen. Bitte erneut versuchen oder die Artikel manuell eintippen.");
  }

  const liste = (daten as Record<string, unknown>).artikel;
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      name: typeof a.name === "string" ? a.name.trim() : "",
      menge: typeof a.menge === "string" && a.menge.trim() ? a.menge.trim() : null,
    }))
    .filter((a) => a.name);
}
