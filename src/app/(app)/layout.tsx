import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import AppShell from "./AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await getCurrentPerson();
  if (!person) redirect("/login");

  return (
    <AppShell person={{ id: person.id, name: person.name, farbe: person.farbe, rolle: person.rolle }}>
      {children}
    </AppShell>
  );
}
