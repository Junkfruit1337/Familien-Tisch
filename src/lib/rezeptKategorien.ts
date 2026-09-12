// Fix-Batch 75 (Florians Wunsch): feste Rezeptkategorien, damit die Tages-Auswahl im
// Essensplan standardmäßig nur Hauptgänge zeigen kann, mit Suche über alle Kategorien.
export const REZEPT_KATEGORIEN = ["Hauptgang", "Vorspeise", "Suppe", "Beilage", "Sauce/Dip", "Dessert", "Sonstiges"] as const;
export type RezeptKategorie = (typeof REZEPT_KATEGORIEN)[number];

export function istGueltigeKategorie(wert: unknown): wert is RezeptKategorie {
  return typeof wert === "string" && (REZEPT_KATEGORIEN as readonly string[]).includes(wert);
}
