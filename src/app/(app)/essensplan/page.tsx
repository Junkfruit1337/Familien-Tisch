import { getCurrentPerson } from "@/lib/auth";
import { listRezepte, getWochenplan } from "./actions";
import EssensplanClient from "./EssensplanClient";

export default async function EssensplanPage() {
  const person = await getCurrentPerson();
  const rezepte = await listRezepte();
  const plan = await getWochenplan(0);

  return (
    <EssensplanClient
      istEltern={person?.rolle === "ELTERN"}
      rezepte={rezepte.map((r) => ({ id: r.id, name: r.name, zutaten: r.zutaten }))}
      plan={plan}
    />
  );
}
