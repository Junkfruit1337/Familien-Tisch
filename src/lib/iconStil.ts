// Fix-Batch 124 (Florians Wunsch): "man könnte doch sowas in den Designvorlagen ändern... dass
// sich das durch die ganze App zieht" — ob Bereichs-Icons (Seiten-Header + untere
// Navigationsleiste) als bunte Emoji oder als schlichte einfarbige Symbole erscheinen, ist ein
// Stil, den jede Person für sich selbst wählt (wie Hell/Dunkel und Design-Vorlage), gespeichert
// pro Browser/Gerät. Technisch rein über eine CSS-Attribut-Klasse gelöst (siehe globals.css
// `.icon-bunt`/`.icon-minimal` + `[data-icon-stil]`) statt über React-State — dadurch wirkt eine
// Änderung sofort app-weit, genau wie beim Design-Vorlagen-Wechsel, ganz ohne Reload oder
// Event-Bus zwischen Komponenten.
export const ICON_STIL_KEY = "familientisch-icon-stil";
export type IconStil = "bunt" | "minimal";

export function anwendenIconStil(stil: IconStil) {
  document.documentElement.setAttribute("data-icon-stil", stil);
}
