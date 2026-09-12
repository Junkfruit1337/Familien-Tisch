import { erkenneKategorie } from "./kategorisierung";

// Automatische Piktogramm-Erkennung für die Kachel-Einkaufsliste (Fix-Batch 25, Florians
// Referenz-Screenshot). Echte, pro Artikel individuell erzeugte Bilder (KI-Bildgenerierung)
// wären für eine Liste, die man beim Tippen live befüllt, zu langsam/teuer/uneinheitlich —
// stattdessen eine Stichwort-zu-Emoji-Zuordnung (analog der bestehenden Kategorie-Erkennung
// in kategorisierung.ts), mit Kategorie-Fallback und einem allgemeinen Schlusslicht.
// Reihenfolge: spezifischere Regeln zuerst, damit z.B. "Kirschtomate" nicht durch ein
// zu allgemeines Stichwort verdeckt wird. Nur reasonably eindeutige, nicht zu kurze
// Stichwörter (kein "ei" o.ä. — würde in vielen Wörtern als Substring auftauchen).
// Fix-Batch 35 Nachtrag (Ticket "Fehlende und falsche Icons"): deutlich erweitert — u.a.
// Erbsen/Bohnen hatten vorher gar kein eigenes Icon und landeten beim generischen
// Kategorie-Fallback statt bei einem passenden Symbol.
const REGELN: { icon: string; keywords: string[] }[] = [
  // Fix-Batch 71 (Florians Beispiel): verarbeitete/eingedoste Tomatenprodukte sollen ein
  // Dosen-/Verpackungs-Icon zeigen statt der rohen Tomate — muss VOR der allgemeinen
  // "tomate"-Regel stehen, sonst würde diese zuerst greifen.
  { icon: "🥫", keywords: ["passierte tomate", "stückige tomate", "geschälte tomate", "tomatenmark"] },
  { icon: "🍅", keywords: ["tomate"] },
  { icon: "🥒", keywords: ["gurke", "zucchini"] },
  { icon: "🍎", keywords: ["apfel"] },
  { icon: "🍌", keywords: ["banane"] },
  { icon: "🥔", keywords: ["kartoffel"] },
  { icon: "🧅", keywords: ["zwiebel"] },
  { icon: "🥬", keywords: ["salat", "spinat", "feldsalat", "kohl", "wirsing", "rucola"] },
  { icon: "🫑", keywords: ["paprika"] },
  { icon: "🥕", keywords: ["karotte", "möhre"] },
  { icon: "🍋", keywords: ["zitrone", "limette"] },
  { icon: "🍊", keywords: ["orange", "mandarine", "clementine"] },
  { icon: "🍐", keywords: ["birne"] },
  { icon: "🍇", keywords: ["traube"] },
  { icon: "🍓", keywords: ["erdbeere"] },
  { icon: "🫐", keywords: ["blaubeere", "heidelbeere", "johannisbeere", "stachelbeere"] },
  { icon: "🍈", keywords: ["himbeere", "beere", "melone"] },
  { icon: "🌴", keywords: ["dattel", "datteln"] },
  { icon: "🥝", keywords: ["kiwi"] },
  { icon: "🥭", keywords: ["mango", "papaya"] },
  { icon: "🍍", keywords: ["ananas"] },
  { icon: "🍑", keywords: ["pfirsich", "aprikose"] },
  { icon: "🍒", keywords: ["kirsche", "pflaume"] },
  { icon: "🥦", keywords: ["brokkoli", "blumenkohl", "rosenkohl"] },
  { icon: "🍄", keywords: ["pilz", "champignon"] },
  { icon: "🧄", keywords: ["knoblauch"] },
  { icon: "🥑", keywords: ["avocado"] },
  { icon: "🎃", keywords: ["kürbis"] },
  { icon: "🌽", keywords: ["mais"] },
  { icon: "🫛", keywords: ["erbse", "erbsen", "zuckerschote"] },
  { icon: "🫘", keywords: ["bohne", "bohnen", "linse", "linsen", "kichererbse"] },
  { icon: "🥦", keywords: ["fenchel"] },
  { icon: "🍆", keywords: ["aubergine"] },
  { icon: "🌱", keywords: ["sprossen", "kräuter", "schnittlauch", "petersilie", "basilikum"] },
  { icon: "🍠", keywords: ["rote bete", "süßkartoffel"] },
  { icon: "🥒", keywords: ["radieschen", "sellerie", "lauch", "spargel", "artischocke"] },
  { icon: "🫚", keywords: ["ingwer"] },
  { icon: "🍇", keywords: ["granatapfel"] },
  { icon: "🥝", keywords: ["litschi", "physalis"] },
  { icon: "🌿", keywords: ["rhabarber"] },
  { icon: "🥛", keywords: ["milch", "buttermilch", "kefir"] },
  { icon: "🧀", keywords: ["käse", "mozzarella", "parmesan", "frischkäse", "gouda", "feta", "hüttenkäse"] },
  { icon: "🥣", keywords: ["joghurt", "quark", "schmand", "skyr", "crème fraîche"] },
  { icon: "🧈", keywords: ["butter", "margarine"] },
  { icon: "🍶", keywords: ["sahne"] },
  { icon: "🥚", keywords: ["eier", "ei "] },
  { icon: "🍗", keywords: ["hähnchen", "huhn", "geflügel", "pute"] },
  { icon: "🥩", keywords: ["rind", "schwein", "hack", "steak", "fleisch", "kotelett", "filet", "mett"] },
  { icon: "🌭", keywords: ["wurst", "würstchen", "bratwurst"] },
  { icon: "🥓", keywords: ["schinken", "speck", "salami", "leberkäse"] },
  { icon: "🐟", keywords: ["fisch", "lachs", "thunfisch", "forelle", "kabeljau", "hering", "matjes"] },
  { icon: "🦐", keywords: ["garnele", "shrimp"] },
  { icon: "🍞", keywords: ["brot", "toast", "baguette", "knäckebrot", "zwieback"] },
  { icon: "🥐", keywords: ["brötchen", "croissant", "brezel"] },
  { icon: "🎂", keywords: ["kuchen", "torte", "stollen"] },
  { icon: "🧁", keywords: ["muffin", "windbeutel", "cupcake"] },
  { icon: "🌾", keywords: ["mehl", "haferflocken", "müsli", "cornflakes"] },
  { icon: "🍪", keywords: ["keks", "waffel", "biskuit"] },
  { icon: "🍕", keywords: ["pizza"] },
  { icon: "🍦", keywords: ["eis ", "eiscreme"] },
  { icon: "🍟", keywords: ["pommes", "fischstäbchen"] },
  { icon: "❄️", keywords: ["rahmspinat", "tiefkühl", "tiefgefroren", "gefroren", "tk-", "tk "] },
  { icon: "🥫", keywords: ["dose", "dosen", "konserve", "konserven", "eingelegt", "eingemacht"] },
  { icon: "💧", keywords: ["wasser", "sprudel"] },
  { icon: "🧃", keywords: ["saft", "schorle", "smoothie", "apfelschorle"] },
  { icon: "🥤", keywords: ["cola", "limo", "energydrink"] },
  { icon: "🍺", keywords: ["bier", "malzbier"] },
  { icon: "🍷", keywords: ["wein", "sekt", "prosecco"] },
  { icon: "☕", keywords: ["kaffee"] },
  { icon: "🍵", keywords: ["tee"] },
  { icon: "🍝", keywords: ["nudel", "spaghetti", "pasta"] },
  { icon: "🍚", keywords: ["reis", "couscous", "quinoa"] },
  { icon: "🌶️", keywords: ["chili", "pfeffer", "gewürz", "curry", "paprikapulver", "zimt", "vanille"] },
  { icon: "🧂", keywords: ["salz", "zucker", "backpulver"] },
  { icon: "🍯", keywords: ["honig", "marmelade", "nuss-nougat"] },
  { icon: "🥜", keywords: ["nuss", "erdnuss", "mandel", "cashew", "walnuss"] },
  { icon: "🫒", keywords: ["olivenöl", "öl", "essig"] },
  { icon: "🍫", keywords: ["schokolade", "schoko"] },
  { icon: "🍬", keywords: ["süßigkeit", "bonbon", "gummibär", "chips", "knabber"] },
  { icon: "🧴", keywords: ["senf", "ketchup", "mayonnaise", "sojasauce", "brühe"] },
  { icon: "🧻", keywords: ["toilettenpapier", "klopapier", "küchenrolle", "taschentuch"] },
  { icon: "🧴", keywords: ["shampoo", "duschgel", "creme", "deo", "lotion", "sonnencreme", "hautcreme"] },
  { icon: "🧼", keywords: ["seife", "waschmittel", "spülmittel", "reiniger", "putzmittel", "weichspüler"] },
  { icon: "🪒", keywords: ["rasierer", "rasier"] },
  { icon: "🦷", keywords: ["zahnpasta", "zahnbürste"] },
  { icon: "👶", keywords: ["windel", "babynahrung"] },
  { icon: "🩹", keywords: ["pflaster", "wattestäbchen", "binde", "tampon"] },
  { icon: "🗑️", keywords: ["müllbeutel"] },
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
    case "Obst":
      return "🍎";
    case "Gemüse":
      return "🥬";
    case "Milchprodukte":
      return "🥛";
    case "Fleisch & Fisch":
      return "🥩";
    case "Backwaren":
      return "🍞";
    case "Tiefkühl":
      return "❄️";
    case "Konserven":
      return "🥫";
    case "Vorrat":
      return "🧂";
    case "Getränke":
      return "🧃";
    case "Drogerie":
      return "🧴";
    default:
      return "🛒";
  }
}
