"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { revalidatePath } from "next/cache";

function betragFuerNote(note: number): number {
  if (note === 1) return 10;
  if (note === 2) return 5;
  return 0;
}

export async function listKinder() {
  return prisma.person.findMany({ where: { rolle: "KIND" }, orderBy: { reihenfolge: "asc" } });
}

export async function listFaecher(kindId: string) {
  return prisma.fach.findMany({ where: { kindId }, orderBy: { name: "asc" } });
}

export async function addFach(kindId: string, name: string) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN" && person.id !== kindId) throw new Error("Nicht erlaubt.");
  await prisma.fach.create({ data: { kindId, name } });
  revalidatePath("/schule");
}

export async function listNoten(kindId?: string) {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? (kindId ? { kindId } : {}) : { kindId: person.id };
  return prisma.note.findMany({ where, include: { fach: true, kind: true }, orderBy: { datum: "desc" } });
}

export async function einreichenNote(data: { fachId: string; art: string; note: number; datum: string; notiz?: string }) {
  const person = await requirePerson();
  const istEltern = person.rolle === "ELTERN";
  const fach = await prisma.fach.findUnique({ where: { id: data.fachId } });
  if (!fach) throw new Error("Fach nicht gefunden.");
  const kindId = istEltern ? fach.kindId : person.id;
  if (!istEltern && fach.kindId !== person.id) throw new Error("Das ist nicht dein Fach.");

  const status = istEltern ? "GENEHMIGT" : "OFFEN";
  const note = await prisma.note.create({
    data: {
      kindId,
      fachId: data.fachId,
      art: data.art as any,
      note: data.note,
      datum: new Date(data.datum),
      notiz: data.notiz,
      status: status as any,
      eingetragenVonId: person.id,
    },
  });

  await logAenderung({ entityTyp: "NOTE", entityId: note.id, aktion: "eingereicht", neuerWert: String(note.note), geaendertVonId: person.id });

  if (istEltern) {
    const betrag = betragFuerNote(note.note);
    if (betrag > 0) {
      await prisma.taschengeldTransaktion.create({
        data: { kindId, betrag, typ: "GUTSCHRIFT", grund: `Note ${note.note}`, noteId: note.id, erstelltVonId: person.id },
      });
      await logAenderung({ entityTyp: "TASCHENGELD", entityId: note.id, aktion: "gutschrift", neuerWert: `${betrag} €`, geaendertVonId: person.id });
    }
  }

  revalidatePath("/schule");
}

export async function entscheideNote(id: string, genehmigt: boolean) {
  const person = await requireParent();
  const note = await prisma.note.update({
    where: { id },
    data: { status: genehmigt ? "GENEHMIGT" : "ABGELEHNT" },
  });

  await logAenderung({
    entityTyp: "NOTE",
    entityId: id,
    aktion: genehmigt ? "genehmigt" : "abgelehnt",
    geaendertVonId: person.id,
  });

  if (genehmigt) {
    const betrag = betragFuerNote(note.note);
    if (betrag > 0) {
      await prisma.taschengeldTransaktion.create({
        data: { kindId: note.kindId, betrag, typ: "GUTSCHRIFT", grund: `Note ${note.note}`, noteId: note.id, erstelltVonId: person.id },
      });
    }
  }
  revalidatePath("/schule");
}

export async function loescheNote(id: string) {
  const person = await requireParent();
  await prisma.taschengeldTransaktion.deleteMany({ where: { noteId: id } });
  await prisma.note.delete({ where: { id } });
  await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "geloescht", geaendertVonId: person.id });
  revalidatePath("/schule");
}

export async function kontostand(kindId: string) {
  const transaktionen = await prisma.taschengeldTransaktion.findMany({ where: { kindId } });
  return transaktionen.reduce((sum, t) => sum + (t.typ === "GUTSCHRIFT" ? t.betrag : -t.betrag), 0);
}

export async function listTaschengeld(kindId: string) {
  return prisma.taschengeldTransaktion.findMany({ where: { kindId }, orderBy: { createdAt: "desc" } });
}

export async function auszahlen(kindId: string, betrag: number, grund?: string) {
  const person = await requireParent();
  const stand = await kontostand(kindId);
  if (betrag > stand) {
    throw new Error(`Auszahlung (${betrag} €) übersteigt den Kontostand (${stand} €).`);
  }
  const t = await prisma.taschengeldTransaktion.create({
    data: { kindId, betrag, typ: "AUSZAHLUNG", grund, erstelltVonId: person.id },
  });
  await logAenderung({ entityTyp: "TASCHENGELD", entityId: t.id, aktion: "auszahlung", neuerWert: `${betrag} €`, geaendertVonId: person.id });
  revalidatePath("/schule");
}

export async function setSparziel(kindId: string, bezeichnung: string, zielbetrag: number) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN" && person.id !== kindId) throw new Error("Nicht erlaubt.");
  await prisma.sparziel.upsert({
    where: { kindId },
    update: { bezeichnung, zielbetrag },
    create: { kindId, bezeichnung, zielbetrag },
  });
  revalidatePath("/schule");
}

export async function getSparziel(kindId: string) {
  return prisma.sparziel.findUnique({ where: { kindId } });
}

export async function listAnstehendeSchulEintraege() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN" ? { datum: { gte: new Date() } } : { personId: person.id, datum: { gte: new Date() } };
  return prisma.schulEintrag.findMany({ where, include: { person: true }, orderBy: { datum: "asc" }, take: 5 });
}

export async function createSchulEintrag(data: { titel: string; fachName?: string; art: string; datum: string; personId?: string }) {
  const person = await requirePerson();
  const personId = person.rolle === "ELTERN" ? data.personId || person.id : person.id;
  await prisma.schulEintrag.create({
    data: { titel: data.titel, fachName: data.fachName, art: data.art as any, datum: new Date(data.datum), personId },
  });
  revalidatePath("/schule");
  revalidatePath("/dashboard");
}
