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

export function erkenneTerminKategorie(titel: string): "TERMIN" | "HOBBY" | "AUSFLUG" {
  const t = titel.toLowerCase();
  if (HOBBY_STICHWORTE.some((s) => t.includes(s))) return "HOBBY";
  if (AUSFLUG_STICHWORTE.some((s) => t.includes(s))) return "AUSFLUG";
  return "TERMIN";
}

export const TERMIN_KATEGORIE_LABEL: Record<string, string> = {
  TERMIN: "Termin",
  HOBBY: "Hobby",
  AUSFLUG: "Ausflug",
  SCHULE: "Schule",
  DIENST: "Dienst",
};
