import { getCurrentPerson } from "@/lib/auth";
import { listArtikel, listWuensche, listKategorien, listVorschlaege, listUnbestaetigteArtikel } from "./actions";
import { listRezepteDetail } from "../essensplan/actions";
import EinkaufslisteClient from "./EinkaufslisteClient";

export default async function EinkaufslistePage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const [artikel, wuensche, kategorien, vorschlaege, unbestaetigt, rezepteAlle] = await Promise.all([
    listArtikel(),
    listWuensche(),
    listKategorien(),
    istEltern ? listVorschlaege() : Promise.resolve([]),
    istEltern ? listUnbestaetigteArtikel() : Promise.resolve([]),
    istEltern ? listRezepteDetail() : Promise.resolve([]),
  ]);

  return (
    <EinkaufslisteClient
      istEltern={istEltern}
      artikel={artikel.map((a) => ({
        id: a.id,
        name: a.name,
        menge: a.menge,
        notiz: a.notiz,
        iconOverride: a.iconOverride,
        erledigt: a.erledigt,
        kategorieId: a.kategorieId,
        kategorieName: a.kategorie?.name ?? "Sonstiges",
      }))}
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
    />
  );
}
