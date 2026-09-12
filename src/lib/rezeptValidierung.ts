// Fix-Batch 71 (Florians Wunsch): egal auf welchem Weg ein Rezept entsteht (manuell,
// Spracheingabe, Foto-Erkennung, KI-Umschreibung/-Vorschlag), soll geprüft werden, ob jede
// Zutatenzeile eine Mengenangabe hat, mit der später gerechnet werden kann (g/kg/ml/l/Stück/
// EL/TL/...). Einzige Ausnahme: "Prise" — die ist von Natur aus ungefähr, braucht keine Zahl.
// Ohne Menge kann die Einkaufslisten-Zusammenführung (mergeMenge) nichts Sinnvolles addieren.
export type ZutatZeilenPruefung = { zeile: string; vollstaendig: boolean };

export function pruefeZutatenVollstaendig(zutatenText: string): ZutatZeilenPruefung[] {
  return zutatenText
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0)
    .map((zeile) => ({
      zeile,
      vollstaendig: /^\d/.test(zeile) || /^prisen?\b/i.test(zeile),
    }));
}

export function zutatenSindVollstaendig(zutatenText: string): boolean {
  return pruefeZutatenVollstaendig(zutatenText).every((z) => z.vollstaendig);
}
