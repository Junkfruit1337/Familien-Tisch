import { erkenneKategorie } from "./kategorisierung";

// Automatische Piktogramm-Erkennung für die Kachel-Einkaufsliste (Fix-Batch 25, Florians
// Referenz-Screenshot). Echte, pro Artikel individuell erzeugte Bilder (KI-Bildgenerierung)
// wären für eine Liste, die man beim Tippen live befüllt, zu langsam/teuer/uneinheitlich —
// stattdessen eine Stichwort-zu-Emoji-Zuordnung (analog der bestehenden Kategorie-Erkennung
// in kategorisierung.ts), mit Kategorie-Fallback und einem allgemeinen Schlusslicht.
// Reihenfolge: spezifischere Regeln zuerst, damit z.B. "Kirschtomate" nicht durch ein
// zu allgemeines Stichwort verdeckt wird. Nur reasonably eindeutige, nicht zu kurze
// Stichwörter (kein "ei" o.ä. — würde in vielen Wörtern als Substring auftauchen).
const REGELN: { icon: string; keywords: string[] }[] = [
  { icon: "🍅", keywords: ["tomate"] },
  { icon: "🥒", keywords: ["gurke"] },
  { icon: "🍎", keywords: ["apfel"] },
  { icon: "🍌", keywords: ["banane"] },
  { icon: "🥔", keywords: ["kartoffel"] },
  { icon: "🧅", keywords: ["zwiebel"] },
  { icon: "🥬", keywords: ["salat", "spinat", "feldsalat", "kohl", "wirsing"] },
  { icon: "🫑", keywords: ["paprika"] },
  { icon: "🥕", keywords: ["karotte", "möhre"] },
  { icon: "🍋", keywords: ["zitrone", "limette"] },
  { icon: "🍊", keywords: ["orange", "mandarine", "clementine"] },
  { icon: "🍐", keywords: ["birne"] },
  { icon: "🍇", keywords: ["traube"] },
  { icon: "🍓", keywords: ["erdbeere"] },
  { icon: "🫐", keywords: ["blaubeere", "heidelbeere"] },
  { icon: "🍈", keywords: ["himbeere", "beere"] },
  { icon: "🥦", keywords: ["brokkoli"] },
  { icon: "🍄", keywords: ["pilz", "champignon"] },
  { icon: "🧄", keywords: ["knoblauch"] },
  { icon: "🥑", keywords: ["avocado"] },
  { icon: "🥒", keywords: ["zucchini"] },
  { icon: "🎃", keywords: ["kürbis"] },
  { icon: "🌽", keywords: ["mais"] },
  { icon: "🥛", keywords: ["milch", "buttermilch"] },
  { icon: "🧀", keywords: ["käse", "mozzarella", "parmesan", "frischkäse"] },
  { icon: "🥣", keywords: ["joghurt", "quark", "schmand"] },
  { icon: "🧈", keywords: ["butter"] },
  { icon: "🍶", keywords: ["sahne"] },
  { icon: "🥚", keywords: ["eier", "ei "] },
  { icon: "🍗", keywords: ["hähnchen", "huhn", "geflügel", "pute"] },
  { icon: "🥩", keywords: ["rind", "schwein", "hack", "steak", "fleisch"] },
  { icon: "🌭", keywords: ["wurst", "würstchen"] },
  { icon: "🥓", keywords: ["schinken", "speck", "salami"] },
  { icon: "🐟", keywords: ["fisch", "lachs", "thunfisch"] },
  { icon: "🍞", keywords: ["brot", "toast", "baguette"] },
  { icon: "🥐", keywords: ["brötchen", "croissant"] },
  { icon: "🎂", keywords: ["kuchen", "torte"] },
  { icon: "🧁", keywords: ["muffin", "windbeutel", "cupcake"] },
  { icon: "🌾", keywords: ["mehl"] },
  { icon: "🍪", keywords: ["keks", "waffel"] },
  { icon: "🍕", keywords: ["pizza"] },
  { icon: "🍦", keywords: ["eis "] },
  { icon: "🍟", keywords: ["pommes", "fischstäbchen"] },
  { icon: "❄️", keywords: ["tiefkühl", "tk-", "gefroren"] },
  { icon: "💧", keywords: ["wasser", "sprudel"] },
  { icon: "🧃", keywords: ["saft", "schorle", "smoothie"] },
  { icon: "🥤", keywords: ["cola", "limo"] },
  { icon: "🍺", keywords: ["bier"] },
  { icon: "🍷", keywords: ["wein", "sekt"] },
  { icon: "☕", keywords: ["kaffee"] },
  { icon: "🍵", keywords: ["tee"] },
  { icon: "🍝", keywords: ["nudel", "spaghetti", "pasta"] },
  { icon: "🍚", keywords: ["reis"] },
  { icon: "🌶️", keywords: ["chili", "pfeffer", "gewürz", "curry"] },
  { icon: "🧂", keywords: ["salz", "zucker"] },
  { icon: "🍯", keywords: ["honig", "marmelade", "nuss-nougat"] },
  { icon: "🥜", keywords: ["nuss", "erdnuss", "mandel"] },
  { icon: "🍫", keywords: ["schokolade", "schoko"] },
  { icon: "🍬", keywords: ["süßigkeit", "bonbon", "gummibär", "chips", "knabber"] },
  { icon: "🧻", keywords: ["toilettenpapier", "klopapier", "küchenrolle", "taschentuch"] },
  { icon: "🧴", keywords: ["shampoo", "duschgel", "creme", "deo", "lotion", "sonnencreme"] },
  { icon: "🧼", keywords: ["seife", "waschmittel", "spülmittel", "reiniger", "putzmittel"] },
  { icon: "🪒", keywords: ["rasierer", "rasier"] },
  { icon: "🦷", keywords: ["zahnpasta", "zahnbürste"] },
  { icon: "👶", keywords: ["windel", "babynahrung"] },
  { icon: "🕯️", keywords: ["kerze"] },
  { icon: "🔋", keywords: ["batterie"] },
  { icon: "🍽️", keywords: ["gabel", "löffel", "messer", "teller", "geschirr", "besteck"] },
];

export function erkenneArtikelIcon(artikelName: string): string {
  const name = artikelName.toLowerCase().trim();
  if (!name) return "🛒";
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) return regel.icon;
  }
  // Kein spezifisches Stichwort getroffen — auf Basis der (gröberen) Kategorie-Erkennung
  // wenigstens ein thematisch passendes Icon statt des allgemeinen Einkaufswagens zeigen.
  const kategorie = erkenneKategorie(artikelName);
  switch (kategorie) {
    case "Obst & Gemüse":
      return "🥬";
    case "Milchprodukte":
      return "🥛";
    case "Fleisch & Fisch":
      return "🥩";
    case "Backwaren":
      return "🍞";
    case "Tiefkühl":
      return "❄️";
    case "Getränke":
      return "🧃";
    case "Drogerie":
      return "🧴";
    default:
      return "🛒";
  }
}
