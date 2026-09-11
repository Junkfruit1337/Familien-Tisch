import { getCurrentPerson } from "@/lib/auth";
import { getWoche, listAktiveTausche, getBadplan, listTagesroutinen, listKoerperpflegeplan, listZusatzAufgaben } from "./actions";
import { prisma } from "@/lib/prisma";
import DienstplanClient from "./DienstplanClient";

export default async function DienstplanPage() {
  const person = await getCurrentPerson();
  const { wocheStart, woche } = await getWoche();
  const [tausche, badplan, kinder, tagesroutinen, koerperpflegeplan, zusatzAufgaben] = await Promise.all([
    listAktiveTausche(wocheStart),
    getBadplan(wocheStart),
    prisma.person.findMany({ where: { rolle: "KIND" }, orderBy: { reihenfolge: "asc" } }),
    listTagesroutinen(),
    listKoerperpflegeplan(),
    listZusatzAufgaben(),
  ]);

  return (
    <DienstplanClient
      istEltern={person?.rolle === "ELTERN"}
      wocheStart={wocheStart}
      woche={woche.map((w) => ({
        schichtNummer: w.schichtNummer,
        kindName: w.kind?.name ?? "—",
        kindFarbe: w.kind?.farbe ?? "#8a7a63",
        kindId: w.kind?.id ?? "",
        getauscht: w.getauscht,
        dienste: w.dienste.map((d) => ({ id: d.id, bezeichnung: d.bezeichnung, beschreibung: d.beschreibung })),
        tage: w.tage.map((t) => ({
          datum: t.datum,
          kindName: t.kind?.name ?? "—",
          kindFarbe: t.kind?.farbe ?? "#8a7a63",
          getauschtHeute: t.getauschtHeute,
        })),
      }))}
      tausche={tausche.map((t) => ({
        id: t.id,
        vonName: t.vonKind.name,
        mitName: t.mitKind.name,
        tag: t.tag?.toISOString() ?? null,
        modus: t.modus,
      }))}
      kinder={kinder.map((k) => ({ id: k.id, name: k.name }))}
      badplan={{
        morgens: badplan.morgens.map((b) => ({ position: b.position, kindName: b.kind?.name ?? "—", kindFarbe: b.kind?.farbe ?? "#8a7a63" })),
        abends: badplan.abends.map((b) => ({ position: b.position, kindName: b.kind?.name ?? "—", kindFarbe: b.kind?.farbe ?? "#8a7a63" })),
      }}
      tagesroutinen={tagesroutinen}
      koerperpflegeplan={koerperpflegeplan}
      zusatzAufgaben={zusatzAufgaben.map((z) => ({
        id: z.id,
        titel: z.titel,
        personName: z.person?.name ?? null,
        erledigt: z.erledigt,
      }))}
    />
  );
}
