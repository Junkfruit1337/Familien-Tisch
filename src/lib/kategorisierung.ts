// Einfache Stichwort-Erkennung für die automatische Kategorisierung von Einkaufsartikeln.
// Deckt die 8 Standard-Kategorien aus dem Seed ab (alles andere bleibt "Sonstiges").
// Fix-Batch 28: Obst und Gemüse getrennt (Florians Wunsch), "dattel(n)" ergänzt, und das
// bare Stichwort "ei" entfernt — es traf als Teilstring versehentlich auch "entsteint",
// "Reis", "Seife" usw. und kategorisierte sie fälschlich als Milchprodukte.
// Fix-Batch 35 Nachtrag (Bugticket "fehlende Kategorisierung"): Stichwortliste deutlich
// erweitert, analog zur breiteren Liste in artikelIcon.ts. Bewusst NICHT erweitert um
// Grundzutaten/Gewürze/Süßes (Nudeln, Reis, Zucker, Gewürze, Honig, Süßigkeiten, Öl,
// Essig, Nüsse) — die passen semantisch zu keiner der 8 bestehenden Kategorien gut; das
// wäre eine neue 9. Kategorie ("Vorrat"?) und damit Florians Entscheidung, nicht meine.
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
    keywords: [
      "tiefkühl", "tk-", "pizza", "eis ", "eiscreme", "pommes", "fischstäbchen",
      "gefroren", "tiefgefroren", "rahmspinat",
    ],
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
];

/**
 * Erkennt anhand von Stichwörtern im Artikelnamen eine passende Kategorie.
 * Gibt den Kategorienamen zurück (muss in EinkaufsKategorie existieren) oder null,
 * wenn nichts erkannt wurde (→ landet dann in "Sonstiges").
 */
export function erkenneKategorie(artikelName: string): string | null {
  const name = artikelName.toLowerCase().trim();
  if (!name) return null;
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) {
      return regel.kategorie;
    }
  }
  return null;
}
