import { getCurrentPerson } from "@/lib/auth";
import { getWoche, listAktiveTausche } from "./actions";
import { prisma } from "@/lib/prisma";
import DienstplanClient from "./DienstplanClient";

export default async function DienstplanPage() {
  const person = await getCurrentPerson();
  const { wocheStart, woche } = await getWoche();
  const tausche = await listAktiveTausche(wocheStart);
  const kinder = await prisma.person.findMany({ where: { rolle: "KIND" }, orderBy: { reihenfolge: "asc" } });

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
        dienste: w.dienste.map((d) => ({ bezeichnung: d.bezeichnung, beschreibung: d.beschreibung })),
      }))}
      tausche={tausche.map((t) => ({
        id: t.id,
        vonName: t.vonKind.name,
        mitName: t.mitKind.name,
        tag: t.tag?.toISOString() ?? null,
      }))}
      kinder={kinder.map((k) => ({ id: k.id, name: k.name }))}
    />
  );
}
