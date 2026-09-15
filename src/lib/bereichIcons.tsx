import { Home, CalendarDays, ListChecks, GraduationCap, SprayCan, ShoppingCart, UtensilsCrossed, Settings, type LucideIcon } from "lucide-react";
import type { Bereich } from "./bereichFarben";

// Fix-Batch 123 (Florians Bug-Meldung: die Emoji-Icons je Bereich sahen "katastrophal"/
// uneinheitlich aus, je nach Gerät unterschiedlich gerendert) — ein durchgängiges, sauber
// skalierbares Icon-Set (lucide-react) statt Emoji, an EINER Stelle je Bereich zentral
// gepflegt, damit Seiten-Header und untere Navigationsleiste garantiert dasselbe Icon zeigen.
export const BEREICH_ICONS: Record<Bereich, LucideIcon> = {
  dashboard: Home,
  kalender: CalendarDays,
  aufgaben: ListChecks,
  schule: GraduationCap,
  dienstplan: SprayCan,
  einkaufsliste: ShoppingCart,
  essensplan: UtensilsCrossed,
  einstellungen: Settings,
};
