import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Fix-Batch 64 (Florians KI-Vorschlag "KI-Lernhilfe für Kinder"): DREI strikt getrennte
// Funktionen, alle fotobasiert. Florians ausdrückliche, mehrfach betonte Sicherheitsanforderung:
// "nicht einfach mit der KI die Hausaufgaben gemacht werden können" — deshalb:
// - erklaereAufgabe: darf sich auf die abgebildete Aufgabe beziehen (Florian per Nachfrage
//   bestätigt), um die Methode zu erklären, nennt aber NIE das konkrete Ergebnis/die Lösung.
// - generiereUebungsaufgaben: erzeugt NEUE, andere Aufgaben zum Selbst-Üben (andere Zahlen/
//   Beispiele), rührt die Original-Lösung gar nicht erst an.
// - erstelleSpickzettel: reine Zusammenfassung der EIGENEN, bereits vorhandenen Notizen des
//   Kindes — keine neuen Inhalte, kein Aufgaben-Lösen.
// Jede der drei Funktionen bekommt einen eigenen, enggeführten Prompt statt eines gemeinsamen
// generischen — das Sicherheits-Verhalten soll nicht von einem Parameter abhängen, den man
// versehentlich falsch setzen könnte.

function holeApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen).");
  return apiKey;
}

function bildTeile(fotoDataUrl: string): { mediaType: string; base64Data: string } {
  const match = fotoDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error("Ungültiges Bildformat.");
  return { mediaType: match[1], base64Data: match[2] };
}

async function rufeVisionAuf(fotoDataUrl: string, prompt: string, maxTokens: number): Promise<string> {
  const apiKey = holeApiKey();
  const { mediaType, base64Data } = bildTeile(fotoDataUrl);
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64Data } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return textBlock?.text ?? "";
}

// Spickzettel: fasst die fotografierten eigenen Notizen/Lernzettel des Kindes zusammen —
// KEINE neuen Inhalte, KEINE Aufgaben lösen, nur verdichten/ordnen, was schon dort steht.
export async function erstelleSpickzettel(fotoDataUrl: string, thema?: string): Promise<string> {
  const themaHinweis = thema?.trim() ? ` zum Thema "${thema.trim()}"` : "";
  const prompt =
    `Auf diesem Foto sind handschriftliche Lernnotizen eines Kindes zur Vorbereitung auf eine Klassenarbeit${themaHinweis}.\n` +
    "Fasse NUR das zusammen, was auf dem Foto tatsächlich steht — als kompakten, gut lesbaren Spickzettel " +
    "(Stichpunkte, wichtige Merksätze/Formeln/Vokabeln, klar gegliedert). " +
    "Erfinde KEINE zusätzlichen Inhalte, die nicht auf dem Foto stehen, und löse keine Aufgaben. " +
    "Antworte als reiner Fließtext mit Zeilenumbrüchen (keine JSON, kein Markdown-Codeblock).";
  const text = await rufeVisionAuf(fotoDataUrl, prompt, 1200);
  if (!text.trim()) throw new Error("Konnte keinen Spickzettel erstellen. Bitte ein deutlicheres Foto versuchen.");
  return text.trim();
}

// Erklärmodus: darf sich auf die abgebildete Aufgabe beziehen um die Methode zu erklären,
// MUSS aber die Lösung/das Ergebnis dieser konkreten Aufgabe verschweigen.
export async function erklaereAufgabe(fotoDataUrl: string): Promise<string> {
  const prompt =
    "Auf diesem Foto ist eine Hausaufgabe oder Übungsaufgabe eines Schulkindes.\n" +
    "Erkläre kindgerecht und verständlich, WELCHE Methode/welches Konzept man braucht, um diese Art von Aufgabe zu lösen, " +
    "und WARUM (Schritt-für-Schritt-Vorgehen, ggf. mit einem KLEINEN, ANDEREN Beispiel mit anderen Zahlen/Wörtern zur Veranschaulichung).\n\n" +
    "GANZ WICHTIG, DAS DARFST DU AUF KEINEN FALL TUN: nenne NIEMALS das konkrete Ergebnis oder die fertige Lösung der abgebildeten Aufgabe selbst, " +
    "und rechne die abgebildete Aufgabe nicht bis zum Ende durch. Erkläre nur das Vorgehen/die Methode, nicht das Ergebnis dieser Aufgabe. " +
    "Wenn du unsicher bist, ob eine Formulierung schon zu nah an der Lösung ist, formuliere es allgemeiner.\n\n" +
    "Antworte als reiner Fließtext (keine JSON, kein Markdown-Codeblock), in einfacher, altersgerechter Sprache.";
  const text = await rufeVisionAuf(fotoDataUrl, prompt, 1200);
  if (!text.trim()) throw new Error("Konnte die Aufgabe nicht erklären. Bitte ein deutlicheres Foto versuchen.");
  return text.trim();
}

export type Uebungsaufgabe = { frage: string; antwort: string };

// Übungsmodus: erzeugt NEUE, andere Aufgaben mit demselben Konzept (andere Zahlen/Beispiele),
// rührt die Lösung der abgebildeten Original-Aufgabe gar nicht an.
export async function generiereUebungsaufgaben(fotoDataUrl: string): Promise<Uebungsaufgabe[]> {
  const prompt =
    "Auf diesem Foto ist eine Hausaufgabe oder Übungsaufgabe eines Schulkindes.\n" +
    "Erkenne, welche Art von Aufgabe/welches Konzept das ist, und erstelle GENAU 3 NEUE Übungsaufgaben desselben Typs " +
    "(gleiches Konzept/gleiche Methode wie im Foto, aber ANDERE Zahlen/Wörter/Beispiele als im Original — NICHT die " +
    "abgebildete Aufgabe selbst wiederholen oder lösen), leicht ansteigend im Schwierigkeitsgrad, mit je einer kurzen, korrekten Lösung.\n" +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Markdown-Codeblock, ohne weiteren Text, in genau diesem Format:\n" +
    '[{"frage": "Aufgabentext", "antwort": "kurze Lösung"}, {"frage": "...", "antwort": "..."}, {"frage": "...", "antwort": "..."}]';
  const raw = await rufeVisionAuf(fotoDataUrl, prompt, 1200);
  const bereinigt = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  let daten: unknown;
  try {
    daten = JSON.parse(bereinigt);
  } catch {
    throw new Error("Konnte keine Übungsaufgaben erstellen. Bitte erneut versuchen.");
  }
  if (!Array.isArray(daten)) throw new Error("Konnte keine Übungsaufgaben erstellen. Bitte erneut versuchen.");
  const aufgaben = daten
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      frage: typeof d.frage === "string" ? d.frage : "",
      antwort: typeof d.antwort === "string" ? d.antwort : "",
    }))
    .filter((a) => a.frage.trim() && a.antwort.trim());
  if (aufgaben.length === 0) throw new Error("Konnte keine Übungsaufgaben erstellen. Bitte erneut versuchen.");
  return aufgaben;
}
