import { getCurrentPerson } from "@/lib/auth";
import { listArtikel, listWuensche, listKategorien } from "./actions";
import EinkaufslisteClient from "./EinkaufslisteClient";

export default async function EinkaufslistePage() {
  const person = await getCurrentPerson();
  const [artikel, wuensche, kategorien] = await Promise.all([listArtikel(), listWuensche(), listKategorien()]);

  return (
    <EinkaufslisteClient
      istEltern={person?.rolle === "ELTERN"}
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
      }))}
      kategorien={kategorien.map((k) => ({ id: k.id, name: k.name }))}
    />
  );
}
