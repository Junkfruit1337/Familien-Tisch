"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { revalidatePath } from "next/cache";

export async function listTermine() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? {}
      : { OR: [{ personId: person.id }, { personId: null }] };
  return prisma.termin.findMany({
    where,
    include: { person: true },
    orderBy: { start: "asc" },
  });
}

export async function listPersonenFuerFilter() {
  return prisma.person.findMany({ where: { aktiv: true }, orderBy: { reihenfolge: "asc" } });
}

// Aufgaben mit Fälligkeitsdatum sollen automatisch im Kalender erscheinen.
export async function listAufgabenMitFaelligkeit() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN"
      ? { faelligkeit: { not: null } }
      : { faelligkeit: { not: null }, OR: [{ personId: person.id }, { personId: null }] };
  return prisma.aufgabe.findMany({
    where,
    include: { person: true },
    orderBy: { faelligkeit: "asc" },
  });
}

export async function createTermin(data: {
  titel: string;
  start: string;
  ende?: string;
  ganztaegig: boolean;
  kategorie: string;
  personId: string | null;
}) {
  const person = await requirePerson();
  const personId = person.rolle === "ELTERN" ? data.personId : person.id;

  const termin = await prisma.termin.create({
    data: {
      titel: data.titel,
      start: new Date(data.start),
      ende: data.ende ? new Date(data.ende) : null,
      ganztaegig: data.ganztaegig,
      kategorie: data.kategorie as any,
      personId,
      erstelltVonId: person.id,
    },
  });

  await logAenderung({
    entityTyp: "TERMIN",
    entityId: termin.id,
    aktion: "erstellt",
    neuerWert: termin.titel,
    geaendertVonId: person.id,
  });

  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  return termin;
}

export async function deleteTermin(id: string) {
  const person = await requirePerson();
  const termin = await prisma.termin.findUnique({ where: { id } });
  if (!termin) return;
  if (person.rolle !== "ELTERN" && termin.personId !== person.id) {
    throw new Error("Das darfst du nicht löschen.");
  }
  await prisma.termin.delete({ where: { id } });
  await logAenderung({
    entityTyp: "TERMIN",
    entityId: id,
    aktion: "geloescht",
    alterWert: termin.titel,
    geaendertVonId: person.id,
  });
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
}
