// Fix-Batch 70/72 (Florians Wunsch, in Fix-Batch 72 präzisiert: "nicht einfach nur eine
// Farbe, sondern wirklich ein anderes Design") — auswählbare Design-Vorlagen, jede mit
// eigener Akzentfarbe UND eigener "Stil-Persönlichkeit" (Ecken-Radius/Schatten). Die
// eigentlichen Werte stehen als CSS-Variablen-Overrides in globals.css
// ([data-design="..."]) — hier nur die Metadaten (Name/Icon/Stil-Beschreibung/Vorschau-
// Farben) fürs Auswahl-Menü in den Einstellungen. "standard" hat keinen CSS-Block, das ist
// einfach die vorhandene Grundoptik der App.
// Fix-Batch 119 (Florians Bug-Meldung: "im hellen Modus sieht man kaum einen Unterschied
// zwischen den Vorlagen", Wunsch nach "deutlich mehr" Vielfalt): jede Vorlage hat jetzt in
// globals.css eine VOLLSTÄNDIGE eigene Farbpalette (nicht nur Akzentfarbe) und teils eine
// eigene Schriftart bekommen — `vorschauBg`/`vorschauText` hier sind reine, feste
// Vorschau-Farben fürs Auswahl-Menü selbst (damit die Liste ehrlich zeigt, wie jede Vorlage
// tatsächlich aussieht, unabhängig von der GERADE aktiven Vorlage). Zwei neue Vorlagen
// ("Minze", "Königsblau") für mehr Auswahl ergänzt.
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
  | "pastell"
  | "minze"
  | "koenigsblau";

export const DESIGN_THEMES: {
  id: DesignThemeId;
  name: string;
  emoji: string;
  stil: string;
  vorschauFarbe: string;
  vorschauBg: string;
  vorschauText: string;
}[] = [
  { id: "standard", name: "Klassisch", emoji: "🟤", stil: "die bekannte, warme Optik", vorschauFarbe: "#a97155", vorschauBg: "#f6f1e7", vorschauText: "#3a332a" },
  { id: "ozean", name: "Ozean", emoji: "🌊", stil: "kühles Blaugrün, klar & modern", vorschauFarbe: "#1b8a8a", vorschauBg: "#eef7f6", vorschauText: "#1c3d3a" },
  { id: "sonnenuntergang", name: "Sonnenuntergang", emoji: "🌅", stil: "warmes Koralle, verspielt", vorschauFarbe: "#e2662d", vorschauBg: "#fdf2ec", vorschauText: "#4a2a18" },
  { id: "wald", name: "Wald", emoji: "🌲", stil: "erdiges Grün, bodenständig", vorschauFarbe: "#2f7d4f", vorschauBg: "#f1f5ed", vorschauText: "#23331c" },
  { id: "beere", name: "Beere", emoji: "🍇", stil: "sattes Magenta, verspielt", vorschauFarbe: "#a83e78", vorschauBg: "#fbeef6", vorschauText: "#3d1a30" },
  { id: "lavendel", name: "Lavendel", emoji: "💜", stil: "sanftes Violett, elegant", vorschauFarbe: "#7b5ea7", vorschauBg: "#f3f0fa", vorschauText: "#2c2340" },
  { id: "feuer", name: "Feuer", emoji: "🔥", stil: "kräftiges Rot, kantig-dynamisch", vorschauFarbe: "#c93a3a", vorschauBg: "#fdf0ee", vorschauText: "#3d0f0a" },
  { id: "himmel", name: "Himmel", emoji: "🌤️", stil: "helles Himmelblau, luftig-leicht", vorschauFarbe: "#2f8fd6", vorschauBg: "#eef6fc", vorschauText: "#17293b" },
  { id: "honig", name: "Honig", emoji: "🍯", stil: "warmes Gold, gemütlich", vorschauFarbe: "#d69e1f", vorschauBg: "#fbf4e3", vorschauText: "#3c2c09" },
  { id: "pastell", name: "Pastell", emoji: "🎀", stil: "zartes Rosa, verspielt-weich", vorschauFarbe: "#e78fb3", vorschauBg: "#fdf1f6", vorschauText: "#402634" },
  { id: "minze", name: "Minze", emoji: "🌿", stil: "frisches Mintgrün, spa-frisch", vorschauFarbe: "#2fa87f", vorschauBg: "#eef9f3", vorschauText: "#123328" },
  { id: "koenigsblau", name: "Königsblau", emoji: "👑", stil: "sattes Blau, formell-klar", vorschauFarbe: "#2d4fa0", vorschauBg: "#eef1fa", vorschauText: "#16203f" },
];

export const DESIGN_KEY = "familientisch-design";
