"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { revalidatePath } from "next/cache";

export async function listAufgaben() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? {}
      : { OR: [{ personId: person.id }, { personId: null }] };
  return prisma.aufgabe.findMany({
    where,
    include: { person: true },
    orderBy: [{ erledigt: "asc" }, { faelligkeit: "asc" }],
  });
}

export async function createAufgabe(data: { titel: string; faelligkeit?: string; personId: string | null }) {
  const person = await requirePerson();
  const personId = person.rolle === "ELTERN" ? data.personId : person.id;
  const aufgabe = await prisma.aufgabe.create({
    data: {
      titel: data.titel,
      faelligkeit: data.faelligkeit ? new Date(data.faelligkeit) : null,
      personId,
      erstelltVonId: person.id,
    },
  });
  await logAenderung({ entityTyp: "AUFGABE", entityId: aufgabe.id, aktion: "erstellt", neuerWert: aufgabe.titel, geaendertVonId: person.id });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}

export async function toggleAufgabe(id: string) {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return;
  if (person.rolle !== "ELTERN" && aufgabe.personId !== null && aufgabe.personId !== person.id) {
    throw new Error("Das ist nicht deine Aufgabe.");
  }
  const updated = await prisma.aufgabe.update({ where: { id }, data: { erledigt: !aufgabe.erledigt } });
  await logAenderung({
    entityTyp: "AUFGABE",
    entityId: id,
    aktion: updated.erledigt ? "erledigt" : "wieder offen",
    geaendertVonId: person.id,
  });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}

export async function deleteAufgabe(id: string) {
  const person = await requirePerson();
  const aufgabe = await prisma.aufgabe.findUnique({ where: { id } });
  if (!aufgabe) return;
  if (person.rolle !== "ELTERN" && aufgabe.personId !== person.id) {
    throw new Error("Das darfst du nicht löschen.");
  }
  await prisma.aufgabe.delete({ where: { id } });
  await logAenderung({ entityTyp: "AUFGABE", entityId: id, aktion: "geloescht", alterWert: aufgabe.titel, geaendertVonId: person.id });
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}
