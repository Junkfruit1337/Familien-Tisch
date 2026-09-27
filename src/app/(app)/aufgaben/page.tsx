import { getCurrentPerson } from "@/lib/auth";
import { listAufgaben } from "./actions";
import { listPersonenFuerFilter } from "../kalender/actions";
import AufgabenClient from "./AufgabenClient";

export default async function AufgabenPage() {
  const person = await getCurrentPerson();
  const aufgaben = await listAufgaben();
  const personen = await listPersonenFuerFilter();

  return (
    <AufgabenClient
      istEltern={person?.rolle === "ELTERN"}
      eigeneId={person!.id}
      aufgaben={aufgaben.map((a) => ({
        id: a.id,
        titel: a.titel,
        faelligkeit: a.faelligkeit?.toISOString() ?? null,
        erledigt: a.erledigt,
        personId: a.personId,
        personName: a.person?.name ?? "Familie",
        seriesId: a.seriesId,
        // Fix-Batch 149 (Audit-Fund): fehlte hier bisher, obwohl der Server (deleteAufgabe)
        // beim Löschen auf erstelltVonId statt personId prüft — der Client konnte also
        // strukturell gar nicht korrekt entscheiden, wem der Löschen-Button angezeigt wird.
        erstelltVonId: a.erstelltVonId,
      }))}
      personen={personen.map((p) => ({ id: p.id, name: p.name, farbe: p.farbe }))}
    />
  );
}
