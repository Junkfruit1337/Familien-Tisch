import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import PinAendernClient from "./PinAendernClient";

export default async function PinAendernPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/login");

  return (
    <PinAendernClient
      name={person.name}
      farbe={person.farbe}
      erforderlich={person.pinAendernErforderlich}
    />
  );
}
