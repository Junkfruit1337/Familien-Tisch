"use server";

import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { autoKategorieId, findeOffenenArtikel, findeOffenenUnbestaetigtenArtikel, mergeMenge } from "../einkaufsliste/actions";
import { erkenneRezeptAusBild, type ErkanntesRezept } from "@/lib/rezeptErkennung";

function getSamstagWocheStart(date: Date): Date {
  // Essensplan-Woche läuft Samstag–Samstag.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=So,6=Sa
  const diff = (day - 6 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

// Fix-Batch 28: erkennt jetzt auch Zeilen ohne eigenes Einheiten-Wort (z.B. "1 Knoblauchzehe(n)"
// statt "500 g Spaghetti") — vorher fiel so eine Zeile komplett durch die erste Regel (die
// verlangt Menge UND Einheit UND Name als drei Teile) und landete unsplittet als kompletter
// Name ohne separate Menge auf der Einkaufsliste.
function parseZutatZeile(zeile: string): { name: string; menge?: string } {
  const mitEinheit = zeile.match(/^([\d.,]+\s*\S+)\s+(.+)$/);
  if (mitEinheit) return { menge: mitEinheit[1], name: mitEinheit[2] };
  const nurZahl = zeile.match(/^([\d.,]+)\s+(.+)$/);
  if (nurZahl) return { menge: nurZahl[1], name: nurZahl[2] };
  return { name: zeile };
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

export async function addRezept(name: string, zutaten: string, zubereitung?: string, portionenBasis?: number) {
  await requireParent();
  await prisma.rezept.create({
    data: { name, zutaten, zubereitung: zubereitung || undefined, portionenBasis: portionenBasis && portionenBasis > 0 ? portionenBasis : 6 },
  });
  revalidatePath("/essensplan");
}

// Korrigiert nachträglich, für wie viele Portionen ein bereits gespeichertes Rezept
// geschrieben ist (Fix-Batch 22) — z.B. wenn beim Anlegen der Wert falsch geschätzt wurde.
export async function updateRezeptPortionenBasis(rezeptId: string, portionenBasis: number) {
  await requireParent();
  if (!portionenBasis || portionenBasis < 1) return;
  await prisma.rezept.update({ where: { id: rezeptId }, data: { portionenBasis } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Rezept-Erfassung per Foto (Fragenkatalog Frage 25, Batch 8) — füllt nur das
// "Neues Rezept"-Formular vor, gespeichert wird erst nach Prüfung/Korrektur durch die Eltern.
// Fehler werden hier abgefangen und als Ergebnis-Objekt zurückgegeben statt geworfen,
// weil Next.js Fehlermeldungen aus Server Actions im Produktions-Build sonst durch eine
// generische Meldung ersetzt ("...error occurred in the Server Components render...").
export async function erkenneRezeptAusFoto(
  fotoDataUrl: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await erkenneRezeptAusBild(fotoDataUrl);
    return { ok: true, rezept };
  } catch (err) {
    console.error("Rezept-Foto-Erkennung fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Bilderkennung.";
    return { ok: false, fehler };
  }
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

// Sperrt einen Tag manuell — folgenlos, da noch keine Zutaten übernommen wurden
// (sonst wäre der Tag durch fuegeZutatenDesTagsHinzu ohnehin schon gesperrt).
export async function sperren(eintragId: string) {
  await requireParent();
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { gelockt: true } });
  revalidatePath("/essensplan");
}

export async function setEsser(eintragId: string, personIds: string[]) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return;
  const alle = await prisma.person.findMany({ where: { id: { in: personIds } } });
  // Skaliert nicht mehr fest auf 6, sondern auf die Portionsgrundlage des jeweiligen Rezepts
  // (Fix-Batch 22) — ein Rezept "für 1 Portion" ergibt bei allen 6 Essern jetzt Faktor 6, statt
  // fälschlich Faktor 1 wie zuvor. Personen-Gewichtung kommt jetzt aus der Datenbank
  // (Fix-Batch 23, in den Einstellungen editierbar) statt aus einer festen Code-Tabelle.
  const faktor = personIds.length === 0 ? 1 : alle.reduce((s, p) => s + p.portionsGewicht, 0) / eintrag.rezept.portionenBasis;
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { esserIds: personIds, esserFaktor: faktor } });
  revalidatePath("/essensplan");
}

// Zutaten eines Tages auf die Einkaufsliste übertragen (Fix-Batch 24) — landen als
// "noch nicht zugesagt" (bestaetigt=false) und müssen dort erst geprüft/angepasst/bestätigt
// werden. Die Skalierung kommt allein aus Esser-Auswahl × Rezept-Portionsbasis (Fix-Batch
// 22/23) — KEIN zusätzlicher manueller Hebel hier (Florian: das war ein Missverständnis,
// der Hebel gehört nur zur unabhängigen Extra-Rezept-Funktion, siehe pruefeZutatenFuerRezept
// unten). Sperrt den Tag automatisch, da jetzt Mengen auf der Einkaufsliste davon abhängen.
export async function fuegeZutatenDesTagsHinzu(eintragId: string) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return;
  const zeilen = eintrag.rezept.zutaten
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => skaliereZeile(parseZutatZeile(z), eintrag.esserFaktor || 1));

  for (const zeile of zeilen) {
    const bestehender = await findeOffenenUnbestaetigtenArtikel(zeile.name);
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
        data: { name: zeile.name, menge: zeile.menge, kategorieId: kategorieId || null, quelle: "essensplan", bestaetigt: false },
      });
      artikelId = neu.id;
    }
    await prisma.essensplanHerkunft.upsert({
      where: { artikelId_eintragId: { artikelId, eintragId } },
      update: { menge: zeile.menge },
      create: { artikelId, eintragId, menge: zeile.menge },
    });
  }

  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { gelockt: true } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Bequemlichkeits-Variante für die ganze Woche auf einmal ("oder eben die ganze Woche",
// Florians Feedback) — ruft dieselbe Logik für jeden noch nicht gesperrten Tag mit
// geplantem Gericht auf (bereits gesperrte Tage wurden schon hinzugefügt, sonst würden
// ihre Zutaten doppelt gezählt).
export async function fuegeZutatenDerWocheHinzu(wocheStartIso: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  const eintraege = await prisma.essensplanEintrag.findMany({ where: { wocheStart, gelockt: false } });
  for (const e of eintraege) {
    await fuegeZutatenDesTagsHinzu(e.id);
  }
}

// Ad-hoc-Ergänzung unabhängig vom Essensplan-Tag (Fix-Batch 22) — z.B. ein bereits
// bekanntes Rezept (Dip, Salat) zusätzlich zu einem geplanten Tag dazu einkaufen, etwa
// weil an dem Tag gegrillt wird. faktor bezieht sich direkt auf die im Rezept geschriebene
// Menge (1 = wie geschrieben, 2 = doppelte Menge), unabhängig von der Esser-Auswahl.
export async function pruefeZutatenFuerRezept(rezeptId: string, faktor = 1) {
  await requireParent();
  const rezept = await prisma.rezept.findUnique({ where: { id: rezeptId } });
  if (!rezept) return [];
  const zeilen = rezept.zutaten.split("\n").map((z) => z.trim()).filter(Boolean);
  return zeilen.map((z) => skaliereZeile(parseZutatZeile(z), faktor || 1));
}

// Übernimmt die geprüften Zeilen einer Ad-hoc-Rezept-Ergänzung auf die Einkaufsliste,
// mit Herkunfts-Vermerk (analog "Manuell hinzugefügt"/"Wunsch von X", Fix-Batch 22).
export async function uebernehmeZusaetzlicheZutaten(rezeptId: string, zeilen: { name: string; menge?: string }[], faktorLabel: string) {
  await requireParent();
  const rezept = await prisma.rezept.findUnique({ where: { id: rezeptId } });
  if (!rezept) return;
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
    await prisma.artikelQuelle.create({
      data: { artikelId, beschreibung: `Extra: ${rezept.name} (${faktorLabel})`, menge: zeile.menge },
    });
  }
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Prüft vor einer Änderung/Entsperrung eines gesperrten Tages, ob dafür schon Zutaten auf
// die Einkaufsliste übertragen wurden — nur dann muss überhaupt gefragt werden.
export async function pruefeGelocktenTagWechsel(eintragId: string) {
  await requireParent();
  const herkuenfte = await prisma.essensplanHerkunft.findMany({ where: { eintragId }, include: { artikel: true } });
  return herkuenfte.map((h) => ({ artikelId: h.artikelId, artikelName: h.artikel.name, menge: h.menge }));
}

// Wendet die Entfernen/Behalten-Entscheidungen für einen Tag an — geteilt zwischen
// "Gericht trotz Sperre ändern" und "Tag entsperren" (Fix-Batch 24), da beide dieselbe
// Frage stellen: "was passiert mit den schon übernommenen Zutaten dieses Tages?".
// "entfernen" rechnet den Mengen-Anteil dieses Tages aus dem Artikel heraus (bzw. löscht
// ihn ganz, wenn dieser Tag der einzige Beitrag war); "behalten" löst nur die
// Herkunfts-Verknüpfung, der Artikel/die Menge bleibt unangetastet stehen.
async function wendeEntscheidungenAn(eintragId: string, entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]) {
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
}

// Ändert das Gericht eines gesperrten Tages trotzdem — bleibt danach weiterhin gesperrt,
// da für das neue Gericht wieder "Zutaten hinzufügen" gebraucht wird.
export async function setTagTrotzSperre(
  eintragId: string,
  neuesRezeptId: string,
  entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]
) {
  await requireParent();
  await wendeEntscheidungenAn(eintragId, entscheidungen);
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { rezeptId: neuesRezeptId } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Entsperrt einen Tag — wie beim Gericht-Ändern muss erst geklärt werden, was mit den
// schon übernommenen Zutaten passiert (Fix-Batch 24, Florians Wunsch: Warnung mit
// Entfernen/Behalten-Auswahl statt stillschweigendem Entsperren).
export async function entsperren(eintragId: string, entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]) {
  await requireParent();
  await wendeEntscheidungenAn(eintragId, entscheidungen);
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { gelockt: false } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}
