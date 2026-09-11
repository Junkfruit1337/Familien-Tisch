"use server";

import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { autoKategorieId, findeOffenenArtikel, mergeMenge } from "../einkaufsliste/actions";
import { erkenneRezeptAusBild } from "@/lib/rezeptErkennung";

function getSamstagWocheStart(date: Date): Date {
  // Essensplan-Woche läuft Samstag–Samstag.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=So,6=Sa
  const diff = (day - 6 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

// Feste Personen-Gewichtung für den Portionsrechner (Fragenkatalog Frage 26,
// von Florian bestätigt) — Standard-Summe bei allen 6 anwesend ist 6.
const PERSON_GEWICHT: Record<string, number> = { Flo: 1.5, Ayla: 0.5 };
function personGewicht(name: string): number {
  return PERSON_GEWICHT[name] ?? 1;
}

function parseZutatZeile(zeile: string): { name: string; menge?: string } {
  const match = zeile.match(/^([\d.,]+\s*\S+)\s+(.+)$/);
  return match ? { menge: match[1], name: match[2] } : { name: zeile };
}

// Skaliert eine Zutatenzeile mit dem Esser-Faktor des Tages (z. B. 3 von 6 Essern → Faktor 0,5).
function skaliereZeile(zeile: { name: string; menge?: string }, faktor: number): { name: string; menge?: string } {
  if (!zeile.menge || faktor === 1) return zeile;
  const m = zeile.menge.match(/^([\d]+(?:[.,]\d+)?)(.*)$/);
  if (!m) return zeile;
  const zahl = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(zahl)) return zeile;
  const skaliert = Math.round(zahl * faktor * 100) / 100;
  const zahlText = Number.isInteger(skaliert) ? String(skaliert) : skaliert.toFixed(2).replace(/0$/, "").replace(".", ",");
  return { ...zeile, menge: `${zahlText}${m[2]}` };
}

export async function listRezepte() {
  return prisma.rezept.findMany({ orderBy: { name: "asc" } });
}

// Rezeptdatenbank: vollständige Übersicht mit Detailfeldern, unabhängig vom
// Essensplan-Auswahlformular (Fahrplan §3, Batch 5).
export async function listRezepteDetail() {
  return prisma.rezept.findMany({ orderBy: { name: "asc" } });
}

export async function addRezept(name: string, zutaten: string, zubereitung?: string) {
  await requireParent();
  await prisma.rezept.create({ data: { name, zutaten, zubereitung: zubereitung || undefined } });
  revalidatePath("/essensplan");
}

// Rezept-Erfassung per Foto (Fragenkatalog Frage 25, Batch 8) — füllt nur das
// "Neues Rezept"-Formular vor, gespeichert wird erst nach Prüfung/Korrektur durch die Eltern.
export async function erkenneRezeptAusFoto(fotoDataUrl: string) {
  await requireParent();
  return erkenneRezeptAusBild(fotoDataUrl);
}

export async function deleteRezept(id: string) {
  await requireParent();
  try {
    await prisma.rezept.delete({ where: { id } });
  } catch {
    throw new Error("Rezept kann nicht gelöscht werden, solange es noch im Essensplan eingeplant ist.");
  }
  revalidatePath("/essensplan");
}

// Vorschlagsliste für ein Tages-Auswahlformular: sortiert nach „zuletzt gekocht"
// (nie/am längsten her zuerst, Fragenkatalog Bereich G) und ohne die für diese
// Woche ausgeblendeten Rezepte (Fahrplan §3, Batch 5).
export async function listRezepteFuerWoche(wocheStartIso: string) {
  const wocheStart = new Date(wocheStartIso);
  const [rezepte, ausblendungen] = await Promise.all([
    prisma.rezept.findMany({
      include: { planEintraege: { where: { tag: { lt: new Date() } }, orderBy: { tag: "desc" }, take: 1 } },
    }),
    prisma.rezeptAusblendung.findMany({ where: { wocheStart } }),
  ]);
  const ausgeblendeteIds = new Set(ausblendungen.map((a) => a.rezeptId));
  return rezepte
    .filter((r) => !ausgeblendeteIds.has(r.id))
    .sort((a, b) => (a.planEintraege[0]?.tag.getTime() ?? 0) - (b.planEintraege[0]?.tag.getTime() ?? 0))
    .map((r) => ({ id: r.id, name: r.name }));
}

export async function listAusgeblendeteFuerWoche(wocheStartIso: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  const ausblendungen = await prisma.rezeptAusblendung.findMany({ where: { wocheStart }, include: { rezept: true } });
  return ausblendungen.map((a) => ({ rezeptId: a.rezeptId, name: a.rezept.name }));
}

export async function blendeRezeptAus(rezeptId: string, wocheStartIso: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  await prisma.rezeptAusblendung.upsert({
    where: { rezeptId_wocheStart: { rezeptId, wocheStart } },
    update: {},
    create: { rezeptId, wocheStart },
  });
  revalidatePath("/essensplan");
}

export async function zeigeRezeptWiederAn(rezeptId: string, wocheStartIso: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  await prisma.rezeptAusblendung.deleteMany({ where: { rezeptId, wocheStart } });
  revalidatePath("/essensplan");
}

export async function listAlleFamilienmitglieder() {
  return prisma.person.findMany({ where: { aktiv: true }, orderBy: { reihenfolge: "asc" } });
}

// 3-Wochen-Vorschau: diese/nächste/übernächste Woche (offsetWochen 0-2, Fahrplan §3).
export async function getWochenplan(offsetWochen = 0) {
  const basis = getSamstagWocheStart(new Date());
  const wocheStart = new Date(basis);
  wocheStart.setUTCDate(wocheStart.getUTCDate() + offsetWochen * 7);
  const wocheEnde = new Date(wocheStart);
  wocheEnde.setUTCDate(wocheEnde.getUTCDate() + 6);

  const eintraege = await prisma.essensplanEintrag.findMany({
    where: { wocheStart },
    include: { rezept: true },
  });

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  const tage = Array.from({ length: 7 }, (_, i) => {
    const tag = new Date(wocheStart);
    tag.setUTCDate(tag.getUTCDate() + i);
    const eintrag = eintraege.find((e) => e.tag.toDateString() === tag.toDateString());
    return {
      tag: tag.toISOString(),
      vergangen: tag < heute,
      eintrag: eintrag
        ? {
            id: eintrag.id,
            rezeptName: eintrag.rezept.name,
            rezeptId: eintrag.rezeptId,
            gelockt: eintrag.gelockt,
            esserIds: eintrag.esserIds,
            esserFaktor: eintrag.esserFaktor,
          }
        : null,
    };
  });

  return { wocheStart: wocheStart.toISOString(), wocheEnde: wocheEnde.toISOString(), tage };
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

export async function setEsser(eintragId: string, personIds: string[]) {
  await requireParent();
  const alle = await prisma.person.findMany({ where: { id: { in: personIds } } });
  const faktor = personIds.length === 0 ? 1 : alle.reduce((s, p) => s + personGewicht(p.name), 0) / 6;
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { esserIds: personIds, esserFaktor: faktor } });
  revalidatePath("/essensplan");
}

// Schritt 1 des Prüf-Schritts: zeigt die (mit dem Esser-Faktor skalierten) Zutatenzeilen
// zur Auswahl, bevor irgendetwas auf die Einkaufsliste kommt (Fahrplan §3, Kernfeature).
export async function pruefeZutaten(eintragId: string) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return [];
  const zeilen = eintrag.rezept.zutaten.split("\n").map((z) => z.trim()).filter(Boolean);
  return zeilen.map((z) => skaliereZeile(parseZutatZeile(z), eintrag.esserFaktor || 1));
}

// Schritt 2: übernimmt nur die vom Elternteil bestätigten Zeilen ("Brauche ich") und
// merkt sich die Herkunft je Artikel/Tag für den späteren Entfernen/Behalten-Dialog.
export async function uebernehmeAusgewaehlteZutaten(eintragId: string, zeilen: { name: string; menge?: string }[]) {
  await requireParent();
  for (const zeile of zeilen) {
    const bestehender = await findeOffenenArtikel(zeile.name);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: { menge: await mergeMenge(bestehender.menge, zeile.menge) },
      });
      artikelId = bestehender.id;
    } else {
      const kategorieId = await autoKategorieId(zeile.name);
      const neu = await prisma.einkaufsArtikel.create({
        data: { name: zeile.name, menge: zeile.menge, kategorieId: kategorieId || null, quelle: "essensplan" },
      });
      artikelId = neu.id;
    }
    await prisma.essensplanHerkunft.upsert({
      where: { artikelId_eintragId: { artikelId, eintragId } },
      update: { menge: zeile.menge },
      create: { artikelId, eintragId, menge: zeile.menge },
    });
  }
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Prüft vor einer Änderung eines gelockten Tages, ob dafür schon Zutaten auf die
// Einkaufsliste übernommen wurden — nur dann muss überhaupt gefragt werden.
export async function pruefeGelocktenTagWechsel(eintragId: string) {
  await requireParent();
  const herkuenfte = await prisma.essensplanHerkunft.findMany({ where: { eintragId }, include: { artikel: true } });
  return herkuenfte.map((h) => ({ artikelId: h.artikelId, artikelName: h.artikel.name, menge: h.menge }));
}

// Ändert das Gericht eines gelockten Tages trotzdem — je betroffenem Mengen-Anteil
// gezielt "Entfernen" (aus der Einkaufsliste herausrechnen) oder "Behalten"
// (Einkaufsliste bleibt wie sie ist, nur die Herkunfts-Verknüpfung wird gelöst).
export async function setTagTrotzSperre(
  eintragId: string,
  neuesRezeptId: string,
  entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]
) {
  await requireParent();
  for (const e of entscheidungen) {
    if (e.aktion === "entfernen") {
      const uebrige = await prisma.essensplanHerkunft.findMany({
        where: { artikelId: e.artikelId, eintragId: { not: eintragId } },
      });
      let neueMenge: string | null = null;
      for (const u of uebrige) {
        neueMenge = await mergeMenge(neueMenge, u.menge);
      }
      const artikel = await prisma.einkaufsArtikel.findUnique({ where: { id: e.artikelId } });
      if (artikel) {
        if (!neueMenge && artikel.quelle === "essensplan") {
          await prisma.einkaufsArtikel.delete({ where: { id: e.artikelId } }).catch(() => {});
        } else {
          await prisma.einkaufsArtikel.update({ where: { id: e.artikelId }, data: { menge: neueMenge } }).catch(() => {});
        }
      }
    }
    await prisma.essensplanHerkunft.deleteMany({ where: { artikelId: e.artikelId, eintragId } });
  }
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { rezeptId: neuesRezeptId } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}
