// Einfache Stichwort-Erkennung für die automatische Kategorisierung von Einkaufsartikeln.
// Deckt die 7 Standard-Kategorien aus dem Seed ab (alles andere bleibt "Sonstiges").
const REGELN: { kategorie: string; keywords: string[] }[] = [
  {
    kategorie: "Obst & Gemüse",
    keywords: [
      "tomate", "gurke", "apfel", "banane", "kartoffel", "zwiebel", "salat",
      "paprika", "karotte", "möhre", "zitrone", "orange", "birne", "traube",
      "spinat", "brokkoli", "pilz", "knoblauch", "avocado", "beere",
      "erdbeere", "himbeere", "blaubeere", "kohl", "lauch", "radieschen",
      "kürbis", "zucchini", "mais", "sellerie",
    ],
  },
  {
    kategorie: "Milchprodukte",
    keywords: [
      "milch", "käse", "joghurt", "butter", "quark", "sahne", "frischkäse",
      "buttermilch", "mozzarella", "ei", "eier", "schmand", "parmesan",
    ],
  },
  {
    kategorie: "Fleisch & Fisch",
    keywords: [
      "hähnchen", "huhn", "rind", "schwein", "hack", "wurst", "schinken",
      "fisch", "lachs", "thunfisch", "salami", "speck", "geflügel", "pute",
    ],
  },
  {
    kategorie: "Backwaren",
    keywords: ["brot", "brötchen", "toast", "kuchen", "mehl", "croissant", "baguette", "keks", "waffel"],
  },
  {
    kategorie: "Tiefkühl",
    keywords: ["tiefkühl", "tk-", "pizza", "eis", "pommes", "fischstäbchen", "gefroren"],
  },
  {
    kategorie: "Getränke",
    keywords: ["wasser", "saft", "cola", "limo", "bier", "wein", "kaffee", "tee", "sprudel", "sekt"],
  },
  {
    kategorie: "Drogerie",
    keywords: [
      "shampoo", "duschgel", "zahnpasta", "seife", "toilettenpapier",
      "klopapier", "windel", "creme", "deo", "waschmittel", "spülmittel",
      "binde", "tampon", "rasierer",
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
