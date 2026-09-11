import { getDashboardDaten, getAenderungshistorie } from "./actions";
import { getCurrentPerson } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const daten = await getDashboardDaten();
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";
  const historie = istEltern ? await getAenderungshistorie() : [];

  return <DashboardClient daten={daten} istEltern={istEltern} historie={historie} />;
}
