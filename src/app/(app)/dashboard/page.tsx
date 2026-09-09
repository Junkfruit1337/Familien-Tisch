import { getDashboardDaten } from "./actions";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const daten = await getDashboardDaten();
  const person = await getCurrentPerson();
  const kinder = person?.rolle === "ELTERN" ? await prisma.person.findMany({ where: { rolle: "KIND" } }) : [];

  return <DashboardClient daten={daten} istEltern={person?.rolle === "ELTERN"} kinder={kinder.map((k) => ({ id: k.id, name: k.name }))} />;
}
