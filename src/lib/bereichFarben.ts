// Eigene Akzentfarbe je App-Bereich (Florians Wunsch, Fix-Batch 32 Nachtrag) — vorher sah
// wegen der einen globalen --accent-Farbe für die ganze App jeder Bereich optisch gleich aus.
// Bewusst nur für Nav-Hervorhebung + Seiten-Icon-Chip genutzt, NICHT für Buttons/Inputs/Cards
// (die bleiben einheitlich gestylt, sonst wirkt die App inkonsistent statt nur "unterscheidbar").
// Redesign Fix-Batch 56: essensplan-Farbe war zuvor byte-identisch mit --danger (#b5573f) —
// der Essen-Tab sah dadurch farblich wie "Achtung/Fehler" aus. Jetzt ein eigenständiger,
// warmer Orange-Ton (passt zum Thema Essen), klar unterscheidbar von Rot/Fehler.
export const BEREICH_FARBEN = {
  dashboard: "#a97155",
  kalender: "#5b7fa6",
  aufgaben: "#6b8f5a",
  einkaufsliste: "#c98a68",
  schule: "#8a6fa9",
  dienstplan: "#4f8a8b",
  essensplan: "#d9822b",
  einstellungen: "#8a7f6c",
} as const;

export type Bereich = keyof typeof BEREICH_FARBEN;
