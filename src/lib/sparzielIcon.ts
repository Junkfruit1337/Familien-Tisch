// Automatische Piktogramm-Erkennung fürs Sparziel (Fix-Batch 30, Florians Wunsch nach einem
// Icon-System wie bei den Einkaufsliste-Kacheln) — Stichwort-zu-Emoji-Zuordnung mit
// allgemeinem Schlusslicht 🎯, analog artikelIcon.ts.
const REGELN: { icon: string; keywords: string[] }[] = [
  { icon: "🚲", keywords: ["fahrrad", "rad", "bike"] },
  { icon: "🛴", keywords: ["roller", "scooter"] },
  { icon: "🎮", keywords: ["konsole", "playstation", "nintendo", "switch", "xbox", "controller"] },
  { icon: "📱", keywords: ["handy", "smartphone", "iphone", "tablet", "ipad"] },
  { icon: "💻", keywords: ["laptop", "computer", "pc"] },
  { icon: "🎧", keywords: ["kopfhörer", "headset"] },
  { icon: "🧩", keywords: ["lego", "puzzle", "spielzeug"] },
  { icon: "⚽", keywords: ["fußball", "ball"] },
  { icon: "🛹", keywords: ["skateboard"] },
  { icon: "🎸", keywords: ["gitarre", "keyboard", "instrument"] },
  { icon: "📚", keywords: ["buch", "bücher"] },
  { icon: "🐶", keywords: ["hund", "haustier", "welpe"] },
  { icon: "🐱", keywords: ["katze", "kätzchen"] },
  { icon: "✈️", keywords: ["reise", "urlaub", "flug"] },
  { icon: "🎡", keywords: ["freizeitpark", "erlebnispark"] },
  { icon: "👟", keywords: ["schuhe", "sneaker"] },
  { icon: "🎁", keywords: ["geschenk"] },
];

export function erkenneSparzielIcon(bezeichnung: string): string {
  const name = bezeichnung.toLowerCase().trim();
  if (!name) return "🎯";
  for (const regel of REGELN) {
    if (regel.keywords.some((kw) => name.includes(kw))) return regel.icon;
  }
  return "🎯";
}
