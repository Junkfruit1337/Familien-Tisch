import "server-only";
import { prisma } from "./prisma";

// Rotation ist rechnerisch an die Woche vom 11.05.2026 verankert (Montag).
const ANCHOR_MONDAY = new Date(Date.UTC(2026, 4, 11)); // Monat 0-indiziert: Mai = 4

export function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sonntag
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

function weeksSinceAnchor(wocheStart: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((wocheStart.getTime() - ANCHOR_MONDAY.getTime()) / msPerWeek);
}

// Die drei rotierenden Kinder in fester Reihenfolge (Namen, wie im Fahrplan benannt).
const ROTATIONS_KINDER_NAMEN = ["Lina", "Emil", "Emma"];

// Dauerhafte Zuordnungen (Fix-Batch 35) überschreiben die algorithmische Rotation für neu
// erzeugte Wochen-Zeilen — bereits erzeugte Zeilen werden separat beim Setzen einmalig
// nachaktualisiert (siehe setzeDauerhafteZuordnungIntern in actions.ts).
async function holeDauerhafteZuordnungen(art: "DIENST" | "BAD_MORGENS" | "BAD_ABENDS", familieId: string): Promise<Record<number, string>> {
  const rows = await prisma.dauerhafteZuordnung.findMany({ where: { art, familieId } });
  return Object.fromEntries(rows.map((r) => [r.slot, r.kindId]));
}

export async function ensureWeekAssignments(wocheStart: Date, familieId: string) {
  const existing = await prisma.dienstZuweisung.findMany({ where: { wocheStart, familieId } });
  if (existing.length === 3) return existing;

  const kinder = await prisma.person.findMany({
    where: { name: { in: ROTATIONS_KINDER_NAMEN }, familieId },
  });
  if (kinder.length !== 3) return existing; // Personen noch nicht angelegt

  const byName = Object.fromEntries(kinder.map((k) => [k.name, k]));
  const offset = ((weeksSinceAnchor(wocheStart) % 3) + 3) % 3;
  const dauerhaft = await holeDauerhafteZuordnungen("DIENST", familieId);

  const created = [];
  for (let schicht = 1; schicht <= 3; schicht++) {
    // Fix-Batch 91 (Florians Bug-Meldung): pro Person rückte die Schicht-Nummer bisher jede
    // Woche eine Nummer NACH UNTEN (3→2→1→3...), obwohl die Kinder seit Monaten in die andere
    // Richtung rotieren (1→2→3→1...). Die alte Formel ((offset + schicht - 1) % 3) ergab genau
    // die falsche Richtung; ((schicht - offset) % 3) ist an derselben Referenzwoche verankert,
    // dreht die Richtung aber um. Bereits erzeugte künftige Wochen werden dazu einmalig in
    // prisma/seed.ts korrigiert.
    const kindIndex = (((schicht - offset) % 3) + 3) % 3;
    const berechnetesKindId = byName[ROTATIONS_KINDER_NAMEN[kindIndex]]?.id;
    const kindId = dauerhaft[schicht] ?? berechnetesKindId;
    if (!kindId) continue;
    const row = await prisma.dienstZuweisung.upsert({
      where: { familieId_wocheStart_schichtNummer: { familieId, wocheStart, schichtNummer: schicht } },
      update: {},
      create: { familieId, wocheStart, schichtNummer: schicht, kindId },
    });
    created.push(row);
  }
  return created;
}

function addTage(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function tagKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Berechnet die effektive Zuordnung für die ganze Woche UND — Entscheidung vom 03.09.2026 —
// tagesgenaue Tausche wirken sich tatsächlich auf die Zuordnung des jeweiligen Tages aus,
// nicht mehr nur als Banner-Hinweis. Wochenweite Tausche gelten für alle 7 Tage, ein
// tagesgenauer Tausch überschreibt zusätzlich nur den einen betroffenen Tag.
export async function getEffectiveWeek(wocheStart: Date, familieId: string) {
  const basis = await ensureWeekAssignments(wocheStart, familieId);
  const definitionen = await prisma.dienstDefinition.findMany({
    where: { familieId },
    orderBy: [{ schichtNummer: "asc" }, { reihenfolge: "asc" }],
  });
  const personen = await prisma.person.findMany({ where: { familieId } });
  const personById = Object.fromEntries(personen.map((p) => [p.id, p]));

  const wochenweiteTausche = await prisma.dienstTausch.findMany({
    where: { wocheStart, familieId, aufgehoben: false, tag: null },
  });
  const tagesTausche = await prisma.dienstTausch.findMany({
    where: { wocheStart, familieId, aufgehoben: false, tag: { not: null } },
  });

  // 1. Basis + wochenweite Tausche -> gilt für die ganze Woche.
  // ABGEBEN: nur vonKind -> mitKind (einseitig, mitKind macht zusätzlich zu seinem eigenen Dienst).
  // TAUSCH: vonKind und mitKind tauschen ihre Dienste gegenseitig.
  const effektivWoche: Record<number, string> = {};
  for (const b of basis) effektivWoche[b.schichtNummer] = b.kindId;
  for (const t of wochenweiteTausche) {
    const vonSchicht = Object.entries(effektivWoche).find(([, kindId]) => kindId === t.vonKindId)?.[0];
    if (t.modus === "TAUSCH") {
      const mitSchicht = Object.entries(effektivWoche).find(([, kindId]) => kindId === t.mitKindId)?.[0];
      if (vonSchicht) effektivWoche[Number(vonSchicht)] = t.mitKindId;
      if (mitSchicht) effektivWoche[Number(mitSchicht)] = t.vonKindId;
    } else if (vonSchicht) {
      effektivWoche[Number(vonSchicht)] = t.mitKindId;
    }
  }

  // 2. Pro Tag zusätzlich tagesgenaue Tausche einrechnen — über alle Schichten hinweg
  //    berechnet, damit ein "TAUSCH" auch die Gegenseite an diesem einen Tag korrekt umdreht.
  const tage: Date[] = [];
  for (let i = 0; i < 7; i++) tage.push(addTage(wocheStart, i));

  const zuweisungProTag: Record<string, Record<number, string>> = {};
  for (const datum of tage) {
    const key = tagKey(datum);
    const zuweisung: Record<number, string> = { ...effektivWoche };
    for (const t of tagesTausche) {
      if (!t.tag || tagKey(t.tag) !== key) continue;
      const vonSchicht = Object.entries(zuweisung).find(([, kindId]) => kindId === t.vonKindId)?.[0];
      if (t.modus === "TAUSCH") {
        const mitSchicht = Object.entries(zuweisung).find(([, kindId]) => kindId === t.mitKindId)?.[0];
        if (vonSchicht) zuweisung[Number(vonSchicht)] = t.mitKindId;
        if (mitSchicht) zuweisung[Number(mitSchicht)] = t.vonKindId;
      } else if (vonSchicht) {
        zuweisung[Number(vonSchicht)] = t.mitKindId;
      }
    }
    zuweisungProTag[key] = zuweisung;
  }

  return [1, 2, 3].map((schicht) => {
    const tagesZuweisung = tage.map((datum) => {
      const kindId = zuweisungProTag[tagKey(datum)][schicht];
      return {
        datum: datum.toISOString(),
        kind: personById[kindId] ?? null,
        getauschtHeute: kindId !== effektivWoche[schicht],
      };
    });

    return {
      schichtNummer: schicht,
      kind: personById[effektivWoche[schicht]] ?? null,
      dienste: definitionen.filter((d) => d.schichtNummer === schicht),
      getauscht: basis.find((b) => b.schichtNummer === schicht)?.kindId !== effektivWoche[schicht],
      tage: tagesZuweisung,
    };
  });
}

// ---------- Bad-Reihenfolge morgens/abends ----------
// Wird aus der Basis-Schicht-Reihenfolge der Woche abgeleitet (unabhängig von Dienst-Tauschen):
// morgens = Schicht 1→2→3, abends = Umkehrung. Danach unabhängig tauschbar (BadZuweisung.kindId).

export async function ensureBadZuweisungen(wocheStart: Date, familieId: string) {
  const bestehende = await prisma.badZuweisung.findMany({ where: { wocheStart, familieId } });
  if (bestehende.length === 6) return bestehende;

  const basis = await ensureWeekAssignments(wocheStart, familieId);
  if (basis.length !== 3) return bestehende;

  const sortiert = [...basis].sort((a, b) => a.schichtNummer - b.schichtNummer);
  const morgensReihenfolge = sortiert.map((b) => b.kindId);
  const abendsReihenfolge = [...morgensReihenfolge].reverse();
  const dauerhaftMorgens = await holeDauerhafteZuordnungen("BAD_MORGENS", familieId);
  const dauerhaftAbends = await holeDauerhafteZuordnungen("BAD_ABENDS", familieId);

  const rows = [];
  for (let i = 0; i < 3; i++) {
    const m = await prisma.badZuweisung.upsert({
      where: { familieId_wocheStart_zeitpunkt_position: { familieId, wocheStart, zeitpunkt: "morgens", position: i + 1 } },
      update: {},
      create: { familieId, wocheStart, zeitpunkt: "morgens", position: i + 1, kindId: dauerhaftMorgens[i + 1] ?? morgensReihenfolge[i] },
    });
    const a = await prisma.badZuweisung.upsert({
      where: { familieId_wocheStart_zeitpunkt_position: { familieId, wocheStart, zeitpunkt: "abends", position: i + 1 } },
      update: {},
      create: { familieId, wocheStart, zeitpunkt: "abends", position: i + 1, kindId: dauerhaftAbends[i + 1] ?? abendsReihenfolge[i] },
    });
    rows.push(m, a);
  }
  return rows;
}

export async function getBadReihenfolge(wocheStart: Date, familieId: string) {
  const rows = await ensureBadZuweisungen(wocheStart, familieId);
  const personen = await prisma.person.findMany({ where: { familieId } });
  const personById = Object.fromEntries(personen.map((p) => [p.id, p]));

  const bauen = (zeitpunkt: "morgens" | "abends") =>
    rows
      .filter((r) => r.zeitpunkt === zeitpunkt)
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ position: r.position, kindId: r.kindId, kind: personById[r.kindId] ?? null }));

  return { morgens: bauen("morgens"), abends: bauen("abends") };
}
