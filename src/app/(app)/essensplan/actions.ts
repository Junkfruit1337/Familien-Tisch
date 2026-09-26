"use server";

import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { autoKategorieId, findeOffenenArtikel, findeOffenenUnbestaetigtenArtikel, mergeMenge } from "../einkaufsliste/actions";
import {
  erkenneRezeptAusDatei,
  erkenneRezeptAusSprache,
  schreibeRezeptUm,
  schlageSaisonalesRezeptVor,
  verdichteZubereitung,
  findeRezeptImInternet,
  schlageRezeptZuBeschreibungVor,
  pruefeZutatenZubereitungAbgleich,
  type ErkanntesRezept,
  type ZutatenZubereitungAbgleich,
} from "@/lib/rezeptErkennung";
import { istGueltigeKategorie } from "@/lib/rezeptKategorien";
import { parseZutatZeile, skaliereZeile } from "@/lib/zutatenSkalierung";
import { formatiereArtikelName } from "@/lib/artikelName";

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

// Rezeptdatenbank: vollständige Übersicht mit Detailfeldern, unabhängig vom
// Essensplan-Auswahlformular (Fahrplan §3, Batch 5).
export async function listRezepteDetail() {
  return prisma.rezept.findMany({ orderBy: { name: "asc" } });
}

export async function addRezept(name: string, zutaten: string, zubereitung?: string, portionenBasis?: number, kategorie?: string) {
  await requireParent();
  await prisma.rezept.create({
    data: {
      name,
      zutaten,
      zubereitung: zubereitung || undefined,
      portionenBasis: portionenBasis && portionenBasis > 0 ? portionenBasis : 6,
      kategorie: istGueltigeKategorie(kategorie) ? kategorie : "Hauptgang",
    },
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

// Volle Rezept-Bearbeitung (Fix-Batch 35 Nachtrag, Ticket "Rezept-Bearbeitung erweitern") —
// vorher war nur die Portionsgrundlage nachträglich änderbar, nicht die Zutatenmengen oder
// die Zubereitung selbst.
export async function updateRezept(rezeptId: string, data: { name?: string; zutaten?: string; zubereitung?: string; kategorie?: string }) {
  await requireParent();
  await prisma.rezept.update({
    where: { id: rezeptId },
    data: {
      name: data.name?.trim() || undefined,
      zutaten: data.zutaten !== undefined ? data.zutaten : undefined,
      zubereitung: data.zubereitung !== undefined ? data.zubereitung || null : undefined,
      kategorie: data.kategorie && istGueltigeKategorie(data.kategorie) ? data.kategorie : undefined,
    },
  });
  revalidatePath("/essensplan");
}

// Rezept-Erfassung per Foto ODER PDF-Datei (Fragenkatalog Frage 25, Batch 8; PDF Fix-Batch 76)
// — füllt nur das "Neues Rezept"-Formular vor, gespeichert wird erst nach Prüfung/Korrektur
// durch die Eltern. Fehler werden hier abgefangen und als Ergebnis-Objekt zurückgegeben statt
// geworfen, weil Next.js Fehlermeldungen aus Server Actions im Produktions-Build sonst durch
// eine generische Meldung ersetzt ("...error occurred in the Server Components render...").
export async function erkenneRezeptAusFoto(
  datenUrl: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await erkenneRezeptAusDatei(datenUrl);
    return { ok: true, rezept };
  } catch (err) {
    console.error("Rezept-Erkennung (Foto/Datei) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Erkennung.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 76 (Florians Korrektur an Fix-Batch 75): Diktieren eines bekannten Rezepts ist
// kein "Erfinden" — braucht wieder eine eigene, treue Transkriptions-Aktion im Bereich
// "Vorhandenes Rezept hinzufügen", getrennt von der KI-Vorschlags-Funktion weiter unten.
export async function erkenneRezeptAusText(
  text: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await erkenneRezeptAusSprache(text);
    return { ok: true, rezept };
  } catch (err) {
    console.error("Rezept-Sprach-Erkennung fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 64 (Florians KI-Vorschlag "Saisonale Rezeptideen"): ermittelt die aktuelle
// Jahreszeit, holt die letzten Vorschläge derselben Saison zur Wiederholungs-Vermeidung und
// speichert den neuen Vorschlagsnamen danach ab (Historie wird auf die letzten 5 pro Saison
// begrenzt, ältere Einträge werden gelöscht).
function aktuelleSaison(datum = new Date()): string {
  const monat = datum.getMonth() + 1;
  if (monat >= 3 && monat <= 5) return "Frühling";
  if (monat >= 6 && monat <= 8) return "Sommer";
  if (monat >= 9 && monat <= 11) return "Herbst";
  return "Winter";
}

export async function schlageSaisonaleIdeeVor(): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const saison = aktuelleSaison();
    const bisherige = await prisma.saisonVorschlag.findMany({
      where: { saison },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const rezept = await schlageSaisonalesRezeptVor(saison, bisherige.map((b) => b.name));
    if (rezept.name) {
      await prisma.saisonVorschlag.create({ data: { saison, name: rezept.name } });
      const alle = await prisma.saisonVorschlag.findMany({ where: { saison }, orderBy: { createdAt: "desc" } });
      const zuLoeschen = alle.slice(5).map((a) => a.id);
      if (zuLoeschen.length > 0) await prisma.saisonVorschlag.deleteMany({ where: { id: { in: zuLoeschen } } });
    }
    return { ok: true, rezept };
  } catch (err) {
    console.error("Saisonaler Rezeptvorschlag fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Erstellen des Vorschlags.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 73 (Florians Wunsch: Rezept-Finder per Beschreibung, z.B. "eine Suppe", "was
// mit Hähnchen", "ich hab Zucchini und Reis da") — liefert nur eine Vorschau, gespeichert
// wird erst nach Prüfung durch die Eltern (analog Foto-/Sprach-Erkennung).
// Fix-Batch 74 (Florians Wunsch, nach Kosten-Rückfrage): günstige Standard-Variante ohne
// Web-Suche — Vorschau wie gehabt, nichts wird automatisch gespeichert.
export async function schlageRezeptZuBeschreibungVorschau(
  beschreibung: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await schlageRezeptZuBeschreibungVor(beschreibung);
    return { ok: true, rezept };
  } catch (err) {
    console.error("KI-Rezeptvorschlag fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Erstellen des Vorschlags.";
    return { ok: false, fehler };
  }
}

export async function findeRezeptImInternetVorschau(
  beschreibung: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await findeRezeptImInternet(beschreibung);
    if (!rezept.name) {
      return { ok: false, fehler: "Konnte kein passendes, gut bewertetes Rezept dazu finden. Bitte anders beschreiben." };
    }
    return { ok: true, rezept };
  } catch (err) {
    console.error("Rezept-Finder fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Rezeptsuche.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 64 (Florians KI-Vorschlag "Kochanleitungen verdichten"): reine Vorschau, ersetzt
// die Zubereitung erst nach ausdrücklicher Bestätigung durch die Eltern.
export async function verdichteZubereitungVorschau(
  zubereitung: string
): Promise<{ ok: true; zubereitung: string } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const ergebnis = await verdichteZubereitung(zubereitung);
    return { ok: true, zubereitung: ergebnis };
  } catch (err) {
    console.error("Verdichten der Zubereitung fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Verdichten.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 97 (Florians Wunsch): prüft, ob die in der Zubereitung genannten Mengen zur
// Zutatenliste passen (z.B. eine Zutat, die in mehreren Schritten mit Teilmengen verwendet
// wird) — reine Vorschau, ersetzt die Zubereitung erst nach ausdrücklicher Bestätigung.
export async function pruefeZutatenZubereitungVorschau(
  zutaten: string,
  zubereitung: string
): Promise<{ ok: true; ergebnis: ZutatenZubereitungAbgleich } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const ergebnis = await pruefeZutatenZubereitungAbgleich(zutaten, zubereitung);
    return { ok: true, ergebnis };
  } catch (err) {
    console.error("Zutaten/Zubereitung-Abgleich fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Abgleichen.";
    return { ok: false, fehler };
  }
}

// Fix-Batch 64 (Florians KI-Vorschlag "Ausgewogenheits-Check"): rein regelbasiert (keine
// KI nötig) — zählt Fleisch-/Fisch-Gerichte der aktuell geplanten Woche anhand von
// Schlüsselwörtern in den Zutaten. Nur ein grober Hinweis, keine exakte Ernährungsanalyse.
const FLEISCH_FISCH_STICHWORTE = [
  "hähnchen", "huhn", "pute", "rind", "schwein", "hack", "speck", "wurst", "schinken",
  "lamm", "ente", "gans", "fisch", "lachs", "thunfisch", "garnele", "scampi", "salami",
  "leberkäse", "bacon", "steak", "schnitzel", "gulasch", "kotelett",
];

export async function pruefeAusgewogenheitDerWoche(wocheStartIso: string): Promise<{ fleischGerichte: number; gesamtGerichte: number; hinweis: string | null }> {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  const eintraege = await prisma.essensplanEintrag.findMany({ where: { wocheStart }, include: { rezept: true } });
  const gesamtGerichte = eintraege.length;
  const fleischGerichte = eintraege.filter((e) => {
    const text = `${e.rezept.name} ${e.rezept.zutaten}`.toLowerCase();
    return FLEISCH_FISCH_STICHWORTE.some((w) => text.includes(w));
  }).length;
  let hinweis: string | null = null;
  if (gesamtGerichte >= 4 && fleischGerichte === gesamtGerichte) {
    hinweis = "Diese Woche sind alle geplanten Gerichte fleisch-/fischhaltig — evtl. ein vegetarischer Tag dazwischen?";
  } else if (gesamtGerichte >= 4 && fleischGerichte === 0) {
    hinweis = "Diese Woche ist bisher komplett vegetarisch geplant.";
  }
  return { fleischGerichte, gesamtGerichte, hinweis };
}

// Fix-Batch 63 (Florians KI-Vorschlag "Rezept-Umschreibung"): liefert nur eine Vorschau —
// ob daraus ein neues Rezept wird oder das bestehende überschrieben wird, entscheidet die
// Person danach explizit in der App (siehe EssensplanClient).
export async function schreibeRezeptUmVorschau(
  rezeptId: string,
  anweisung: string
): Promise<{ ok: true; rezept: ErkanntesRezept } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const rezept = await prisma.rezept.findUnique({ where: { id: rezeptId } });
    if (!rezept) return { ok: false, fehler: "Rezept nicht gefunden." };
    const ergebnis = await schreibeRezeptUm(
      { name: rezept.name, zutaten: rezept.zutaten, zubereitung: rezept.zubereitung ?? "" },
      anweisung
    );
    // Eine Umschreibung (z.B. "vegetarisch machen") ändert die Gerichtsart in aller Regel
    // nicht — die ursprüngliche Kategorie bleibt deshalb erhalten statt der KI-Schätzung.
    return { ok: true, rezept: { ...ergebnis, kategorie: rezept.kategorie } };
  } catch (err) {
    console.error("Rezept-Umschreibung fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler beim Umschreiben.";
    return { ok: false, fehler };
  }
}

// Ticket "Rezepte löschen" (Florians Meldung, 19.09.2026): Löschen schlug bisher für JEDES
// Rezept fehl, das JEMALS (auch vor Monaten) im Essensplan stand — EssensplanEintrag/
// ExtraMahlzeit verweisen ohne Kaskade auf Rezept, die Datenbank blockierte die Löschung also
// dauerhaft, nicht nur bei einer wirklich noch aktuellen Planung. Das machte Löschen für jedes
// tatsächlich genutzte Rezept faktisch unmöglich. Jetzt blockiert nur noch eine ECHTE aktuelle
// oder zukünftige Planung (mit klarer Fehlermeldung, welcher Tag betroffen ist) — vergangene
// Verwendungen werden beim Löschen automatisch mitentfernt (ihre Einkaufslisten-Herkunfts-
// Verknüpfung kaskadiert ohnehin schon, siehe EssensplanHerkunft/ExtraMahlzeitHerkunft).
export async function deleteRezept(id: string) {
  await requireParent();
  const heute = new Date(new Date().toDateString());
  const [naechsterEintrag, naechsteExtra] = await Promise.all([
    prisma.essensplanEintrag.findFirst({ where: { rezeptId: id, tag: { gte: heute } }, orderBy: { tag: "asc" } }),
    prisma.extraMahlzeit.findFirst({ where: { rezeptId: id, tag: { gte: heute } }, orderBy: { tag: "asc" } }),
  ]);
  const naechsterTag = [naechsterEintrag?.tag, naechsteExtra?.tag]
    .filter((t): t is Date => !!t)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (naechsterTag) {
    throw new Error(
      `Dieses Rezept ist noch für den ${naechsterTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })} (oder später) im Essensplan eingeplant — bitte dort zuerst ändern, dann erneut löschen.`
    );
  }
  await prisma.$transaction([
    prisma.essensplanEintrag.deleteMany({ where: { rezeptId: id } }),
    prisma.extraMahlzeit.deleteMany({ where: { rezeptId: id } }),
    prisma.rezept.delete({ where: { id } }),
  ]);
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
    .map((r) => ({ id: r.id, name: r.name, kategorie: r.kategorie, zuletztGeplant: r.planEintraege[0]?.tag.toISOString() ?? null }));
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
    include: { rezept: true, _count: { select: { herkuenfte: true } } },
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
            extraPortionen: eintrag.extraPortionen,
            // Fix-Batch 87 (Florians Wunsch): "gelockt" reicht hier NICHT als Signal, ob schon
            // eingekauft wurde — ein Tag kann auch manuell gesperrt sein (🔒 Sperren-Button),
            // ohne dass je Zutaten übernommen wurden. Nur ein tatsächlicher Herkunfts-Eintrag
            // beweist, dass Zutaten wirklich auf die Einkaufsliste gewandert sind.
            zutatenUebernommen: eintrag._count.herkuenfte > 0,
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

// Fix-Batch 74 (Florians Bug-Meldung): "– kein Gericht –" im Dropdown tat bisher nichts (der
// bisherige onChange rief tagAendern nur bei einem NICHT-leeren Wert auf) — ein einmal
// gewähltes Gericht ließ sich dadurch nie mehr zurücksetzen. Nur bei entsperrtem Tag möglich
// (das Dropdown ist bei gesperrtem Tag ohnehin deaktiviert); es können zu diesem Zeitpunkt
// keine essensplanHerkuenfte mehr an diesem Eintrag hängen (die werden beim Entsperren bereits
// vollständig aufgelöst), ein einfaches Löschen des Eintrags reicht daher aus.
export async function entferneTag(wocheStartIso: string, tagIso: string) {
  await requireParent();
  const wocheStart = new Date(wocheStartIso);
  const tag = new Date(tagIso);
  const bestehend = await prisma.essensplanEintrag.findFirst({ where: { wocheStart, tag } });
  if (!bestehend) return;
  if (bestehend.gelockt) throw new Error("Diese Woche ist gesperrt. Erst entsperren.");
  await prisma.essensplanHerkunft.deleteMany({ where: { eintragId: bestehend.id } });
  await prisma.essensplanEintrag.delete({ where: { id: bestehend.id } });
  revalidatePath("/essensplan");
}

// Sperrt einen Tag manuell — folgenlos, da noch keine Zutaten übernommen wurden
// (sonst wäre der Tag durch fuegeZutatenDesTagsHinzu ohnehin schon gesperrt).
export async function sperren(eintragId: string) {
  await requireParent();
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { gelockt: true } });
  revalidatePath("/essensplan");
}

// Skaliert nicht mehr fest auf 6, sondern auf die Portionsgrundlage des jeweiligen Rezepts
// (Fix-Batch 22) — ein Rezept "für 1 Portion" ergibt bei allen 6 Essern jetzt Faktor 6, statt
// fälschlich Faktor 1 wie zuvor. Personen-Gewichtung kommt aus der Datenbank (Fix-Batch 23,
// in den Einstellungen editierbar). extraPortionen (Fix-Batch 33 Nachtrag) zählt zusätzlich
// dazu, für spontane Gäste an dem Tag, ohne dass man dafür extra Personen anlegen müsste.
async function berechneFaktor(personIds: string[], extraPortionen: number, portionenBasis: number): Promise<number> {
  if (personIds.length === 0 && extraPortionen === 0) return 1;
  const alle = await prisma.person.findMany({ where: { id: { in: personIds } } });
  const gewichtSumme = alle.reduce((s, p) => s + p.portionsGewicht, 0) + extraPortionen;
  return gewichtSumme / portionenBasis;
}

export async function setEsser(eintragId: string, personIds: string[]) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return;
  const faktor = await berechneFaktor(personIds, eintrag.extraPortionen, eintrag.rezept.portionenBasis);
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { esserIds: personIds, esserFaktor: faktor } });
  revalidatePath("/essensplan");
}

// Extra-Portionen für spontane Gäste an einem Tag (Fix-Batch 33 Nachtrag, Florians Wunsch)
// — addiert sich zum gewichteten Esser-Total, bevor durch die Rezept-Portionsbasis geteilt wird.
export async function setExtraPortionen(eintragId: string, extraPortionen: number) {
  await requireParent();
  const eintrag = await prisma.essensplanEintrag.findUnique({ where: { id: eintragId }, include: { rezept: true } });
  if (!eintrag) return;
  const wert = Number.isFinite(extraPortionen) && extraPortionen >= 0 ? extraPortionen : 0;
  const faktor = await berechneFaktor(eintrag.esserIds, wert, eintrag.rezept.portionenBasis);
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { extraPortionen: wert, esserFaktor: faktor } });
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
    // Fix-Batch 145 (Ticket #8, "korrekte Groß-/Kleinschreibung"): Rezept-Zutatenzeilen kommen
    // oft komplett kleingeschrieben rein (KI-Erkennung oder Florians eigene Tipp-Gewohnheit) —
    // der Name wird erst hier, beim tatsächlichen Anlegen auf der Einkaufsliste, normalisiert.
    const name = formatiereArtikelName(zeile.name);
    const bestehender = await findeOffenenUnbestaetigtenArtikel(name);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: { menge: await mergeMenge(bestehender.menge, zeile.menge) },
      });
      artikelId = bestehender.id;
    } else {
      const kategorieId = await autoKategorieId(name);
      const neu = await prisma.einkaufsArtikel.create({
        data: { name, menge: zeile.menge, kategorieId: kategorieId || null, quelle: "essensplan", bestaetigt: false },
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
// Fix-Batch 85 (Florians Bug-Meldung): landet jetzt ebenfalls erst unbestätigt ("Noch nicht
// zugesagt") statt sofort bestätigt — dieselbe Vorprüfung wie beim Hauptgericht und den
// Zusatzmahlzeiten, damit z.B. "eine Prise Salz" (die man ohnehin meist schon hat) vor dem
// Einkauf nochmal bestätigt oder abgelehnt werden kann.
export async function uebernehmeZusaetzlicheZutaten(rezeptId: string, zeilen: { name: string; menge?: string }[], faktorLabel: string) {
  await requireParent();
  const rezept = await prisma.rezept.findUnique({ where: { id: rezeptId } });
  if (!rezept) return;
  for (const zeile of zeilen) {
    // Fix-Batch 145 (Ticket #8, "korrekte Groß-/Kleinschreibung"): Rezept-Zutatenzeilen kommen
    // oft komplett kleingeschrieben rein (KI-Erkennung oder Florians eigene Tipp-Gewohnheit) —
    // der Name wird erst hier, beim tatsächlichen Anlegen auf der Einkaufsliste, normalisiert.
    const name = formatiereArtikelName(zeile.name);
    const bestehender = await findeOffenenUnbestaetigtenArtikel(name);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: { menge: await mergeMenge(bestehender.menge, zeile.menge) },
      });
      artikelId = bestehender.id;
    } else {
      const kategorieId = await autoKategorieId(name);
      const neu = await prisma.einkaufsArtikel.create({
        data: { name, menge: zeile.menge, kategorieId: kategorieId || null, quelle: "essensplan", bestaetigt: false },
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

// Fix-Batch 80 (Florians Wunsch): zusätzliche geplante Mahlzeiten an einem Tag NEBEN dem
// Hauptgericht (z.B. Frühstück, ein zusätzliches warmes Essen, ein Mittags-Snack) — bewusst
// beliebig viele pro Tag, ganz ohne die Sperr-/Herkunfts-Logik des Hauptgerichts zu berühren.
export async function listExtraMahlzeitenFuerWoche(wocheStartIso: string) {
  const wocheStart = new Date(wocheStartIso);
  const eintraege = await prisma.extraMahlzeit.findMany({
    where: { wocheStart },
    include: { rezept: true, _count: { select: { herkuenfte: true } } },
    orderBy: { createdAt: "asc" },
  });
  return eintraege.map((e) => ({
    id: e.id,
    tag: e.tag.toISOString(),
    bezeichnung: e.bezeichnung,
    rezeptId: e.rezeptId,
    rezeptName: e.rezept.name,
    faktor: e.faktor,
    gelockt: e.gelockt,
    // Fix-Batch 87: siehe Kommentar bei getWochenplan — "gelockt" allein reicht nicht als
    // "schon eingekauft"-Signal, da eine Zusatzmahlzeit theoretisch ohne Zutaten-Übernahme
    // gesperrt sein könnte (aktuell zwar kein manueller Sperren-Weg dafür vorhanden, aber
    // derselbe verlässliche Herkunfts-Check wie beim Hauptgericht schadet nicht).
    zutatenUebernommen: e._count.herkuenfte > 0,
  }));
}

export async function fuegeExtraMahlzeitHinzu(wocheStartIso: string, tagIso: string, bezeichnung: string, rezeptId: string, faktor: number) {
  await requireParent();
  if (!bezeichnung.trim() || !rezeptId) return;
  await prisma.extraMahlzeit.create({
    data: {
      wocheStart: new Date(wocheStartIso),
      tag: new Date(tagIso),
      bezeichnung: bezeichnung.trim(),
      rezeptId,
      faktor: faktor && faktor > 0 ? faktor : 1,
    },
  });
  revalidatePath("/essensplan");
}

// Fix-Batch 84 (Florians Bug-Meldung): Löschen ist jetzt wie beim Hauptgericht nur bei
// entsperrter Zusatzmahlzeit möglich — sonst blieben bereits übernommene Einkaufslisten-
// Mengen als Karteileiche stehen. Erst "entsperreExtraMahlzeit" (mit Entfernen/Behalten-
// Abfrage) auflösen, danach löschen.
export async function entferneExtraMahlzeit(id: string) {
  await requireParent();
  const eintrag = await prisma.extraMahlzeit.findUnique({ where: { id } });
  if (!eintrag) return;
  if (eintrag.gelockt) throw new Error("Diese Zusatzmahlzeit ist gesperrt. Erst entsperren.");
  await prisma.extraMahlzeit.delete({ where: { id } }).catch(() => {});
  revalidatePath("/essensplan");
}

// Ein Klick reicht (keine Zeilen-Auswahl wie bei der allgemeinen Extra-Rezept-Ergänzung in
// der Einkaufsliste) — die Entscheidung für dieses Gericht+diese Menge ist mit dem Anlegen
// der ExtraMahlzeit schon getroffen.
// Fix-Batch 84 (Florians Bug-Meldung): sperrt jetzt nach Übernahme genauso wie das
// Hauptgericht (fuegeZutatenDesTagsHinzu) — vorher ließ sich derselbe Button beliebig oft
// erneut anklicken und hat dieselbe Menge jedes Mal zusätzlich auf die Einkaufsliste
// addiert. Herkunft läuft jetzt über ExtraMahlzeitHerkunft (upsert, wie beim Hauptgericht)
// statt über eine schlichte ArtikelQuelle-Zeile, damit sich die Menge beim Entsperren
// wieder sauber herausrechnen lässt.
// Fix-Batch 85 (Florians Bug-Meldung): landet jetzt genau wie beim Hauptgericht erst
// unbestätigt ("Noch nicht zugesagt" auf der Einkaufsliste) statt sofort als bestätigter
// Artikel — vorher gingen Zusatzmahlzeit-Zutaten ohne jede Vorprüfung direkt auf die Liste,
// selbst Dinge wie "eine Prise Salz", die man ohnehin meist schon zu Hause hat.
export async function fuegeZutatenFuerExtraMahlzeitHinzu(id: string) {
  await requireParent();
  const eintrag = await prisma.extraMahlzeit.findUnique({ where: { id }, include: { rezept: true } });
  if (!eintrag || eintrag.gelockt) return;
  const zeilen = eintrag.rezept.zutaten
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => skaliereZeile(parseZutatZeile(z), eintrag.faktor || 1));

  for (const zeile of zeilen) {
    // Fix-Batch 145 (Ticket #8, "korrekte Groß-/Kleinschreibung"): Rezept-Zutatenzeilen kommen
    // oft komplett kleingeschrieben rein (KI-Erkennung oder Florians eigene Tipp-Gewohnheit) —
    // der Name wird erst hier, beim tatsächlichen Anlegen auf der Einkaufsliste, normalisiert.
    const name = formatiereArtikelName(zeile.name);
    const bestehender = await findeOffenenUnbestaetigtenArtikel(name);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: { menge: await mergeMenge(bestehender.menge, zeile.menge) },
      });
      artikelId = bestehender.id;
    } else {
      const kategorieId = await autoKategorieId(name);
      const neu = await prisma.einkaufsArtikel.create({
        data: { name, menge: zeile.menge, kategorieId: kategorieId || null, quelle: "essensplan", bestaetigt: false },
      });
      artikelId = neu.id;
    }
    await prisma.extraMahlzeitHerkunft.upsert({
      where: { artikelId_extraMahlzeitId: { artikelId, extraMahlzeitId: id } },
      update: { menge: zeile.menge },
      create: { artikelId, extraMahlzeitId: id, menge: zeile.menge },
    });
  }
  await prisma.extraMahlzeit.update({ where: { id }, data: { gelockt: true } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}

// Prüft vor dem Entsperren, ob für diese Zusatzmahlzeit schon Zutaten übernommen wurden —
// analog pruefeGelocktenTagWechsel beim Hauptgericht.
export async function pruefeGelocktenExtraMahlzeitWechsel(extraMahlzeitId: string) {
  await requireParent();
  const herkuenfte = await prisma.extraMahlzeitHerkunft.findMany({ where: { extraMahlzeitId }, include: { artikel: true } });
  return herkuenfte.map((h) => ({ artikelId: h.artikelId, artikelName: h.artikel.name, menge: h.menge }));
}

// Fix-Batch 105 (Florians Bug-Meldung: Knoblauchzehen beim Entfernen komplett verschwunden,
// obwohl 5 davon manuell dazugekommen waren): "entfernen" rechnete den Mengen-Anteil eines
// Gerichts bisher nur gegen ANDERE Herkünfte DERSELBEN Art aus (z. B. nur andere
// ExtraMahlzeitHerkunft-Zeilen) — sowohl manuell/per Wunsch hinzugefügte Mengen
// (ArtikelQuelle) als auch Mengen aus der jeweils ANDEREN Herkunftsart (Hauptgericht vs.
// Zusatzmahlzeit) blieben dabei unberücksichtigt und gingen mit verloren, obwohl sie
// unabhängig vom gerade entfernten Gericht weiterbestehen sollten. Jetzt: verbleibende Menge
// = Summe ALLER anderen Herkünfte (beide Arten) + ALLER ArtikelQuelle-Einträge. Gemeinsam für
// wendeEntscheidungenAn (Hauptgericht) und entsperreExtraMahlzeit (Zusatzmahlzeit) genutzt.
async function berechneVerbleibendeMenge(
  artikelId: string,
  ausgenommen: { eintragId?: string; extraMahlzeitId?: string }
): Promise<string | null> {
  const [essensplanHerkuenfte, extraHerkuenfte, quellen] = await Promise.all([
    prisma.essensplanHerkunft.findMany({
      where: { artikelId, ...(ausgenommen.eintragId ? { eintragId: { not: ausgenommen.eintragId } } : {}) },
    }),
    prisma.extraMahlzeitHerkunft.findMany({
      where: { artikelId, ...(ausgenommen.extraMahlzeitId ? { extraMahlzeitId: { not: ausgenommen.extraMahlzeitId } } : {}) },
    }),
    prisma.artikelQuelle.findMany({ where: { artikelId } }),
  ]);
  let neueMenge: string | null = null;
  for (const h of [...essensplanHerkuenfte, ...extraHerkuenfte, ...quellen]) {
    neueMenge = await mergeMenge(neueMenge, h.menge);
  }
  return neueMenge;
}

// Entsperrt eine Zusatzmahlzeit — dieselbe Entfernen/Behalten-Logik wie beim Hauptgericht
// (siehe wendeEntscheidungenAn), nur auf ExtraMahlzeitHerkunft statt EssensplanHerkunft.
export async function entsperreExtraMahlzeit(extraMahlzeitId: string, entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]) {
  await requireParent();
  for (const e of entscheidungen) {
    if (e.aktion === "entfernen") {
      const neueMenge = await berechneVerbleibendeMenge(e.artikelId, { extraMahlzeitId });
      const artikel = await prisma.einkaufsArtikel.findUnique({ where: { id: e.artikelId } });
      if (artikel) {
        if (!neueMenge && artikel.quelle === "essensplan") {
          await prisma.einkaufsArtikel.delete({ where: { id: e.artikelId } }).catch(() => {});
        } else {
          await prisma.einkaufsArtikel.update({ where: { id: e.artikelId }, data: { menge: neueMenge } }).catch(() => {});
        }
      }
    }
    await prisma.extraMahlzeitHerkunft.deleteMany({ where: { artikelId: e.artikelId, extraMahlzeitId } });
  }
  await prisma.extraMahlzeit.update({ where: { id: extraMahlzeitId }, data: { gelockt: false } });
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
      const neueMenge = await berechneVerbleibendeMenge(e.artikelId, { eintragId });
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

// Entsperrt einen Tag — erst danach lässt sich das Gericht wieder ändern (Fix-Batch 29:
// vorher gab es zusätzlich einen zweiten, verwirrenden Weg, das Gericht direkt aus dem
// gesperrten Dropdown heraus zu ändern — der stand im Weg und führte dazu, dass die
// Zutaten zwar korrekt entfernt wurden, das eigentliche Gericht aber nicht wechselte.
// Jetzt: Dropdown ist gesperrt, solange der Tag gesperrt ist — erst entsperren (mit
// derselben Entfernen/Behalten-Abfrage wie zuvor), dann normal per Dropdown ändern).
export async function entsperren(eintragId: string, entscheidungen: { artikelId: string; aktion: "entfernen" | "behalten" }[]) {
  await requireParent();
  await wendeEntscheidungenAn(eintragId, entscheidungen);
  await prisma.essensplanEintrag.update({ where: { id: eintragId }, data: { gelockt: false } });
  revalidatePath("/essensplan");
  revalidatePath("/einkaufsliste");
}
