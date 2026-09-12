import { getCurrentPerson } from "@/lib/auth";
import {
  listArtikel,
  listErledigteArtikel,
  listWuensche,
  listKategorien,
  listVorschlaege,
  listUnbestaetigteArtikel,
  listGelernteIcons,
} from "./actions";
import { listRezepteDetail } from "../essensplan/actions";
import EinkaufslisteClient from "./EinkaufslisteClient";

function zuArtikel(a: { id: string; name: string; menge: string | null; notiz: string | null; iconOverride: string | null; erledigt: boolean; kategorieId: string | null; kategorie: { name: string } | null }) {
  return {
    id: a.id,
    name: a.name,
    menge: a.menge,
    notiz: a.notiz,
    iconOverride: a.iconOverride,
    erledigt: a.erledigt,
    kategorieId: a.kategorieId,
    kategorieName: a.kategorie?.name ?? "Sonstiges",
  };
}

export default async function EinkaufslistePage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const [artikel, erledigtErgebnis, wuensche, kategorien, vorschlaege, unbestaetigt, rezepteAlle, gelernteIcons] = await Promise.all([
    listArtikel(),
    listErledigteArtikel(),
    listWuensche(),
    listKategorien(),
    istEltern ? listVorschlaege() : Promise.resolve([]),
    istEltern ? listUnbestaetigteArtikel() : Promise.resolve([]),
    istEltern ? listRezepteDetail() : Promise.resolve([]),
    listGelernteIcons(),
  ]);

  return (
    <EinkaufslisteClient
      istEltern={istEltern}
      artikel={artikel.map(zuArtikel)}
      erledigtInitial={erledigtErgebnis}
      wuensche={wuensche.map((w) => ({
        id: w.id,
        artikelName: w.artikelName,
        menge: w.menge,
        notiz: w.notiz,
        status: w.status,
        kindName: w.kind.name,
        entschiedenAm: w.entschiedenAm?.toISOString() ?? null,
      }))}
      kategorien={kategorien.map((k) => ({ id: k.id, name: k.name }))}
      vorschlaege={vorschlaege}
      unbestaetigt={unbestaetigt}
      rezepte={rezepteAlle.map((r) => ({ id: r.id, name: r.name }))}
      gelernteIcons={gelernteIcons}
    />
  );
}
