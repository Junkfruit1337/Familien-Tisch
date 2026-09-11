// Automatische Piktogramm-Erkennung fürs Sparziel (Fix-Batch 32 Nachtrag, Florians Wunsch
// nach einem Icon-System wie bei den Einkaufsliste-Kacheln) — Stichwort-zu-Emoji-Zuordnung
// mit allgemeinem Schlusslicht 🎯, analog artikelIcon.ts. Bewusst eine breite Stichwortliste
// (nicht nur ein paar Beispiele), damit möglichst selten der generische Fallback greift.
const REGELN: { icon: string; keywords: string[] }[] = [
  { icon: "🚲", keywords: ["fahrrad", "rennrad", "mountainbike", "rad "] },
  { icon: "🛴", keywords: ["roller", "scooter", "tretroller"] },
  { icon: "🛹", keywords: ["skateboard", "inliner", "inline-skate"] },
  { icon: "🛼", keywords: ["rollschuh"] },
  { icon: "🎮", keywords: ["konsole", "playstation", "ps5", "ps4", "xbox", "controller", "gamepad"] },
  { icon: "🕹️", keywords: ["nintendo", "switch", "gameboy"] },
  { icon: "📱", keywords: ["handy", "smartphone", "iphone", "samsung galaxy"] },
  { icon: "📟", keywords: ["tablet", "ipad"] },
  { icon: "💻", keywords: ["laptop", "notebook", "macbook", "computer", "pc "] },
  { icon: "🖥️", keywords: ["monitor", "bildschirm"] },
  { icon: "🎧", keywords: ["kopfhörer", "headset", "airpods", "ohrhörer"] },
  { icon: "🔊", keywords: ["lautsprecher", "box ", "boombox"] },
  { icon: "⌚", keywords: ["uhr", "smartwatch"] },
  { icon: "📷", keywords: ["kamera", "fotoapparat"] },
  { icon: "🧩", keywords: ["lego", "puzzle", "playmobil"] },
  { icon: "🧸", keywords: ["kuscheltier", "plüschtier", "teddy"] },
  { icon: "🪆", keywords: ["puppe", "puppenhaus"] },
  { icon: "🎲", keywords: ["brettspiel", "gesellschaftsspiel", "würfelspiel"] },
  { icon: "🃏", keywords: ["kartenspiel", "pokemon", "sammelkarten"] },
  { icon: "⚽", keywords: ["fußball"] },
  { icon: "🏀", keywords: ["basketball"] },
  { icon: "🎾", keywords: ["tennis"] },
  { icon: "🏓", keywords: ["tischtennis", "ping pong"] },
  { icon: "🏸", keywords: ["badminton"] },
  { icon: "🎣", keywords: ["angel", "angeln"] },
  { icon: "🏊", keywords: ["schwimmen", "schwimmkurs"] },
  { icon: "🎿", keywords: ["ski", "snowboard"] },
  { icon: "🎸", keywords: ["gitarre", "e-gitarre", "bass"] },
  { icon: "🎹", keywords: ["keyboard", "klavier", "piano"] },
  { icon: "🥁", keywords: ["schlagzeug", "trommel"] },
  { icon: "🎻", keywords: ["geige", "violine"] },
  { icon: "🎺", keywords: ["trompete"] },
  { icon: "📚", keywords: ["buch", "bücher", "manga", "comic"] },
  { icon: "🖍️", keywords: ["malkasten", "stifte", "bastel", "kreativset"] },
  { icon: "🧵", keywords: ["nähmaschine", "nähen"] },
  { icon: "🐶", keywords: ["hund", "welpe"] },
  { icon: "🐱", keywords: ["katze", "kätzchen"] },
  { icon: "🐹", keywords: ["hamster", "meerschweinchen"] },
  { icon: "🐰", keywords: ["kaninchen", "hase"] },
  { icon: "🐠", keywords: ["aquarium", "fische"] },
  { icon: "🐴", keywords: ["pferd", "pony", "reiten", "reitunterricht"] },
  { icon: "✈️", keywords: ["reise", "urlaub", "flug", "flugreise"] },
  { icon: "⛺", keywords: ["zelt", "camping"] },
  { icon: "🎡", keywords: ["freizeitpark", "erlebnispark", "europapark"] },
  { icon: "🎢", keywords: ["achterbahn"] },
  { icon: "🏊‍♂️", keywords: ["schwimmbad", "freibad"] },
  { icon: "🎬", keywords: ["kino"] },
  { icon: "🎁", keywords: ["geschenk", "überraschung"] },
  { icon: "👟", keywords: ["schuhe", "sneaker", "turnschuhe"] },
  { icon: "👗", keywords: ["kleid", "klamotten", "outfit", "mode"] },
  { icon: "🎒", keywords: ["ranzen", "rucksack", "schultasche"] },
  { icon: "🛏️", keywords: ["bett", "möbel", "zimmer einrichten"] },
  { icon: "🚗", keywords: ["auto", "führerschein"] },
  { icon: "🎫", keywords: ["konzert", "ticket", "festival"] },
];

export function erkenneSparzielIcon(bezeichnung: string): string {
  const name = bezeichnung.toLowerCase().trim();
  if (!name) return "🎯";
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) return regel.icon;
  }
  return "🎯";
}
