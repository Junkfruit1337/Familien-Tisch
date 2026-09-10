"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneKategorie } from "@/lib/kategorisierung";
import { revalidatePath } from "next/cache";

// Ermittelt automatisch eine Kategorie-ID anhand des Artikelnamens (Stichwort-Erkennung).
// Wird nur genutzt, wenn keine Kategorie manuell ausgewählt wurde.
async function autoKategorieId(name: string): Promise<string | null> {
  const erkannt = erkenneKategorie(name);
  if (!erkannt) return null;
  const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: erkannt } });
  return kategorie?.id ?? null;
}

export async function listArtikel() {
  return prisma.einkaufsArtikel.findMany({
    include: { kategorie: true },
    orderBy: [{ erledigt: "asc" }, { kategorie: { reihenfolge: "asc" } }],
  });
}

export async function listWuensche() {
  return prisma.einkaufsWunsch.findMany({ include: { kind: true }, orderBy: { createdAt: "desc" } });
}

export async function listKategorien() {
  return prisma.einkaufsKategorie.findMany({ orderBy: { reihenfolge: "asc" } });
}

// Eltern: Artikel direkt hinzufügen
export async function addArtikel(data: { name: string; menge?: string; kategorieId?: string }) {
  await requireParent();
  const kategorieId = data.kategorieId || (await autoKategorieId(data.name));
  const artikel = await prisma.einkaufsArtikel.create({
    data: { name: data.name, menge: data.menge, kategorieId: kategorieId || null },
  });
  revalidatePath("/einkaufsliste");
  return artikel;
}

export async function toggleArtikel(id: string) {
  await requireParent();
  const a = await prisma.einkaufsArtikel.findUnique({ where: { id } });
  if (!a) return;
  await prisma.einkaufsArtikel.update({ where: { id }, data: { erledigt: !a.erledigt } });
  revalidatePath("/einkaufsliste");
}

export async function deleteArtikel(id: string) {
  await requireParent();
  await prisma.einkaufsArtikel.delete({ where: { id } });
  revalidatePath("/einkaufsliste");
}

// Kind: Wunsch einreichen
export async function submitWunsch(data: { artikelName: string; menge?: string }) {
  const person = await requirePerson();
  const wunsch = await prisma.einkaufsWunsch.create({
    data: { artikelName: data.artikelName, menge: data.menge, kindId: person.id },
  });
  await logAenderung({ entityTyp: "EINKAUFS_WUNSCH", entityId: wunsch.id, aktion: "eingereicht", neuerWert: wunsch.artikelName, geaendertVonId: person.id });
  revalidatePath("/einkaufsliste");
}

export async function entscheideWunsch(id: string, genehmigt: boolean, kategorieId?: string) {
  const person = await requireParent();
  const wunsch = await prisma.einkaufsWunsch.update({
    where: { id },
    data: { status: genehmigt ? "GENEHMIGT" : "ABGELEHNT", entschiedenAm: new Date() },
  });
  if (genehmigt) {
    const finalKategorieId = kategorieId || (await autoKategorieId(wunsch.artikelName));
    await prisma.einkaufsArtikel.create({
      data: {
        name: wunsch.artikelName,
        menge: wunsch.menge,
        kategorieId: finalKategorieId || null,
        quelle: "wunsch",
        vonWunschId: wunsch.id,
      },
    });
  }
  await logAenderung({
    entityTyp: "EINKAUFS_WUNSCH",
    entityId: id,
    aktion: genehmigt ? "genehmigt" : "abgelehnt",
    geaendertVonId: person.id,
  });
  revalidatePath("/einkaufsliste");
}

export async function addKategorie(name: string) {
  await requireParent();
  const anzahl = await prisma.einkaufsKategorie.count();
  await prisma.einkaufsKategorie.create({ data: { name, reihenfolge: anzahl } });
  revalidatePath("/einkaufsliste");
}
