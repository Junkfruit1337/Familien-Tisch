import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DIENSTE_VORLAGE, TAGESROUTINEN_VORLAGE, KOERPERPFLEGE_VORLAGE } from "../src/lib/schichtsystemVorlage";
import { SCHULFERIEN } from "../src/lib/schulferienDaten";
import { erkenneKategorie } from "../src/lib/kategorisierung";

const prisma = new PrismaClient();

const FAMILIE = [
  { name: "Flo", rolle: "ELTERN" as const, farbe: "#a97155" },
  { name: "Tugce", rolle: "ELTERN" as const, farbe: "#8a9a6e" },
  { name: "Lina", rolle: "KIND" as const, farbe: "#c98a68" },
  { name: "Emil", rolle: "KIND" as const, farbe: "#6e8fa9" },
  { name: "Emma", rolle: "KIND" as const, farbe: "#b58fc9" },
  { name: "Ayla", rolle: "KIND_OHNE_ZUGANG" as const, farbe: "#d9b25c" },
];

// Konserven & Vorrat ergänzt (Fix-Batch 35 Nachtrag, Ticket "Verbesserte Produktkategorisierung
// nach Spezifikation") — läuft beim nächsten Deploy per upsert automatisch in die Live-DB ein.
const KATEGORIEN = [
  "Obst", "Gemüse", "Milchprodukte", "Fleisch & Fisch", "Backwaren", "Tiefkühl",
  "Konserven", "Vorrat", "Getränke", "Drogerie", "Sonstiges",
];

async function main() {
  console.log("Seed: Standard-PIN für alle Login-Personen ist 0000 — bitte in den Einstellungen sofort ändern!");

  const standardPinHash = await bcrypt.hash("0000", 10);

  for (let i = 0; i < FAMILIE.length; i++) {
    const f = FAMILIE[i];
    await prisma.person.upsert({
      where: { id: `seed-${f.name.toLowerCase()}` },
      update: {},
      create: {
        id: `seed-${f.name.toLowerCase()}`,
        name: f.name,
        rolle: f.rolle,
        farbe: f.farbe,
        pinHash: f.rolle === "KIND_OHNE_ZUGANG" ? null : standardPinHash,
        reihenfolge: i,
      },
    });
  }

  // Fix-Batch 131 (Florians Wunsch, nach dem Account-Vorfall): erzwingt eine PIN-Änderung für
  // jede Person, deren aktuelle PIN noch die Standard-PIN "0000" ist — läuft bei jedem Deploy
  // erneut, damit auch bereits existierende Personen erfasst werden, nicht nur neu angelegte.
  const personenMitPin = await prisma.person.findMany({ where: { pinHash: { not: null } } });
  for (const p of personenMitPin) {
    if (p.pinAendernErforderlich) continue;
    const istStandardPin = await bcrypt.compare("0000", p.pinHash!);
    if (istStandardPin) {
      await prisma.person.update({ where: { id: p.id }, data: { pinAendernErforderlich: true } });
    }
  }

  for (const d of DIENSTE_VORLAGE) {
    const existing = await prisma.dienstDefinition.findFirst({ where: { schichtNummer: d.schichtNummer, reihenfolge: d.reihenfolge } });
    if (existing) {
      await prisma.dienstDefinition.update({ where: { id: existing.id }, data: { bezeichnung: d.bezeichnung, beschreibung: d.beschreibung } });
    } else {
      await prisma.dienstDefinition.create({ data: d });
    }
  }

  if ((await prisma.tagesroutine.count()) === 0) {
    for (const gruppe of TAGESROUTINEN_VORLAGE) {
      for (let i = 0; i < gruppe.texte.length; i++) {
        await prisma.tagesroutine.create({ data: { kategorie: gruppe.kategorie, reihenfolge: i, text: gruppe.texte[i] } });
      }
    }
  }

  for (const [wochentag, text] of Object.entries(KOERPERPFLEGE_VORLAGE)) {
    await prisma.koerperpflegetag.upsert({
      where: { wochentag: Number(wochentag) },
      update: { text },
      create: { wochentag: Number(wochentag), text },
    });
  }

  for (let i = 0; i < KATEGORIEN.length; i++) {
    await prisma.einkaufsKategorie.upsert({
      where: { name: KATEGORIEN[i] },
      update: {},
      create: { name: KATEGORIEN[i], reihenfolge: i },
    });
  }

  // Einmalige, aber gefahrlos wiederholbare Migration (Fix-Batch 28): "Obst & Gemüse" wurde
  // in "Obst" und "Gemüse" aufgeteilt (Florians Wunsch). Bestehende Artikel der alten
  // Kategorie werden anhand ihres Namens neu einsortiert, die alte Kategorie danach
  // gelöscht — läuft bei jedem weiteren Deploy einfach ins Leere, da die alte Kategorie
  // dann nicht mehr existiert.
  const alteObstGemueseKategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: "Obst & Gemüse" } });
  if (alteObstGemueseKategorie) {
    const [obst, gemuese] = await Promise.all([
      prisma.einkaufsKategorie.findUnique({ where: { name: "Obst" } }),
      prisma.einkaufsKategorie.findUnique({ where: { name: "Gemüse" } }),
    ]);
    const betroffeneArtikel = await prisma.einkaufsArtikel.findMany({ where: { kategorieId: alteObstGemueseKategorie.id } });
    for (const artikel of betroffeneArtikel) {
      const erkannt = erkenneKategorie(artikel.name);
      const neueKategorieId = erkannt === "Obst" ? obst?.id : gemuese?.id;
      if (neueKategorieId) {
        await prisma.einkaufsArtikel.update({ where: { id: artikel.id }, data: { kategorieId: neueKategorieId } });
      }
    }
    await prisma.einkaufsKategorie.delete({ where: { id: alteObstGemueseKategorie.id } });
  }

  // Einmalige, aber gefahrlos wiederholbare Korrektur (Fix-Batch 91, Florians Bug-Meldung):
  // die Dienst-Rotation lief bisher pro Person eine Schicht-Nummer pro Woche NACH UNTEN statt
  // nach oben — die Kinder machen es seit Monaten andersherum. Ab dem 14.09.2026 ("ab morgen",
  // Florians Wunsch) korrigiert; die laufende Woche (bis 13.09.2026) bleibt unangetastet.
  // Bereits erzeugte DienstZuweisung-Zeilen ab diesem Datum werden hier einmalig auf die neue
  // Formel (siehe lib/dienstplan.ts) umgerechnet — läuft bei jedem weiteren Deploy einfach ins
  // Leere, sobald alle betroffenen Zeilen schon korrekt sind.
  const ROTATION_KORREKTUR_AB = new Date(Date.UTC(2026, 8, 14));
  const ROTATION_ANCHOR_MONDAY = new Date(Date.UTC(2026, 4, 11));
  const ROTATIONS_KINDER_NAMEN = ["Lina", "Emil", "Emma"];
  const zuKorrigierendeZuweisungen = await prisma.dienstZuweisung.findMany({
    where: { wocheStart: { gte: ROTATION_KORREKTUR_AB } },
  });
  if (zuKorrigierendeZuweisungen.length > 0) {
    const rotationsKinder = await prisma.person.findMany({ where: { name: { in: ROTATIONS_KINDER_NAMEN } } });
    const byName = Object.fromEntries(rotationsKinder.map((k) => [k.name, k]));
    const dauerhafteZuordnungen = await prisma.dauerhafteZuordnung.findMany({ where: { art: "DIENST" } });
    const dauerhaftProSlot = Object.fromEntries(dauerhafteZuordnungen.map((d) => [d.slot, d.kindId]));
    const msProWoche = 7 * 24 * 60 * 60 * 1000;

    for (const zuweisung of zuKorrigierendeZuweisungen) {
      if (dauerhaftProSlot[zuweisung.schichtNummer]) continue; // dauerhafte Zuordnung hat Vorrang, unverändert lassen
      const wochenSeitAnker = Math.round((zuweisung.wocheStart.getTime() - ROTATION_ANCHOR_MONDAY.getTime()) / msProWoche);
      const offset = ((wochenSeitAnker % 3) + 3) % 3;
      const kindIndex = (((zuweisung.schichtNummer - offset) % 3) + 3) % 3;
      const korrektesKindId = byName[ROTATIONS_KINDER_NAMEN[kindIndex]]?.id;
      if (korrektesKindId && korrektesKindId !== zuweisung.kindId) {
        await prisma.dienstZuweisung.update({ where: { id: zuweisung.id }, data: { kindId: korrektesKindId } });
      }
    }
  }

  // Schulferien-Referenzdaten (Fix-Batch 27) — jedes Jahr per Deploy neu synchronisiert,
  // sobald schulferienDaten.ts um ein weiteres Schuljahr ergänzt wird.
  for (const f of SCHULFERIEN) {
    await prisma.schulferien.upsert({
      where: { bundesland_schuljahr_typ: { bundesland: f.bundesland, schuljahr: f.schuljahr, typ: f.typ } },
      update: { start: new Date(f.start), ende: new Date(f.ende) },
      create: { bundesland: f.bundesland, schuljahr: f.schuljahr, typ: f.typ, start: new Date(f.start), ende: new Date(f.ende) },
    });
  }

  console.log("Seed abgeschlossen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
