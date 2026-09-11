// Inhaltliche Vorlage aus Florians Word-Dokument "Schichtsystem" (nachgetragen 11.09.2026,
// siehe FAHRPLAN.md Batch 4). Wird von prisma/seed.ts (Neuinstallation) UND von der
// "Vorlage laden"-Aktion in den Einstellungen (bestehende Installation) genutzt, damit
// der Text nur an einer Stelle gepflegt werden muss.

export const DIENSTE_VORLAGE = [
  {
    schichtNummer: 1,
    reihenfolge: 1,
    bezeichnung: "Küchendienst",
    beschreibung:
      "Zeitraum: Ganztägig.\n" +
      "Aufgaben: Spülmaschine ausräumen, Spülmaschine einräumen, Geschirr abspülen, Küche sauber halten, Küche aufräumen, Küche wischen.\n" +
      "Regeln: Geschirr nicht unnötig stehen lassen. Nach den Mahlzeiten kontrollieren, ob in der Küche etwas zu erledigen ist. Küche ordentlich und sauber hinterlassen.",
  },
  {
    schichtNummer: 1,
    reihenfolge: 2,
    bezeichnung: "Lüftdienst",
    beschreibung:
      "Zeitraum: Morgens.\n" +
      "Aufgaben: Morgens die vorgesehenen Räume lüften, Timer auf 5 Minuten stellen, nach 5 Minuten die Fenster wieder schließen.",
  },
  {
    schichtNummer: 1,
    reihenfolge: 3,
    bezeichnung: "Staubsaugerdienst",
    beschreibung:
      "Zeitraum: Wöchentlich, Haupttag ist Samstag.\n" +
      "Aufgaben: Alle 3 Staubsauger leeren, Staubsaugerroboter reinigen (Behälter vollständig leeren, Bürsten kontrollieren und bei Bedarf reinigen), Geräte anschließend wieder ordentlich zurückstellen.",
  },
  {
    schichtNummer: 2,
    reihenfolge: 1,
    bezeichnung: "Mülldienst",
    beschreibung:
      "Zeitraum: Ganztägige Verantwortung, die regulären Aufgaben werden überwiegend morgens erledigt.\n" +
      "Montag bis Freitag: Morgens alle Mülleimer in der Küche leeren, morgens den Mülleimer im Elternbad leeren, neue Müllbeutel ordentlich einsetzen, im Tagesverlauf darauf achten, dass kein Mülleimer überfüllt ist.\n" +
      "Samstag: Alle Mülleimer im gesamten Haus leeren, Müllboxen reinigen, unter den Müllboxen sauber machen, neue Müllbeutel einsetzen.\n" +
      "Müllabfuhr: Die großen Mülltonnen entsprechend dem Müllkalender rechtzeitig an die Straße stellen (Termine im Familienkalender).",
  },
  {
    schichtNummer: 2,
    reihenfolge: 2,
    bezeichnung: "Tischdienst",
    beschreibung:
      "Zeitraum: Ganztägig.\n" +
      "Aufgaben: Tisch vor den Mahlzeiten decken (Teller, Besteck, Trinkgläser, Untersetzer bereitstellen), Tisch nach den Mahlzeiten abräumen, Tisch abwischen und sauber hinterlassen.",
  },
  {
    schichtNummer: 2,
    reihenfolge: 3,
    bezeichnung: "Lappen- und Handtuchdienst",
    beschreibung:
      "Zeitraum: Hauptsächlich Samstag und Sonntag.\n" +
      "Aufgaben: Saubere Lappen und Handtücher aus dem Keller holen, ordentlich zusammenlegen, an den vorgesehenen Stellen einräumen.",
  },
  {
    schichtNummer: 3,
    reihenfolge: 1,
    bezeichnung: "Wäschedienst",
    beschreibung:
      "Zeitraum: Ganztägige Verantwortung.\n" +
      "Morgens: Dreckwäsche einsammeln, in den Keller bringen, entsprechend sortieren.\n" +
      "Weitere Aufgaben: Anfallende Waschmaschinen übernehmen, Wäsche in den Trockner geben, fertige Wäsche aus Waschmaschine und Trockner holen, sonstige während der Woche anfallende Wäscheaufgaben übernehmen.\n" +
      "Wichtige Trocknerregel: Jedes Mal, wenn Wäsche aus dem Trockner geholt wird, müssen Trocknerwasser UND Flusensieb geleert bzw. gereinigt werden.",
  },
  {
    schichtNummer: 3,
    reihenfolge: 2,
    bezeichnung: "Ranzendienst",
    beschreibung:
      "Zeitraum: Regelmäßig im Zusammenhang mit der Schulvorbereitung.\n" +
      "Aufgaben: Trinkflaschen auffüllen und einpacken, Brotboxen einpacken, darauf achten, dass die Sachen für die Schule vorbereitet sind.\n" +
      "Montag: Brotboxen in den Kühlschrank stellen.",
  },
  {
    schichtNummer: 3,
    reihenfolge: 3,
    bezeichnung: "Badezimmerdienst",
    beschreibung:
      "Zeitraum: Wöchentlich, Haupttag ist Samstag.\n" +
      "Aufgaben: Toilette, Dusche, Waschbecken, Spiegel und Ablagen reinigen.\n" +
      "Handtücher: Normale Handtücher jede Woche wechseln, Körperhandtücher alle zwei Wochen.\n" +
      "Wichtig: Das allgemeine Aufräumen persönlicher Gegenstände gehört NICHT zum Badezimmerdienst — jeder ist selbst dafür verantwortlich, seine eigenen Sachen im Bad wegzuräumen.",
  },
];

export const TAGESROUTINEN_VORLAGE: { kategorie: string; texte: string[] }[] = [
  {
    kategorie: "Morgenroutine",
    texte: [
      "Wichtig: Das Kind, das laut Badreihenfolge zuerst dran ist, geht morgens sofort ins Bad. Die anderen beginnen währenddessen bereits mit ihren übrigen Aufgaben.",
      "Im Bad fertig machen",
      "Im Bad einen Timer auf 10 Minuten stellen",
      "Nach spätestens 10 Minuten das Bad für das nächste Kind freigeben",
      "Eigene Kleidung und Sachen im Bad wieder wegräumen bzw. ordentlich zusammenlegen",
      "Bad so hinterlassen, wie man es vorgefunden hat",
      "Boden im eigenen Bereich/Zimmer aufräumen",
      "Bett machen",
      "Schulsachen nach unten bringen",
      "Die Aufgaben des eigenen aktuellen Dienstes erledigen",
      "Anschließend möglichst gemeinsam frühstücken",
    ],
  },
  {
    kategorie: "Vor dem Losgehen",
    texte: [
      "Persönliche morgendliche Aufgabenliste noch einmal kontrollieren",
      "Kontrollieren, ob die Aufgaben der eigenen Schicht erledigt wurden",
    ],
  },
  {
    kategorie: "Nach Hause kommen",
    texte: ["Jacke ordentlich an den vorgesehenen Platz hängen", "Hände waschen", "Hose bzw. Kleidung wechseln"],
  },
  {
    kategorie: "Nach der Schule",
    texte: [
      "Brotdosen ausräumen",
      "Trinkflaschen ausräumen",
      "Hausaufgaben erledigen",
      "Schulsachen organisieren",
      "Prüfen, welche Klassenarbeiten oder Tests anstehen",
      "Anstehende Arbeiten und Tests eintragen",
      "Lernprioritäten festlegen",
      "Für das Fach lernen, bei dem die nächste Arbeit bzw. der nächste Test ansteht",
    ],
  },
  {
    kategorie: "Lernregel",
    texte: [
      "Jeden Tag mindestens 30 Minuten lernen",
      "Wenn Arbeiten oder Tests anstehen, entsprechend länger lernen",
      "Bei schlechten Noten muss zusätzlich mehr gelernt werden",
    ],
  },
  {
    kategorie: "Abendroutine",
    texte: ["Abendessen", "Schulsachen für den nächsten Tag richten", "Im Bad fertig machen", "Boden bzw. eigene Sachen aufräumen"],
  },
  {
    kategorie: "Badreihenfolge (Regeln)",
    texte: [
      "Für morgens und abends gibt es getrennte Reihenfolgen.",
      "Die Badreihenfolge rotiert wöchentlich gemeinsam mit der Schicht-Rotation.",
      "Morgens hat jedes Kind maximal 10 Minuten im Bad — Timer stellen.",
      "Morgens: Nach Ablauf der Zeit muss das Bad freigemacht werden, auch wenn man noch nicht fertig ist — danach ist sofort das nächste Kind an der Reihe.",
    ],
  },
];

// wochentag: 1 = Montag ... 7 = Sonntag
export const KOERPERPFLEGE_VORLAGE: Record<number, string> = {
  1: "Mit Waschlappen unter den Armen und im Intimbereich waschen",
  2: "Duschen ohne Haare waschen",
  3: "Duschen inklusive Haare waschen",
  4: "Mit Waschlappen unter den Armen und im Intimbereich waschen",
  5: "Duschen ohne Haare waschen",
  6: "Duschen ohne Haare waschen",
  7: "Duschen inklusive Haare waschen",
};
