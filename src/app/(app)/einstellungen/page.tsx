import { getCurrentPerson } from "@/lib/auth";
import { listPersonen } from "./actions";
import EinstellungenClient from "./EinstellungenClient";

export default async function EinstellungenPage() {
  const person = await getCurrentPerson();
  const personen = await listPersonen();

  return (
    <EinstellungenClient
      istEltern={person?.rolle === "ELTERN"}
      personen={personen.map((p) => ({ id: p.id, name: p.name, rolle: p.rolle, farbe: p.farbe, aktiv: p.aktiv, hatPin: !!p.pinHash }))}
    />
  );
}
