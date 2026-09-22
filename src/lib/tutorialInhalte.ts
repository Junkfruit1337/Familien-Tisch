// Fix-Batch 88 (Florians Wunsch): Inhalte für die In-App-Einführung ("Tutorial"), erreichbar
// über Einstellungen. Bewusst NICHT jede einzelne Funktion jeder Seite auflisten (zu lang,
// veraltet sonst bei jedem Fix-Batch sofort) — stattdessen pro Bereich der Nutzen in 1-2
// Sätzen plus die 2-4 Kernfunktionen, die den Unterschied machen. Farben/Icons bewusst
// identisch zur unteren Reiterleiste (AppShell.tsx), damit die Einführung sofort wiedererkennbar
// auf die echte Navigation verweist.
//
// Pflege-Hinweis: wenn ein Fix-Batch eine wirklich neue, für Endnutzer sichtbare Kernfunktion
// bringt (kein reiner Bugfix), hier kurz ergänzen — analog dazu, wie FAHRPLAN.md nach jedem
// Fix-Batch aktualisiert wird.

import { BEREICH_FARBEN } from "./bereichFarben";

export type TutorialKapitel = {
  id: string;
  titel: string;
  farbe: string;
  nutzen: string;
  punkte: string[];
  punkteEltern?: string[];
  punkteKind?: string[];
};

export const TUTORIAL_KAPITEL: TutorialKapitel[] = [
  {
    id: "willkommen",
    titel: "Willkommen bei Familientisch",
    farbe: BEREICH_FARBEN.dashboard,
    nutzen:
      "Familientisch bündelt den Familienalltag an einem Ort — Kalender, Aufgaben, Essensplan, Einkaufsliste, Schule und Dienste, für alle sichtbar statt über Zettel, Chats und Kopf verteilt.",
    punkte: ["Diese Einführung kannst du jederzeit hier in den Einstellungen erneut öffnen.", "Wische auf jedem Bildschirm nach links oder rechts, um zwischen den Reitern zu wechseln."],
  },
  {
    id: "heute",
    titel: "Heute",
    farbe: BEREICH_FARBEN.dashboard,
    nutzen: "Der erste Blick am Morgen — was heute wichtig ist, ohne erst durch jeden einzelnen Bereich zu klicken.",
    punkte: [
      "Heutiges Gericht (inkl. Zusatzmahlzeiten) mit den tatsächlich geplanten Mengen antippen und ansehen",
      "Heutige Termine und die Zahl offener Aufgaben",
      "Nächste anstehende Schularbeit/HÜ-Kontrolle mit Lerntipp",
      "Warnung, wenn für ein geplantes Gericht noch nicht eingekauft wurde",
    ],
    punkteEltern: ["Offene Anfragen der Kinder (eingereichte Noten, Einkaufswünsche) zum direkten Entscheiden"],
  },
  {
    id: "kalender",
    titel: "Kalender",
    farbe: BEREICH_FARBEN.kalender,
    nutzen: "Alle Termine der Familie an einem Ort — statt in getrennten Kalendern oder Zetteln am Kühlschrank.",
    punkte: [
      "Termine für die ganze Familie oder nur einzelne Personen anlegen, auch über mehrere Tage",
      "Wiederkehrende Termine (täglich, wöchentlich, monatlich, ...)",
      "Geburtstage erscheinen automatisch jedes Jahr",
      "Anhänge (Foto/PDF) und eine Notiz je Termin",
    ],
  },
  {
    id: "aufgaben",
    titel: "Aufgaben",
    farbe: BEREICH_FARBEN.aufgaben,
    nutzen: "Wer macht was bis wann — damit nichts vergessen wird und nichts doppelt gemacht wird.",
    punkte: ["Aufgaben für einzelne Personen oder die ganze Familie", "Fälligkeit und Wiederholung einstellbar", "Erledigtes einfach abhaken"],
  },
  {
    id: "essen",
    titel: "Essen",
    farbe: BEREICH_FARBEN.essensplan,
    nutzen: "Die Woche durchplanen, inklusive automatisch berechneter Mengen für alle, die mitessen.",
    punkte: [
      "Rezepte per Foto, Sprachaufnahme, Suche oder KI-Vorschlag anlegen",
      "Menge passt sich automatisch daran an, wer an dem Tag mitisst",
      "Zusatzmahlzeiten wie Frühstück oder Mittags-Snack extra einplanen",
    ],
    punkteEltern: ["Zutaten eines Gerichts mit einem Klick zur Prüfung auf die Einkaufsliste übernehmen"],
  },
  {
    id: "einkauf",
    titel: "Einkauf",
    farbe: BEREICH_FARBEN.einkaufsliste,
    nutzen: "Die Einkaufsliste, die mitdenkt — Mengen werden zusammengezählt, Kategorien automatisch erkannt und dazugelernt.",
    punkte: [
      "Artikel per Text, Sprache oder Foto hinzufügen",
      "Kategorien werden automatisch erkannt und merken sich Korrekturen",
      "Einkaufsmodus hält den Bildschirm wach und blendet Kopfbereich/Navigation aus, während du abhakst",
      "Liste als Text exportieren oder teilen",
    ],
    punkteKind: ["Wünsche einreichen, die die Eltern genehmigen oder ablehnen"],
  },
  {
    id: "schule",
    titel: "Schule",
    farbe: BEREICH_FARBEN.schule,
    nutzen: "Noten, Taschengeld und Sparziele im Blick — für Kinder und Eltern gleichermaßen.",
    punkte: [
      "Notenübersicht: alle Fächer auf einen Blick als Kacheln, antippen öffnet die Details",
      "Noten eintragen, Durchschnitt wird automatisch berechnet",
      "Bei mündlichen Noten „zwischen zwei Noten“ zusätzlich + oder − eintragen — rein informativ, zählt nicht in Schnitt oder Taschengeld",
      "Taschengeld-Verlauf und Sparziel-Fortschritt",
      "Anstehende Arbeiten/HÜ-Kontrollen mit Lerntipps",
      "THG-App (Stundenplan/Vertretungsplan) per Knopf oben öffnen",
    ],
    punkteEltern: ["Übersicht „Für alle Kinder“ ganz oben: was über alle Kinder hinweg ansteht"],
  },
  {
    id: "dienste",
    titel: "Dienste",
    farbe: BEREICH_FARBEN.dienstplan,
    nutzen: "Wer ist diese Woche wofür zuständig — fair verteilt und bei Bedarf tauschbar.",
    punkte: ["Dienste rollieren automatisch durch die Familie", "Tausch zwischen zwei Personen möglich"],
  },
  {
    id: "mehr",
    titel: "Mehr",
    farbe: BEREICH_FARBEN.einstellungen,
    nutzen: "Alles rund um die App selbst — Aussehen, Benachrichtigungen und Feedback.",
    punkte: [
      "Design-Vorlage, Icon-Stil (bunt/minimalistisch) und Hell/Dunkel-Modus wählen",
      // Fix-Batch 142: Nachrichten-Thread je Ticket ergänzt.
      "Fehler melden oder Verbesserungen vorschlagen, per Nachricht nachträglich ergänzen",
      "Eigene PIN jederzeit selbst ändern",
    ],
    punkteEltern: [
      // Fix-Batch 140 (Florians Wunsch: Admin- vs. Erwachsene-Rolle): diese strukturellen
      // Einstellungen sind jetzt nur noch für den Admin sichtbar/nutzbar.
      "Familienmitglieder, Kategorien, Dienste und Notengewichtung verwalten (nur Admin)",
      "Termine aus einem anderen Kalender (z. B. Faminice) als ICS-Datei importieren",
      // Fix-Batch 141: bewusst kurz gehalten, das Feature selbst soll in den Einstellungen
      // unauffällig bleiben.
      "Kiosk-Modus für ein dauerhaft angezeigtes Tablet (z. B. in der Küche)",
    ],
  },
];
