// Fix-Batch 70 (Florians Wunsch: 10 auswählbare, bunte Design-Vorlagen). Die eigentlichen
// Farben stehen als CSS-Variablen-Overrides in globals.css ([data-design="..."]) — hier nur
// die Metadaten (Name/Icon/Vorschau-Farbe) fürs Auswahl-Menü in den Einstellungen. "standard"
// hat keinen CSS-Block, das ist einfach die vorhandene Grundfarbe der App.
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

export const DESIGN_THEMES: { id: DesignThemeId; name: string; emoji: string; vorschauFarbe: string }[] = [
  { id: "standard", name: "Klassisch", emoji: "🟤", vorschauFarbe: "#a97155" },
  { id: "ozean", name: "Ozean", emoji: "🌊", vorschauFarbe: "#1b8a8a" },
  { id: "sonnenuntergang", name: "Sonnenuntergang", emoji: "🌅", vorschauFarbe: "#e2662d" },
  { id: "wald", name: "Wald", emoji: "🌲", vorschauFarbe: "#2f7d4f" },
  { id: "beere", name: "Beere", emoji: "🍇", vorschauFarbe: "#a83e78" },
  { id: "lavendel", name: "Lavendel", emoji: "💜", vorschauFarbe: "#7b5ea7" },
  { id: "feuer", name: "Feuer", emoji: "🔥", vorschauFarbe: "#c93a3a" },
  { id: "himmel", name: "Himmel", emoji: "🌤️", vorschauFarbe: "#2f8fd6" },
  { id: "honig", name: "Honig", emoji: "🍯", vorschauFarbe: "#d69e1f" },
  { id: "pastell", name: "Pastell", emoji: "🎀", vorschauFarbe: "#e78fb3" },
];

export const DESIGN_KEY = "familientisch-design";
