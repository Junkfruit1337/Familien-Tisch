// Einfache Stichwort-Erkennung für die automatische Kategorisierung von Einkaufsartikeln.
// Fix-Batch 28: Obst und Gemüse getrennt (Florians Wunsch), "dattel(n)" ergänzt, und das
// bare Stichwort "ei" entfernt — es traf als Teilstring versehentlich auch "entsteint",
// "Reis", "Seife" usw. und kategorisierte sie fälschlich als Milchprodukte.
// Fix-Batch 35 Nachtrag (Ticket "Verbesserte Produktkategorisierung nach Spezifikation"):
// zwei neue Kategorien "Konserven" und "Vorrat" ergänzt (Florian bestätigt: mehr Kategorien
// sind gewünscht) — Verpackungs-/Zubereitungsart (Dose, TK) wird jetzt VOR der reinen
// Zutaten-Erkennung geprüft, damit z.B. "Erbsen (Dose)" als Konserven statt als Gemüse
// einsortiert wird, und "Fisch TK" sicher als Tiefkühl statt Fleisch & Fisch.

// Spezifikations-Modifikatoren — haben Vorrang vor der reinen Zutaten-Erkennung unten,
// weil die Verpackungs-/Zubereitungsart die Regal-/Kategorie-Zuordnung im Supermarkt stärker
// bestimmt als die reine Zutat (Erbsen frisch vs. Erbsen aus der Dose landen im Laden in
// komplett unterschiedlichen Gängen).
const SPEZIFIKATIONS_REGELN: { kategorie: string; keywords: string[] }[] = [
  {
    kategorie: "Konserven",
    keywords: ["dose", "dosen", "konserve", "konserven", "eingelegt", "eingemacht", "einweckglas"],
  },
  {
    kategorie: "Tiefkühl",
    keywords: ["tiefkühl", "tiefgefroren", "gefroren", "tk-", "tk ", "(tk)", " tk)", "tk)"],
  },
];

const REGELN: { kategorie: string; keywords: string[] }[] = [
  {
    kategorie: "Obst",
    keywords: [
      "apfel", "banane", "zitrone", "limette", "orange", "mandarine", "clementine",
      "birne", "traube", "beere", "erdbeere", "himbeere", "blaubeere", "heidelbeere",
      "dattel", "datteln", "kiwi", "mango", "ananas", "melone", "pfirsich", "aprikose",
      "pflaume", "kirsche", "avocado", "granatapfel", "feige", "litschi", "papaya",
      "physalis", "johannisbeere", "stachelbeere", "rhabarber",
    ],
  },
  {
    kategorie: "Gemüse",
    keywords: [
      "tomate", "gurke", "kartoffel", "zwiebel", "salat", "paprika", "karotte",
      "möhre", "spinat", "brokkoli", "pilz", "champignon", "knoblauch", "kohl",
      "wirsing", "lauch", "radieschen", "kürbis", "zucchini", "mais", "sellerie",
      "fenchel", "aubergine", "rote bete", "rosenkohl", "blumenkohl", "chicorée",
      "rucola", "feldsalat", "schnittlauch", "petersilie", "basilikum", "kräuter",
      "sprossen", "erbsen", "bohnen", "spargel", "artischocke", "ingwer",
    ],
  },
  {
    kategorie: "Milchprodukte",
    keywords: [
      "milch", "käse", "joghurt", "butter", "quark", "sahne", "frischkäse",
      "buttermilch", "mozzarella", "eier", "schmand", "parmesan", "gouda",
      "feta", "hüttenkäse", "kefir", "skyr", "margarine", "crème fraîche",
    ],
  },
  {
    kategorie: "Fleisch & Fisch",
    keywords: [
      "hähnchen", "huhn", "rind", "schwein", "hack", "wurst", "schinken",
      "fisch", "lachs", "thunfisch", "salami", "speck", "geflügel", "pute",
      "steak", "bratwurst", "leberkäse", "garnele", "shrimp", "forelle",
      "kabeljau", "hering", "matjes", "mett", "kotelett", "filet",
    ],
  },
  {
    kategorie: "Backwaren",
    keywords: [
      "brot", "brötchen", "toast", "kuchen", "mehl", "croissant", "baguette",
      "keks", "waffel", "muffin", "cupcake", "windbeutel", "brezel", "zwieback",
      "knäckebrot", "stollen", "torte", "biskuit",
    ],
  },
  {
    kategorie: "Tiefkühl",
    keywords: ["pizza", "eis ", "eiscreme", "pommes", "fischstäbchen", "rahmspinat"],
  },
  {
    kategorie: "Getränke",
    keywords: [
      "wasser", "saft", "cola", "limo", "bier", "wein", "kaffee", "tee",
      "sprudel", "sekt", "schorle", "smoothie", "energydrink", "malzbier",
      "prosecco", "apfelschorle",
    ],
  },
  {
    kategorie: "Drogerie",
    keywords: [
      "shampoo", "duschgel", "zahnpasta", "seife", "toilettenpapier",
      "klopapier", "windel", "creme", "deo", "waschmittel", "spülmittel",
      "binde", "tampon", "rasierer", "zahnbürste", "küchenrolle", "taschentuch",
      "lotion", "sonnencreme", "wattestäbchen", "pflaster", "hautcreme",
      "weichspüler", "reiniger", "putzmittel", "müllbeutel",
    ],
  },
  {
    // Neue Kategorie (Fix-Batch 35 Nachtrag) für Grundzutaten, die zu keiner der obigen
    // gut passen — vorher landeten die alle unspezifisch in "Sonstiges".
    kategorie: "Vorrat",
    keywords: [
      "nudel", "spaghetti", "pasta", "reis", "linsen", "couscous", "quinoa",
      "zucker", "salz", "essig", "öl", "olivenöl", "honig", "marmelade",
      "nuss-nougat", "nuss", "erdnuss", "mandel", "cashew", "walnuss",
      "schokolade", "schoko", "süßigkeit", "bonbon", "gummibär", "chips",
      "knabber", "gewürz", "curry", "chili", "pfeffer", "paprikapulver",
      "zimt", "vanille", "backpulver", "brühe", "senf", "ketchup",
      "mayonnaise", "sojasauce", "müsli", "cornflakes", "haferflocken",
    ],
  },
];

/**
 * Erkennt anhand von Stichwörtern im Artikelnamen eine passende Kategorie.
 * Gibt den Kategorienamen zurück (muss in EinkaufsKategorie existieren) oder null,
 * wenn nichts erkannt wurde (→ landet dann in "Sonstiges"). Spezifikations-Modifikatoren
 * (Verpackungs-/Zubereitungsart wie "Dose" oder "TK") haben Vorrang vor der reinen
 * Zutaten-Erkennung.
 */
export function erkenneKategorie(artikelName: string): string | null {
  const name = artikelName.toLowerCase().trim();
  if (!name) return null;
  for (const regel of SPEZIFIKATIONS_REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) {
      return regel.kategorie;
    }
  }
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) {
      return regel.kategorie;
    }
  }
  return null;
}
