import { Home, CalendarDays, ListChecks, GraduationCap, SprayCan, ShoppingCart, UtensilsCrossed, Settings, type LucideIcon } from "lucide-react";
import type { Bereich } from "./bereichFarben";

// Fix-Batch 123: erster Versuch, ein einheitliches, schlichtes Icon-Set (statt der bisherigen,
// je nach Gerät uneinheitlich aussehenden Emoji) für Seiten-Header + Navigationsleiste.
// Fix-Batch 124 (Florians Feedback direkt danach): das schlichte Set allein war ihm zu
// "langweilig" für eine auch von Kindern genutzte App, und er wollte es nicht überall
// gleichzeitig — jetzt beide Stile parallel als Wahlmöglichkeit (siehe IconStilAuswahl in
// den Einstellungen), "minimal" bleibt für alle, die es lieber schlicht mögen.
export const BEREICH_ICONS_MINIMAL: Record<Bereich, LucideIcon> = {
  dashboard: Home,
  kalender: CalendarDays,
  aufgaben: ListChecks,
  schule: GraduationCap,
  dienstplan: SprayCan,
  einkaufsliste: ShoppingCart,
  essensplan: UtensilsCrossed,
  einstellungen: Settings,
};

// Fix-Batch 124 (Florians Bug-Meldung: "in Deutschland trägt niemand einen Doktorhut für die
// Schule", "ein Besen fühlt sich nicht richtig an"): Schulranzen statt Talar-Hut, Schwamm statt
// Besen — sonst am bisherigen, seit Fix-Batch 32 etablierten bunten Emoji-Stil festgehalten.
export const BEREICH_ICONS_BUNT: Record<Bereich, string> = {
  dashboard: "🏠",
  kalender: "📅",
  aufgaben: "✅",
  schule: "🎒",
  dienstplan: "🧽",
  einkaufsliste: "🛒",
  essensplan: "🍽️",
  einstellungen: "⚙️",
};

// Fix-Batch 124: rendert BEIDE Varianten gleichzeitig ins DOM, sichtbar geschaltet rein über
// CSS-Klassen (siehe globals.css `.icon-bunt`/`.icon-minimal` + `[data-icon-stil]`) — dieselbe
// Technik wie beim Hell/Dunkel- und Design-Vorlagen-Umschalter (Attribut auf <html>, CSS
// entscheidet), damit ein Stil-Wechsel sofort überall greift, ohne dass jede einzelne
// Komponente den State kennen oder neu laden muss.
export function BereichIcon({ bereich, size, farbe }: { bereich: Bereich; size: number; farbe?: string }) {
  const Minimal = BEREICH_ICONS_MINIMAL[bereich];
  return (
    <>
      <span className="icon-bunt" style={{ fontSize: size }}>
        {BEREICH_ICONS_BUNT[bereich]}
      </span>
      <Minimal className="icon-minimal" size={size} color={farbe} strokeWidth={2} />
    </>
  );
}
