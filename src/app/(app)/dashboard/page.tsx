import { getDashboardDaten, getAenderungshistorie } from "./actions";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const daten = await getDashboardDaten();
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const kinder = istEltern ? await prisma.person.findMany({ where: { rolle: "KIND" } }) : [];
  const historie = istEltern ? await getAenderungshistorie() : [];

  return (
    <DashboardClient
      daten={daten}
      istEltern={istEltern}
      kinder={kinder.map((k) => ({ id: k.id, name: k.name }))}
      historie={historie}
    />
  );
}
