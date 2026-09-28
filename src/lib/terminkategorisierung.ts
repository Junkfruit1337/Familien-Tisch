// Erkennt automatisch, um welche Art von Termin es sich handelt — Stichwort-basiert,
// analog zu erkenneKategorie() für die Einkaufsliste. Entscheidung laut Fragenkatalog
// Frage 3: keine manuelle Auswahl mehr, die App soll das selbst erkennen.
// Kein "use server" / keine Prisma-Abhängigkeit -> darf direkt in Client-Komponenten
// für eine Live-Vorschau importiert werden.

const HOBBY_STICHWORTE = [
  "training", "fußball", "fussball", "handball", "reiten", "tennis", "schwimmen",
  "musik", "klavier", "gitarre", "chor", "ballett", "tanz", "turnen", "verein",
  "wettkampf", "spiel", "probe", "kurs",
];

const AUSFLUG_STICHWORTE = [
  "ausflug", "zoo", "kino", "urlaub", "reise", "wandern", "museum", "schwimmbad",
  "freizeitpark", "besuch bei", "geburtstagsfeier", "feier", "fest", "event",
];

// Fix-Batch 150 (Audit-Fund): "verein" traf als Teilstring auch "vereinbart"/"Vereinbarung"
// (z. B. "Arzttermin (telefonisch vereinbart)" wurde fälschlich als Hobby erkannt), "probe"
// traf auch "Blutprobe" (Arzttermin statt Hobby). Dieselbe Ausnahme-Technik wie in
// kategorisierung.ts für die Einkaufsliste.
// Fix-Batch 151 (Audit-Fund, Zweitprüfung): "abstrich" stand hier ursprünglich mit in der
// probe-Ausnahmeliste, enthält aber selbst gar nicht den Substring "probe" — die Ausnahme
// hätte also nie gegriffen (toter Eintrag), entfernt.
const AUSNAHMEN: Record<string, string[]> = {
  verein: ["vereinbart", "vereinbarung"],
  probe: ["blutprobe", "urinprobe"],
};

function stichwortTrifftZu(t: string, stichwort: string): boolean {
  if (!t.includes(stichwort)) return false;
  const ausnahmen = AUSNAHMEN[stichwort];
  return !ausnahmen?.some((a) => t.includes(a));
}

export function erkenneTerminKategorie(titel: string): "TERMIN" | "HOBBY" | "AUSFLUG" {
  const t = titel.toLowerCase();
  if (HOBBY_STICHWORTE.some((s) => stichwortTrifftZu(t, s))) return "HOBBY";
  if (AUSFLUG_STICHWORTE.some((s) => stichwortTrifftZu(t, s))) return "AUSFLUG";
  return "TERMIN";
}

export const TERMIN_KATEGORIE_LABEL: Record<string, string> = {
  TERMIN: "Termin",
  HOBBY: "Hobby",
  AUSFLUG: "Ausflug",
  SCHULE: "Schule",
  DIENST: "Dienst",
};
