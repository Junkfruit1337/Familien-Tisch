import { getCurrentPerson } from "@/lib/auth";
import {
  listRezepteDetail,
  getWochenplan,
  listRezepteFuerWoche,
  listAusgeblendeteFuerWoche,
  listAlleFamilienmitglieder,
  pruefeAusgewogenheitDerWoche,
  listExtraMahlzeitenFuerWoche,
} from "./actions";
import EssensplanClient from "./EssensplanClient";

export default async function EssensplanPage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const plan = await getWochenplan(0);
  const [rezepteAlle, rezepteVorschlaege, ausgeblendete, familie, ausgewogenheit, extraMahlzeiten] = await Promise.all([
    listRezepteDetail(),
    listRezepteFuerWoche(plan.wocheStart),
    istEltern ? listAusgeblendeteFuerWoche(plan.wocheStart) : Promise.resolve([]),
    listAlleFamilienmitglieder(),
    istEltern ? pruefeAusgewogenheitDerWoche(plan.wocheStart) : Promise.resolve(null),
    listExtraMahlzeitenFuerWoche(plan.wocheStart),
  ]);

  return (
    <EssensplanClient
      istEltern={!!istEltern}
      plan={plan}
      rezepteAlle={rezepteAlle.map((r) => ({ id: r.id, name: r.name, zutaten: r.zutaten, zubereitung: r.zubereitung, portionenBasis: r.portionenBasis, kategorie: r.kategorie }))}
      rezepteVorschlaege={rezepteVorschlaege}
      ausgeblendete={ausgeblendete}
      familie={familie.map((f) => ({ id: f.id, name: f.name, farbe: f.farbe, portionsGewicht: f.portionsGewicht }))}
      ausgewogenheitInitial={ausgewogenheit}
      extraMahlzeitenInitial={extraMahlzeiten}
    />
  );
}
