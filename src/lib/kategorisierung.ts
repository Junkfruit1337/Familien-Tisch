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
    keywords: [
      "dose", "dosen", "konserve", "konserven", "eingelegt", "eingemacht", "einweckglas",
      // Fix-Batch 71 (Florians Beispiel "passierte Tomaten"): Produkte, die praktisch immer
      // in Dosen/Gläsern verkauft werden, auch ohne dass "Dose" im Namen steht.
      "passierte tomate", "stückige tomate", "geschälte tomate", "tomatenmark",
      "kichererbse", "kidneybohne",
    ],
  },
  {
    kategorie: "Tiefkühl",
    keywords: ["tiefkühl", "tiefgefroren", "gefroren", "tk-", "tk ", "(tk)", " tk)", "tk)"],
  },
  // Fix-Batch 145 (Ticket #8, Florians Bug-Meldung "Lebensmittelerkennung... erheblich
  // verbessern"): "Kokosmilch" enthält als Substring "milch" und landete dadurch fälschlich
  // bei Milchprodukten — tatsächlich ein lang haltbares Vorrats-Produkt (Curry/Asia-Küche),
  // kein Kühlregal-Artikel. Muss vor der generischen "milch"-Regel geprüft werden.
  // Fix-Batch 150 (Audit-Fund): dieselbe Fehlerklasse betrifft auch pflanzliche Milch-
  // Alternativen (Mandel-/Hafer-/Soja-/Reismilch) — ebenfalls Vorrats-/Trocken- statt
  // Kühlregal-Produkte im üblichen Sinn dieser App.
  {
    kategorie: "Vorrat",
    keywords: ["kokosmilch", "mandelmilch", "hafermilch", "sojamilch", "reismilch"],
  },
  // Fix-Batch 150 (Audit-Fund): weitere Substring-Kollisionen nach demselben Muster wie
  // Kokosmilch — ein zusammengesetztes Wort enthält zufällig ein Kategorie-Stichwort als
  // Teilstring, gehört aber offensichtlich in eine andere Kategorie.
  { kategorie: "Vorrat", keywords: ["tortellini", "tortelloni"] }, // "torte" → Backwaren wäre falsch
  { kategorie: "Getränke", keywords: ["kaffeebohnen", "bohnenkaffee"] }, // "bohnen" → Gemüse wäre falsch
  { kategorie: "Vorrat", keywords: ["kartoffelchips"] }, // "kartoffel" → Gemüse wäre falsch
  { kategorie: "Vorrat", keywords: ["biersenf"] }, // "bier" → Getränke wäre falsch
  { kategorie: "Vorrat", keywords: ["rotweinessig", "weißweinessig", "weissweinessig"] }, // "wein" → Getränke wäre falsch
];

// Fix-Batch 150 (Audit-Fund): "Ausnahmen" für Stichwörter, die als Teilstring in einem ganz
// anders gemeinten zusammengesetzten Wort vorkommen, aber (anders als die Fälle oben) selbst
// keine eigene Mini-Kategorie-Regel verdienen — hier wird der Treffer einfach unterdrückt,
// die Erkennung fällt dann auf die nächste passende Regel zurück (oder auf "Sonstiges").
const AUSNAHMEN: Record<string, string[]> = {
  birne: ["glühbirne"],
  kohl: ["kohlensäure", "kohlensaeure"],
};

// Exportiert, damit artikelIcon.ts dieselben Ausnahmen für die Icon-Erkennung nutzen kann
// (identische Stichwort-Kollisionen würden sonst dort ein falsches Icon erzeugen).
export function keywordTrifftZu(name: string, keyword: string): boolean {
  if (!name.includes(keyword)) return false;
  const ausnahmen = AUSNAHMEN[keyword];
  return !ausnahmen?.some((a) => name.includes(a));
}

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
      "feta", "hüttenkäse", "kefir", "skyr", "margarine", "crème fraîche", "creme fraiche",
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
      "klopapier", "windel", "deo", "waschmittel", "spülmittel",
      "binde", "tampon", "rasierer", "zahnbürste", "küchenrolle", "taschentuch",
      "lotion", "wattestäbchen", "pflaster",
      "weichspüler", "reiniger", "putzmittel", "müllbeutel",
      // Fix-Batch 150 (Audit-Fund): das generische Stichwort "creme" wurde entfernt — es traf
      // als Teilstring auch Lebensmittel wie "Nuss-Nougat-Creme", "Kokoscreme", "Schokocreme"
      // oder "Cremesuppe" und ordnete sie fälschlich der Drogerie statt Vorrat/Milchprodukten
      // zu. Stattdessen jetzt gezielt die tatsächlichen Kosmetik-Cremes einzeln benannt.
      "sonnencreme", "hautcreme", "handcreme", "gesichtscreme", "bodycreme", "rasiercreme", "nachtcreme", "tagescreme",
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
    if (regel.keywords.some((kw) => keywordTrifftZu(name, kw))) {
      return regel.kategorie;
    }
  }
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => keywordTrifftZu(name, kw))) {
      return regel.kategorie;
    }
  }
  return null;
}
