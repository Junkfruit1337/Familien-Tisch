// Fix-Batch 70/72 (Florians Wunsch, in Fix-Batch 72 präzisiert: "nicht einfach nur eine
// Farbe, sondern wirklich ein anderes Design") — 10 auswählbare Design-Vorlagen, jede mit
// eigener Akzentfarbe UND eigener "Stil-Persönlichkeit" (Ecken-Radius/Schatten). Die
// eigentlichen Werte stehen als CSS-Variablen-Overrides in globals.css
// ([data-design="..."]) — hier nur die Metadaten (Name/Icon/Stil-Beschreibung/Vorschau-
// Farbe) fürs Auswahl-Menü in den Einstellungen. "standard" hat keinen CSS-Block, das ist
// einfach die vorhandene Grundoptik der App.
export type DesignThemeId =
  | "standard"
  | "ozean"
  | "sonnenuntergang"
  | "wald"
  | "beere"
  | "lavendel"
  | "feuer"
  | "himmel"
  | "honig"
  | "pastell";

export const DESIGN_THEMES: { id: DesignThemeId; name: string; emoji: string; stil: string; vorschauFarbe: string }[] = [
  { id: "standard", name: "Klassisch", emoji: "🟤", stil: "die bekannte Optik", vorschauFarbe: "#a97155" },
  { id: "ozean", name: "Ozean", emoji: "🌊", stil: "fließend-rund, weicher Schatten", vorschauFarbe: "#1b8a8a" },
  { id: "sonnenuntergang", name: "Sonnenuntergang", emoji: "🌅", stil: "warm-rund, sanftes Glühen", vorschauFarbe: "#e2662d" },
  { id: "wald", name: "Wald", emoji: "🌲", stil: "erdig-kompakt, flach & bodenständig", vorschauFarbe: "#2f7d4f" },
  { id: "beere", name: "Beere", emoji: "🍇", stil: "verspielt-rund, verspielter Schatten", vorschauFarbe: "#a83e78" },
  { id: "lavendel", name: "Lavendel", emoji: "💜", stil: "sanft-elegant, dezenter Schatten", vorschauFarbe: "#7b5ea7" },
  { id: "feuer", name: "Feuer", emoji: "🔥", stil: "kantig-dynamisch, knackiger Schatten", vorschauFarbe: "#c93a3a" },
  { id: "himmel", name: "Himmel", emoji: "🌤️", stil: "luftig-leicht, sehr weicher Schatten", vorschauFarbe: "#2f8fd6" },
  { id: "honig", name: "Honig", emoji: "🍯", stil: "gemütlich-warm, goldener Schatten", vorschauFarbe: "#d69e1f" },
  { id: "pastell", name: "Pastell", emoji: "🎀", stil: "verspielt-weich, zartes Rosa", vorschauFarbe: "#e78fb3" },
];

export const DESIGN_KEY = "familientisch-design";
