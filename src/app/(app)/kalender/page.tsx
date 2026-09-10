import { getCurrentPerson } from "@/lib/auth";
import {
  listTermine,
  listPersonenFuerFilter,
  listAufgabenMitFaelligkeit,
  listSchulEintraegeFuerKalender,
  listDienstFuerKalender,
} from "./actions";
import KalenderClient from "./KalenderClient";

const SCHUL_ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Klassenarbeit",
  HAUSAUFGABEN_KONTROLLE: "HÜ-Kontrolle",
  EPOCHALNOTE: "Epochalnote",
};

export default async function KalenderPage() {
  const person = await getCurrentPerson();
  const [termine, aufgaben, personen, schulEintraege, diensteHeute] = await Promise.all([
    listTermine(),
    listAufgabenMitFaelligkeit(),
    listPersonenFuerFilter(),
    listSchulEintraegeFuerKalender(),
    listDienstFuerKalender(),
  ]);

  const terminEintraege = termine.map((t) => ({
    id: t.id,
    typ: "termin" as const,
    titel: t.titel,
    start: t.start.toISOString(),
    ende: t.ende?.toISOString() ?? null,
    ganztaegig: t.ganztaegig,
    kategorie: t.kategorie,
    personId: t.personId,
    personName: t.person?.name ?? "Familie",
    personFarbe: t.person?.farbe ?? "#8a7a63",
    erledigt: false,
    seriesId: t.seriesId,
  }));

  const aufgabenEintraege = aufgaben.map((a) => ({
    id: a.id,
    typ: "aufgabe" as const,
    titel: a.titel,
    start: a.faelligkeit!.toISOString(),
    ende: null,
    ganztaegig: true,
    kategorie: "AUFGABE",
    personId: a.personId,
    personName: a.person?.name ?? "Familie",
    personFarbe: a.person?.farbe ?? "#8a7a63",
    erledigt: a.erledigt,
    seriesId: null,
  }));

  const schulEintraegeEintraege = schulEintraege.map((s) => ({
    id: s.id,
    typ: "schule" as const,
    titel: `${SCHUL_ART_LABEL[s.art] ?? s.art}${s.fachName ? ` (${s.fachName})` : ""}: ${s.titel}`,
    start: s.datum.toISOString(),
    ende: null,
    ganztaegig: true,
    kategorie: "SCHULE",
    personId: s.personId,
    personName: s.person?.name ?? "—",
    personFarbe: s.person?.farbe ?? "#8a7a63",
    erledigt: false,
    seriesId: null,
  }));

  const dienstEintraege = diensteHeute.map((d, i) => ({
    id: `dienst-${d.datum}-${d.schichtNummer}`,
    typ: "dienst" as const,
    titel: `Dienst (Schicht ${d.schichtNummer}): ${d.kindName}`,
    start: d.datum,
    ende: null,
    ganztaegig: true,
    kategorie: "DIENST",
    personId: null,
    personName: d.kindName,
    personFarbe: d.kindFarbe,
    erledigt: false,
    seriesId: null,
  }));

  const alleEintraege = [...terminEintraege, ...aufgabenEintraege, ...schulEintraegeEintraege, ...dienstEintraege].sort(
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
