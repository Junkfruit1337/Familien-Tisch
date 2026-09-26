// Fix-Batch 145 (Ticket #8, Florians Bug-Meldung "korrekte Groß- und Kleinschreibung sowie
// weiterer Formatierungsdetails"): normalisiert Artikelnamen, bevor sie auf der Einkaufsliste
// gespeichert werden — behebt die häufigsten Formatierungsprobleme aus Sprach-/Foto-/Rezept-
// Erkennung (führende/doppelte Leerzeichen, kleingeschriebener erster Buchstabe), OHNE eine
// vollständige deutsche Groß-/Kleinschreibungs-Grammatik nachzubauen: nur der erste Buchstabe
// wird großgeschrieben, der Rest bleibt unangetastet (schützt Dinge wie "H-Milch", "EL",
// "ja!-Kartoffeln" vor Verstümmelung durch pauschales Klein-/Großschreiben jedes Wortes).
export function formatiereArtikelName(name: string): string {
  const bereinigt = name.trim().replace(/\s+/g, " ");
  if (!bereinigt) return bereinigt;
  return bereinigt.charAt(0).toUpperCase() + bereinigt.slice(1);
}
