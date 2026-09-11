"use server";

import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { autoKategorieId, findeOffenenArtikel, mergeMenge } from "../einkaufsliste/actions";

function getSamstagWocheStart(date: Date): Date {
  // Essensplan-Woche läuft Samstag–Samstag.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=So,6=Sa
  const diff = (day - 6 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export async function listRezepte() {
  return prisma.rezept.findMany({ orderBy: { name: "asc" } });
}

export async function addRezept(name: string, zutaten: string) {
  await requireParent();
  await prisma.rezept.create({ data: { name, zutaten } });
  revalidatePath("/essensplan");
}

export async function getWochenplan(offsetWochen = 0) {
  const basis = getSamstagWocheStart(new Date());
  const wocheStart = new Date(basis);
  wocheStart.setUTCDate(wocheStart.getUTCDate() + offsetWochen * 7);

  const eintraege = await prisma.essensplanEintrag.findMany({
    where: { wocheStart },
    include: { rezept: true },
  });

  const tage = Array.from({ length: 7 }, (_, i) => {
    const tag = new Date(wocheStart);
    tag.setUTCDate(tag.getUTCDate() + i);
    const eintrag = eintraege.find((e) => e.tag.toDateString() === tag.toDateString());
    return { tag: tag.toISOString(), eintrag: eintrag ? { id: eintrag.id, rezeptName: eintrag.rezept.name, rezeptId: eintrag.rezeptId, gelockt: eintrag.gelockt } : null };
  });

  return { wocheStart: wocheStart.toISOString(), tage };
}

export async function setTag(wocheStartIso: string, tagIso: string, rezeptId: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  const tag = new Date(tagIso);
  const bestehend = await prisma.essensplanEintrag.findFirst({ where: { wocheStart, tag } });
  if (bestehend) {
    if (bestehend.gelockt) throw new Error("Diese Woche ist gesperrt. Erst entsperren.");
    await prisma.essensplanEintrag.update({ where: { id: bestehend.id }, data: { rezeptId } });
  } else {
    await prisma.essensplanEintrag.create({ data: { wocheStart, tag, rezeptId } });
  }
  revalidatePath("/essensplan");
}

export async function toggleLock(id: string) {
  await requireParent();
  const e = await prisma.essensplanEintrag.findUnique({ where: { id } });
  if (!e) return;
  await prisma.essensplanEintrag.update({ where: { id }, data: { gelockt: !e.gelockt } });
  revalidatePath("/essensplan");
}

export async function zutatenUebernehmen(eintragId: string) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return;
  // Nutzt dieselbe Auto-Kategorisierung + Dedup/Merge-Logik wie die manuelle Eingabe
  // in der Einkaufsliste, damit Zutaten aus dem Essensplan nicht mehr garantiert in
  // "Sonstiges" und garantiert als doppelte Zeile landen (Gap-Analyse 10.09.2026, Bug B1).
  const zeilen = eintrag.rezept.zutaten.split("\n").map((z) => z.trim()).filter(Boolean);
  for (const zeile of zeilen) {
    const match = zeile.match(/^([\d.,]+\s*\S+)\s+(.+)$/);
    const menge = match ? match[1] : undefined;
    const name = match ? match[2] : zeile;

    const bestehender = await findeOffenenArtikel(name);
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: { menge: await mergeMenge(bestehender.menge, menge) },
      });
    } else {
      const kategorieId = await autoKategorieId(name);
      await prisma.einkaufsArtikel.create({
        data: { name, menge, kategorieId: kategorieId || null, quelle: "essensplan" },
      });
    }
  }
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}
