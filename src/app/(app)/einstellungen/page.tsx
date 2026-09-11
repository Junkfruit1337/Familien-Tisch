import { getCurrentPerson } from "@/lib/auth";
import { listPersonen } from "./actions";
import { listKategorien } from "../einkaufsliste/actions";
import { listKinder, listFaecher, listNotenGewichtung } from "../schule/actions";
import { listDienstkatalog } from "../dienstplan/actions";
import { getAenderungshistorie } from "../dashboard/actions";
import EinstellungenClient from "./EinstellungenClient";

export default async function EinstellungenPage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const personen = await listPersonen();

  const kategorien = istEltern ? await listKategorien() : [];
  const dienstkatalog = istEltern ? await listDienstkatalog() : [];
  const historie = istEltern ? await getAenderungshistorie() : [];
  const kinder = istEltern ? await listKinder() : [];
  const kinderDaten = istEltern
    ? await Promise.all(
        kinder.map(async (k) => {
          const [faecher, gewichtung] = await Promise.all([listFaecher(k.id), listNotenGewichtung(k.id)]);
          return {
            id: k.id,
            name: k.name,
            faecher: faecher.map((f) => ({ id: f.id, name: f.name })),
            gewichtung,
          };
        })
      )
    : [];

  return (
    <EinstellungenClient
      istEltern={!!istEltern}
      personen={personen.map((p) => ({ id: p.id, name: p.name, rolle: p.rolle, farbe: p.farbe, aktiv: p.aktiv, hatPin: !!p.pinHash, portionsGewicht: p.portionsGewicht }))}
      kategorien={kategorien.map((k) => ({ id: k.id, name: k.name, reihenfolge: k.reihenfolge }))}
      kinder={kinderDaten}
      dienstkatalog={dienstkatalog.map((d) => ({
        id: d.id,
        schichtNummer: d.schichtNummer,
        reihenfolge: d.reihenfolge,
        bezeichnung: d.bezeichnung,
        beschreibung: d.beschreibung,
      }))}
      historie={historie}
    />
  );
}
