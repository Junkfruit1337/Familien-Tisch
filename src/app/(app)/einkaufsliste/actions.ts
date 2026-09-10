"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneKategorie } from "@/lib/kategorisierung";
import { revalidatePath } from "next/cache";

// Ermittelt automatisch eine Kategorie-ID anhand des Artikelnamens (Stichwort-Erkennung).
// Wird nur genutzt, wenn keine Kategorie manuell ausgewählt wurde.
export async function autoKategorieId(name: string): Promise<string | null> {
  const erkannt = erkenneKategorie(name);
  if (!erkannt) return null;
  const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: erkannt } });
  return kategorie?.id ?? null;
}

// Findet einen bereits offenen (nicht erledigten) Artikel mit gleichem Namen,
// damit gleiche Artikel nicht als doppelte Zeilen auf der Liste landen.
export async function findeOffenenArtikel(name: string) {
  return prisma.einkaufsArtikel.findFirst({
    where: { erledigt: false, name: { equals: name.trim(), mode: "insensitive" } },
  });
}

// Führt zwei Mengenangaben zusammen. Da "Menge" freier Text ist (z. B. "3 kg", "1 Packung"),
// wird nicht gerechnet, sondern lesbar zusammengehängt statt eine zweite Zeile anzulegen.
export function mergeMenge(bestehend: string | null, neu?: string | null): string | null {
  if (!neu) return bestehend;
  if (!bestehend) return neu;
  if (bestehend === neu || bestehend.includes(neu)) return bestehend;
  return `${bestehend} + ${neu}`;
}

export async function listArtikel() {
  return prisma.einkaufsArtikel.findMany({
    include: { kategorie: true },
    orderBy: [{ erledigt: "asc" }, { kategorie: { reihenfolge: "asc" } }],
  });
}

// Eltern sehen alle Wünsche, ein Kind sieht ausschließlich seine eigenen —
// serverseitig gefiltert, damit nicht jeder eingeloggte Nutzer den kompletten
// Datensatz (Namen, Artikel, Status aller Kinder) im Server-Payload erhält.
export async function listWuensche() {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? {} : { kindId: person.id };
  return prisma.einkaufsWunsch.findMany({ where, include: { kind: true }, orderBy: { createdAt: "desc" } });
}

export async function listKategorien() {
  return prisma.einkaufsKategorie.findMany({ orderBy: { reihenfolge: "asc" } });
}

// Eltern: Artikel direkt hinzufügen
export async function addArtikel(data: { name: string; menge?: string; kategorieId?: string }) {
  await requireParent();

  const bestehender = await findeOffenenArtikel(data.name);
  if (bestehender) {
    const artikel = await prisma.einkaufsArtikel.update({
      where: { id: bestehender.id },
      data: { menge: mergeMenge(bestehender.menge, data.menge) },
    });
    revalidatePath("/einkaufsliste");
    return artikel;
  }

  const kategorieId = data.kategorieId || (await autoKategorieId(data.name));
  const artikel = await prisma.einkaufsArtikel.create({
    data: { name: data.name, menge: data.menge, kategorieId: kategorieId || null },
  });
  revalidatePath("/einkaufsliste");
  return artikel;
}

// Eltern: Namen/Menge eines bestehenden Artikels nachträglich korrigieren.
export async function updateArtikel(id: string, data: { name?: string; menge?: string }) {
  await requireParent();
  await prisma.einkaufsArtikel.update({
    where: { id },
    data: { name: data.name, menge: data.menge },
  });
  revalidatePath("/einkaufsliste");
}

// Eltern: Artikel manuell in eine andere Kategorie verschieben (übersteuert die Auto-Erkennung dauerhaft).
export async function verschiebeArtikelKategorie(id: string, kategorieId: string) {
  await requireParent();
  await prisma.einkaufsArtikel.update({
    where: { id },
    data: { kategorieId: kategorieId || null },
  });
  revalidatePath("/einkaufsliste");
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
    const bestehender = await findeOffenenArtikel(wunsch.artikelName);
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: {
          menge: mergeMenge(bestehender.menge, wunsch.menge),
          vonWunschId: wunsch.id,
          kategorieId: bestehender.kategorieId || kategorieId || (await autoKategorieId(wunsch.artikelName)),
        },
      });
    } else {
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
