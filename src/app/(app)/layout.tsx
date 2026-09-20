import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import AppShell from "./AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await getCurrentPerson();
  if (!person) redirect("/login");
  // Fix-Batch 131 (Florians Wunsch, nach dem Account-Vorfall): solange noch die Standard-PIN
  // "0000" aktiv ist, muss sie zuerst geändert werden — auf jeder Seite der App, nicht nur
  // beim Login, damit es sich nicht einfach wegklicken/umgehen lässt.
  if (person.pinAendernErforderlich) redirect("/pin-aendern");

  return (
    <AppShell person={{ id: person.id, name: person.name, farbe: person.farbe, rolle: person.rolle }}>
      {children}
    </AppShell>
  );
}
