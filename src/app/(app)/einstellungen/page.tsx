import { getCurrentPerson } from "@/lib/auth";
import { listPersonen, listMeineTickets, listAlleTickets, listHausprobleme } from "./actions";
import { listKategorien } from "../einkaufsliste/actions";
import { listKinder, listFaecher, listNotenGewichtung } from "../schule/actions";
import { listDienstkatalog, listTagesroutinen, listKoerperpflegeplan } from "../dienstplan/actions";
import { getAenderungshistorie } from "../dashboard/actions";
import EinstellungenClient from "./EinstellungenClient";

export default async function EinstellungenPage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const personen = await listPersonen();
  const meineTickets = await listMeineTickets();
  const alleTickets = istEltern ? await listAlleTickets() : [];
  const hausprobleme = await listHausprobleme();

  const kategorien = istEltern ? await listKategorien() : [];
  const dienstkatalog = istEltern ? await listDienstkatalog() : [];
  const historie = istEltern ? await getAenderungshistorie() : [];
  const tagesroutinen = await listTagesroutinen();
  const koerperpflegeplan = await listKoerperpflegeplan();
  const kinder = istEltern ? await listKinder() : person ? [person] : [];
  const kinderDaten = await Promise.all(
    kinder.map(async (k) => {
      const [faecher, gewichtung] = await Promise.all([listFaecher(k.id), listNotenGewichtung(k.id)]);
      return {
        id: k.id,
        name: k.name,
        faecher: faecher.map((f) => ({ id: f.id, name: f.name })),
        gewichtung,
        bundesland: k.bundesland,
        klassenstufe: k.klassenstufe,
        klasse: k.klasse,
      };
    })
  );

  return (
    <EinstellungenClient
      istEltern={!!istEltern}
      eigeneId={person!.id}
      personen={personen.map((p) => ({
        id: p.id,
        name: p.name,
        rolle: p.rolle,
        farbe: p.farbe,
        aktiv: p.aktiv,
        hatPin: !!p.pinHash,
        portionsGewicht: p.portionsGewicht,
        geburtsdatum: p.geburtsdatum ? p.geburtsdatum.toISOString() : null,
      }))}
      kategorien={kategorien.map((k) => ({ id: k.id, name: k.name, reihenfolge: k.reihenfolge }))}
      kinder={kinderDaten}
      dienstkatalog={dienstkatalog.map((d) => ({
        id: d.id,
        schichtNummer: d.schichtNummer,
        reihenfolge: d.reihenfolge,
        bezeichnung: d.bezeichnung,
        beschreibung: d.beschreibung,
      }))}
      tagesroutinen={tagesroutinen.map((r) => ({ id: r.id, kategorie: r.kategorie, text: r.text }))}
      koerperpflegeplan={koerperpflegeplan.map((k) => ({ wochentag: k.wochentag, text: k.text }))}
      historie={historie}
      meineTickets={meineTickets.map((t) => ({
        id: t.id,
        titel: t.titel,
        beschreibung: t.beschreibung,
        status: t.status,
        begruendung: t.begruendung,
        fotos: t.fotos,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      alleTickets={alleTickets.map((t) => ({
        id: t.id,
        titel: t.titel,
        beschreibung: t.beschreibung,
        status: t.status,
        begruendung: t.begruendung,
        fotos: t.fotos,
        erstellerName: t.erstelltVon.name,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      hausprobleme={hausprobleme.map((h) => ({
        id: h.id,
        titel: h.titel,
        beschreibung: h.beschreibung,
        status: h.status,
        zustaendigkeit: h.zustaendigkeit,
        notizen: h.notizen,
        fotos: h.fotos,
        aufgabeId: h.aufgabeId,
        erstellerName: h.erstelltVon.name,
        createdAt: h.createdAt.toISOString(),
      }))}
    />
  );
}
