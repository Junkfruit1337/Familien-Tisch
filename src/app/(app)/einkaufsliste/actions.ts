"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneKategorie } from "@/lib/kategorisierung";
import { erkenneArtikelAusSprache, type ErkannterArtikel } from "@/lib/spracheErkennung";
import { revalidatePath } from "next/cache";

// Spracheingabe fürs Artikel-/Wunsch-Formular (Fix-Batch 30) — für Eltern (Artikel direkt
// hinzufügen) und Kinder (Wunsch einreichen) gleichermaßen nutzbar.
export async function erkenneArtikelAusText(text: string): Promise<{ ok: true; artikel: ErkannterArtikel } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const artikel = await erkenneArtikelAusSprache(text);
    return { ok: true, artikel };
  } catch (err) {
    console.error("Spracheingabe (Artikel) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// Ermittelt automatisch eine Kategorie-ID anhand des Artikelnamens (Stichwort-Erkennung).
// Wird nur genutzt, wenn keine Kategorie manuell ausgewählt wurde.
export async function autoKategorieId(name: string): Promise<string | null> {
  const erkannt = erkenneKategorie(name);
  if (!erkannt) return null;
  const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: erkannt } });
  return kategorie?.id ?? null;
}

// Findet einen bereits offenen (nicht erledigten), BESTÄTIGTEN Artikel mit gleichem Namen,
// damit gleiche Artikel nicht als doppelte Zeilen auf der Liste landen. Bewusst nur unter
// bereits bestätigten Artikeln gesucht (Fix-Batch 24) — ein manuell hinzugefügter Artikel
// darf nicht versehentlich in einen noch unbestätigten Essensplan-Posten hineingemischt
// werden und dadurch selbst als "noch nicht zugesagt" erscheinen.
export async function findeOffenenArtikel(name: string) {
  return prisma.einkaufsArtikel.findFirst({
    where: { erledigt: false, bestaetigt: true, name: { equals: name.trim(), mode: "insensitive" } },
  });
}

// Gegenstück für den "noch nicht zugesagt"-Pool aus dem Essensplan (Fix-Batch 24) — mehrere
// Tage, die dieselbe Zutat brauchen, sollen sich in EINEM unbestätigten Posten summieren,
// statt für jeden Tag eine eigene Zeile zu erzeugen.
export async function findeOffenenUnbestaetigtenArtikel(name: string) {
  return prisma.einkaufsArtikel.findFirst({
    where: { erledigt: false, bestaetigt: false, name: { equals: name.trim(), mode: "insensitive" } },
  });
}

// Echte Einheiten-Umrechnung für Gewicht (g/kg) und Volumen (ml/l) — Entscheidung
// 10.09.2026: nur diese beiden Familien, keine Stück-Sonderfälle. Alles andere
// (z. B. "1 Packung") wird weiterhin nur lesbar zusammengehängt.
const GEWICHT_EINHEITEN: Record<string, number> = { g: 1, gramm: 1, kg: 1000, kilo: 1000, kilogramm: 1000 };
const VOLUMEN_EINHEITEN: Record<string, number> = { ml: 1, l: 1000, liter: 1000 };

function parseMenge(text: string): { basiswert: number; family: "gewicht" | "volumen" } | null {
  const m = text.trim().match(/^([\d]+(?:[.,]\d+)?)\s*([a-zA-Zäöü]+)\.?$/);
  if (!m) return null;
  const zahl = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(zahl)) return null;
  const einheit = m[2].toLowerCase();
  if (einheit in GEWICHT_EINHEITEN) return { basiswert: zahl * GEWICHT_EINHEITEN[einheit], family: "gewicht" };
  if (einheit in VOLUMEN_EINHEITEN) return { basiswert: zahl * VOLUMEN_EINHEITEN[einheit], family: "volumen" };
  return null;
}

function formatZahl(n: number): string {
  return Number(n.toFixed(2)).toString().replace(".", ",");
}

function formatMenge(basiswert: number, family: "gewicht" | "volumen"): string {
  if (family === "gewicht") {
    return basiswert >= 1000 ? `${formatZahl(basiswert / 1000)} kg` : `${formatZahl(basiswert)} g`;
  }
  return basiswert >= 1000 ? `${formatZahl(basiswert / 1000)} l` : `${formatZahl(basiswert)} ml`;
}

// Führt zwei Mengenangaben zusammen. Bei erkennbar gleicher Einheiten-Familie
// (g/kg oder ml/l) wird echt umgerechnet und addiert; sonst bleibt es beim
// lesbaren Aneinanderhängen (z. B. bei "1 Packung").
// Muss "async" sein, obwohl intern nichts asynchrones passiert: Next.js verlangt,
// dass jeder Export aus einer "use server"-Datei eine async-Funktion ist — ein
// synchroner Export hier lässt "next build" fehlschlagen (Ursache des Deploy-Fehlers
// vom 10.09.2026, siehe Anforderungs-Log).
export async function mergeMenge(bestehend: string | null, neu?: string | null): Promise<string | null> {
  if (!neu) return bestehend;
  if (!bestehend) return neu;
  if (bestehend === neu || bestehend.includes(neu)) return bestehend;

  const a = parseMenge(bestehend);
  const b = parseMenge(neu);
  if (a && b && a.family === b.family) {
    return formatMenge(a.basiswert + b.basiswert, a.family);
  }
  return `${bestehend} + ${neu}`;
}

// Nur bestätigte Artikel — "noch nicht zugesagte" Essensplan-Posten laufen über den
// eigenen Bereich (listUnbestaetigteArtikel), bis sie geprüft/bestätigt wurden (Fix-Batch 24).
export async function listArtikel() {
  return prisma.einkaufsArtikel.findMany({
    where: { bestaetigt: true },
    include: { kategorie: true },
    orderBy: [{ erledigt: "asc" }, { kategorie: { reihenfolge: "asc" } }],
  });
}

// "Noch nicht zugesagt" (Fix-Batch 24): Zutaten, die aus dem Essensplan auf die Einkaufsliste
// übertragen wurden, aber noch geprüft/angepasst/bestätigt werden müssen. Zeigt zur
// Einordnung, aus welchem(n) Tag(en)/Gericht(en) die Menge stammt.
export async function listUnbestaetigteArtikel() {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.findMany({
    where: { bestaetigt: false, erledigt: false },
    include: {
      essensplanHerkuenfte: { include: { eintrag: { include: { rezept: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return artikel.map((a) => ({
    id: a.id,
    name: a.name,
    menge: a.menge,
    herkunft: a.essensplanHerkuenfte.map((h) => ({
      rezeptName: h.eintrag.rezept.name,
      tag: h.eintrag.tag.toISOString(),
    })),
  }));
}

// Übernimmt einen "noch nicht zugesagten" Artikel — mergt in einen ggf. schon bestätigt
// offenen Artikel gleichen Namens, statt zwei Zeilen nebeneinander stehen zu lassen.
export async function bestaetigeArtikel(id: string, neueMenge?: string) {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.findUnique({ where: { id } });
  if (!artikel) return;
  const menge = neueMenge !== undefined ? neueMenge || null : artikel.menge;
  const bestehender = await findeOffenenArtikel(artikel.name);
  if (bestehender) {
    await prisma.einkaufsArtikel.update({
      where: { id: bestehender.id },
      data: { menge: await mergeMenge(bestehender.menge, menge) },
    });
    await prisma.essensplanHerkunft.updateMany({ where: { artikelId: id }, data: { artikelId: bestehender.id } });
    await prisma.einkaufsArtikel.delete({ where: { id } });
  } else {
    await prisma.einkaufsArtikel.update({ where: { id }, data: { menge, bestaetigt: true } });
  }
  revalidatePath("/einkaufsliste");
}

// Lehnt einen "noch nicht zugesagten" Artikel ab (z. B. schon zu Hause vorrätig) — löscht
// ihn samt Essensplan-Herkunfts-Verknüpfung (Cascade) wieder.
export async function lehneArtikelAb(id: string) {
  await requireParent();
  await prisma.einkaufsArtikel.delete({ where: { id } }).catch(() => {});
  revalidatePath("/einkaufsliste");
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
export async function addArtikel(data: { name: string; menge?: string; notiz?: string; kategorieId?: string }) {
  await requireParent();

  const bestehender = await findeOffenenArtikel(data.name);
  let artikelId: string;
  let artikel;
  if (bestehender) {
    artikel = await prisma.einkaufsArtikel.update({
      where: { id: bestehender.id },
      data: { menge: await mergeMenge(bestehender.menge, data.menge), notiz: data.notiz || bestehender.notiz },
    });
    artikelId = artikel.id;
  } else {
    const kategorieId = data.kategorieId || (await autoKategorieId(data.name));
    artikel = await prisma.einkaufsArtikel.create({
      data: { name: data.name, menge: data.menge, notiz: data.notiz || null, kategorieId: kategorieId || null },
    });
    artikelId = artikel.id;
  }
  await prisma.artikelQuelle.create({ data: { artikelId, beschreibung: "Manuell hinzugefügt", menge: data.menge } });
  revalidatePath("/einkaufsliste");
  return artikel;
}

// Eltern: Namen/Menge/Notiz eines bestehenden Artikels nachträglich korrigieren.
export async function updateArtikel(id: string, data: { name?: string; menge?: string; notiz?: string }) {
  await requireParent();
  await prisma.einkaufsArtikel.update({
    where: { id },
    data: { name: data.name, menge: data.menge, notiz: data.notiz !== undefined ? data.notiz || null : undefined },
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
export async function submitWunsch(data: { artikelName: string; menge?: string; notiz?: string }) {
  const person = await requirePerson();
  const wunsch = await prisma.einkaufsWunsch.create({
    data: { artikelName: data.artikelName, menge: data.menge, notiz: data.notiz || null, kindId: person.id },
  });
  await logAenderung({ entityTyp: "EINKAUFS_WUNSCH", entityId: wunsch.id, aktion: "eingereicht", neuerWert: wunsch.artikelName, geaendertVonId: person.id });
  revalidatePath("/einkaufsliste");
}

// Fix-Batch 30: ein Kind darf seinen eigenen Wunsch bearbeiten/zurückziehen, solange er noch
// OFFEN ist (noch nicht genehmigt/abgelehnt) — danach nicht mehr, da schon in die Liste
// übernommen bzw. entschieden.
export async function updateWunsch(id: string, data: { artikelName?: string; menge?: string; notiz?: string }) {
  const person = await requirePerson();
  const bestehend = await prisma.einkaufsWunsch.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Wunsch nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
  if (bestehend.status !== "OFFEN") throw new Error("Nur ein noch nicht entschiedener Wunsch kann bearbeitet werden.");
  await prisma.einkaufsWunsch.update({ where: { id }, data });
  revalidatePath("/einkaufsliste");
}

export async function deleteWunsch(id: string) {
  const person = await requirePerson();
  const bestehend = await prisma.einkaufsWunsch.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Wunsch nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
  if (person.rolle !== "ELTERN" && bestehend.status !== "OFFEN") throw new Error("Nur ein noch nicht entschiedener Wunsch kann zurückgezogen werden.");
  await prisma.einkaufsWunsch.delete({ where: { id } });
  revalidatePath("/einkaufsliste");
}

export async function entscheideWunsch(id: string, genehmigt: boolean, kategorieId?: string) {
  const person = await requireParent();
  const wunsch = await prisma.einkaufsWunsch.update({
    where: { id },
    data: { status: genehmigt ? "GENEHMIGT" : "ABGELEHNT", entschiedenAm: new Date() },
    include: { kind: true },
  });
  if (genehmigt) {
    const bestehender = await findeOffenenArtikel(wunsch.artikelName);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: {
          menge: await mergeMenge(bestehender.menge, wunsch.menge),
          notiz: wunsch.notiz || bestehender.notiz,
          vonWunschId: wunsch.id,
          kategorieId: bestehender.kategorieId || kategorieId || (await autoKategorieId(wunsch.artikelName)),
        },
      });
      artikelId = bestehender.id;
    } else {
      const finalKategorieId = kategorieId || (await autoKategorieId(wunsch.artikelName));
      const neu = await prisma.einkaufsArtikel.create({
        data: {
          name: wunsch.artikelName,
          menge: wunsch.menge,
          notiz: wunsch.notiz,
          kategorieId: finalKategorieId || null,
          quelle: "wunsch",
          vonWunschId: wunsch.id,
        },
      });
      artikelId = neu.id;
    }
    await prisma.artikelQuelle.create({ data: { artikelId, beschreibung: `Wunsch von ${wunsch.kind.name}`, menge: wunsch.menge } });
  }
  await logAenderung({
    entityTyp: "EINKAUFS_WUNSCH",
    entityId: id,
    aktion: genehmigt ? "genehmigt" : "abgelehnt",
    geaendertVonId: person.id,
  });
  revalidatePath("/einkaufsliste");
}

// ---------- Quellen-Aufschlüsselung je Artikel (Fahrplan §3, Batch 2) ----------

export async function listArtikelQuellen(artikelId: string) {
  await requireParent();
  const [quellen, essensplanHerkuenfte] = await Promise.all([
    prisma.artikelQuelle.findMany({ where: { artikelId } }),
    prisma.essensplanHerkunft.findMany({ where: { artikelId }, include: { eintrag: { include: { rezept: true } } } }),
  ]);
  const kombiniert = [
    ...quellen.map((q) => ({ id: q.id, beschreibung: q.beschreibung, menge: q.menge, zeitpunkt: q.createdAt.toISOString() })),
    ...essensplanHerkuenfte.map((h) => ({
      id: h.id,
      beschreibung: `Essensplan: ${h.eintrag.rezept.name} (${h.eintrag.tag.toLocaleDateString("de-DE")})`,
      menge: h.menge,
      zeitpunkt: h.createdAt.toISOString(),
    })),
  ];
  kombiniert.sort((a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime());
  return kombiniert;
}

// ---------- Vorschlagsliste häufig gekaufter Artikel (Fahrplan §3, Batch 2) ----------
// Nutzt die bestehende Einkaufslisten-Historie (jeder abgeschlossene Einkaufszyklus
// erzeugt beim erneuten Hinzufügen einen neuen Artikel-Datensatz, da findeOffenenArtikel
// nur unerledigte Artikel matcht) statt eines separaten Kauf-Historie-Modells.
export async function listVorschlaege() {
  await requireParent();
  const [alleArtikel, offene, dismisses] = await Promise.all([
    prisma.einkaufsArtikel.findMany({ select: { name: true, menge: true, createdAt: true } }),
    prisma.einkaufsArtikel.findMany({ where: { erledigt: false }, select: { name: true } }),
    prisma.vorschlagDismiss.findMany(),
  ]);
  const dismissMap = new Map(dismisses.map((d) => [d.name, d.anzahl]));
  const offeneNamen = new Set(offene.map((a) => a.name.trim().toLowerCase()));

  const gruppen = new Map<string, { anzahl: number; menge: string | null; zeitpunkt: number; anzeigeName: string }>();
  for (const a of alleArtikel) {
    const key = a.name.trim().toLowerCase();
    const bestehend = gruppen.get(key);
    if (!bestehend) {
      gruppen.set(key, { anzahl: 1, menge: a.menge, zeitpunkt: a.createdAt.getTime(), anzeigeName: a.name.trim() });
    } else {
      bestehend.anzahl += 1;
      if (a.createdAt.getTime() > bestehend.zeitpunkt) {
        bestehend.menge = a.menge;
        bestehend.zeitpunkt = a.createdAt.getTime();
      }
    }
  }

  return Array.from(gruppen.entries())
    .filter(([key, g]) => g.anzahl >= 2 && !offeneNamen.has(key))
    .map(([key, g]) => ({ name: g.anzeigeName, menge: g.menge, score: g.anzahl / (1 + (dismissMap.get(key) ?? 0)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ name, menge }) => ({ name, menge }));
}

export async function verwirfVorschlag(name: string) {
  await requireParent();
  const key = name.trim().toLowerCase();
  await prisma.vorschlagDismiss.upsert({
    where: { name: key },
    update: { anzahl: { increment: 1 } },
    create: { name: key, anzahl: 1 },
  });
  revalidatePath("/einkaufsliste");
}

export async function setzeVorschlaegeZurueck() {
  await requireParent();
  await prisma.vorschlagDismiss.deleteMany({});
  revalidatePath("/einkaufsliste");
}

export async function addKategorie(name: string) {
  await requireParent();
  const anzahl = await prisma.einkaufsKategorie.count();
  await prisma.einkaufsKategorie.create({ data: { name, reihenfolge: anzahl } });
  revalidatePath("/einkaufsliste");
  revalidatePath("/einstellungen");
}

// Kategorie-Reihenfolge in der App änderbar machen (Fragenkatalog Frage 7).
export async function verschiebeKategorie(id: string, richtung: "hoch" | "runter") {
  await requireParent();
  const kategorien = await prisma.einkaufsKategorie.findMany({ orderBy: { reihenfolge: "asc" } });
  const index = kategorien.findIndex((k) => k.id === id);
  if (index === -1) return;
  const zielIndex = richtung === "hoch" ? index - 1 : index + 1;
  if (zielIndex < 0 || zielIndex >= kategorien.length) return;
  const a = kategorien[index];
  const b = kategorien[zielIndex];
  await prisma.$transaction([
    prisma.einkaufsKategorie.update({ where: { id: a.id }, data: { reihenfolge: b.reihenfolge } }),
    prisma.einkaufsKategorie.update({ where: { id: b.id }, data: { reihenfolge: a.reihenfolge } }),
  ]);
  revalidatePath("/einkaufsliste");
  revalidatePath("/einstellungen");
}
