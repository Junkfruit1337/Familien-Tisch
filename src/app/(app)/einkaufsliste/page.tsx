import { getCurrentPerson } from "@/lib/auth";
import { listArtikel, listWuensche, listKategorien, listVorschlaege } from "./actions";
import { getWochenplan, listRezepteDetail } from "../essensplan/actions";
import EinkaufslisteClient from "./EinkaufslisteClient";

export default async function EinkaufslistePage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const [artikel, wuensche, kategorien, vorschlaege, plan, rezepteAlle] = await Promise.all([
    listArtikel(),
    listWuensche(),
    listKategorien(),
    istEltern ? listVorschlaege() : Promise.resolve([]),
    istEltern ? getWochenplan(0) : Promise.resolve(null),
    istEltern ? listRezepteDetail() : Promise.resolve([]),
  ]);

  return (
    <EinkaufslisteClient
      istEltern={istEltern}
      artikel={artikel.map((a) => ({
        id: a.id,
        name: a.name,
        menge: a.menge,
        erledigt: a.erledigt,
        kategorieId: a.kategorieId,
        kategorieName: a.kategorie?.name ?? "Sonstiges",
      }))}
      wuensche={wuensche.map((w) => ({
        id: w.id,
        artikelName: w.artikelName,
        menge: w.menge,
        status: w.status,
        kindName: w.kind.name,
        entschiedenAm: w.entschiedenAm?.toISOString() ?? null,
      }))}
      kategorien={kategorien.map((k) => ({ id: k.id, name: k.name }))}
      vorschlaege={vorschlaege}
      wochenTage={
        plan
          ? plan.tage
              .filter((t) => t.eintrag)
              .map((t) => ({ eintragId: t.eintrag!.id, tag: t.tag, rezeptName: t.eintrag!.rezeptName }))
          : []
      }
      rezepte={rezepteAlle.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
