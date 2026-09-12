import { getCurrentPerson } from "@/lib/auth";
import {
  listTermine,
  listPersonenFuerFilter,
  listAufgabenMitFaelligkeit,
  listSchulEintraegeFuerKalender,
  listGeburtstageFuerKalender,
} from "./actions";
import KalenderClient from "./KalenderClient";

const SCHUL_ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Arbeit",
  HAUSAUFGABEN_KONTROLLE: "HÜ",
  EPOCHALNOTE: "Epo",
};

export default async function KalenderPage() {
  const person = await getCurrentPerson();
  const [termine, aufgaben, personen, schulEintraege, geburtstage] = await Promise.all([
    listTermine(),
    listAufgabenMitFaelligkeit(),
    listPersonenFuerFilter(),
    listSchulEintraegeFuerKalender(),
    listGeburtstageFuerKalender(),
  ]);

  const terminEintraege = termine.map((t) => ({
    id: t.id,
    ids: t.ids,
    typ: "termin" as const,
    titel: t.titel,
    start: t.start.toISOString(),
    ende: t.ende?.toISOString() ?? null,
    ganztaegig: t.ganztaegig,
    kategorie: t.kategorie,
    personen: t.personen.map((p) => ({ id: p.id, name: p.name, farbe: p.farbe })),
    erledigt: false,
    seriesId: t.seriesId,
    gruppeId: t.gruppeId,
    erstelltVonId: t.erstelltVonId,
  }));

  const aufgabenEintraege = aufgaben.map((a) => ({
    id: a.id,
    ids: [a.id],
    typ: "aufgabe" as const,
    titel: a.titel,
    start: a.faelligkeit!.toISOString(),
    ende: null,
    ganztaegig: true,
    kategorie: "AUFGABE",
    personen: a.person ? [{ id: a.person.id, name: a.person.name, farbe: a.person.farbe }] : [],
    erledigt: a.erledigt,
    seriesId: null,
    gruppeId: null,
    erstelltVonId: null,
  }));

  const schulEintraegeEintraege = schulEintraege.map((s) => ({
    id: s.id,
    ids: [s.id],
    typ: "schule" as const,
    titel: `${SCHUL_ART_LABEL[s.art] ?? s.art}${s.fach ? ` (${s.fach.name})` : s.fachName ? ` (${s.fachName})` : ""}: ${s.titel}`,
    start: s.datum.toISOString(),
    ende: null,
    ganztaegig: true,
    kategorie: "SCHULE",
    personen: s.person ? [{ id: s.person.id, name: s.person.name, farbe: s.person.farbe }] : [],
    erledigt: false,
    seriesId: null,
    gruppeId: null,
    erstelltVonId: null,
  }));

  const geburtstagsEintraege = geburtstage.map((g) => ({
    id: g.id,
    ids: [g.id],
    typ: "geburtstag" as const,
    titel: g.titel,
    start: g.start.toISOString(),
    ende: null,
    ganztaegig: true,
    kategorie: "GEBURTSTAG",
    personen: [{ id: "", name: g.personName, farbe: g.personFarbe }],
    erledigt: false,
    seriesId: null,
    gruppeId: null,
    erstelltVonId: null,
  }));

  const alleEintraege = [...terminEintraege, ...aufgabenEintraege, ...schulEintraegeEintraege, ...geburtstagsEintraege].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return (
    <KalenderClient
      istEltern={person?.rolle === "ELTERN"}
      eigeneId={person!.id}
      termine={alleEintraege}
      personen={personen.map((p) => ({ id: p.id, name: p.name, farbe: p.farbe }))}
    />
  );
}
