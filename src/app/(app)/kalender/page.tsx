import { getCurrentPerson } from "@/lib/auth";
import { listTermine, listPersonenFuerFilter } from "./actions";
import KalenderClient from "./KalenderClient";

export default async function KalenderPage() {
  const person = await getCurrentPerson();
  const termine = await listTermine();
  const personen = await listPersonenFuerFilter();

  return (
    <KalenderClient
      istEltern={person?.rolle === "ELTERN"}
      eigeneId={person!.id}
      termine={termine.map((t) => ({
        id: t.id,
        titel: t.titel,
        start: t.start.toISOString(),
        ende: t.ende?.toISOString() ?? null,
        ganztaegig: t.ganztaegig,
        kategorie: t.kategorie,
        personId: t.personId,
        personName: t.person?.name ?? "Familie",
        personFarbe: t.person?.farbe ?? "#8a7a63",
      }))}
      personen={personen.map((p) => ({ id: p.id, name: p.name, farbe: p.farbe }))}
    />
  );
}
