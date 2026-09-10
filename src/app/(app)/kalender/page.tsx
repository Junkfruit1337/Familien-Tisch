import { getCurrentPerson } from "@/lib/auth";
import { listTermine, listPersonenFuerFilter, listAufgabenMitFaelligkeit } from "./actions";
import KalenderClient from "./KalenderClient";

export default async function KalenderPage() {
  const person = await getCurrentPerson();
  const [termine, aufgaben, personen] = await Promise.all([
    listTermine(),
    listAufgabenMitFaelligkeit(),
    listPersonenFuerFilter(),
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
  }));

  const alleEintraege = [...terminEintraege, ...aufgabenEintraege].sort(
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
