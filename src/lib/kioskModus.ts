// Fix-Batch 141 (Florians Wunsch, Vorschlag 8 aus der Zehner-Liste vom 20.09.2026): Kiosk-
// Modus für ein Tablet, das dauerhaft irgendwo hängt (z.B. in der Küche) — nur pro Gerät
// gespeichert (localStorage), wie Design-Vorlage/Icon-Stil, angewendet über dasselbe
// entkoppelte data-Attribut-Muster (siehe globals.css).
export const KIOSK_MODUS_KEY = "familientisch-kiosk-modus";

export function anwendenKioskModus(aktiv: boolean) {
  if (aktiv) document.documentElement.setAttribute("data-kiosk-modus", "1");
  else document.documentElement.removeAttribute("data-kiosk-modus");
}
