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
async function holeDauerhafteZuordnungen(art: "DIENST" | "BAD_MORGENS" | "BAD_ABENDS"): Promise<Record<number, string>> {
  const rows = await prisma.dauerhafteZuordnung.findMany({ where: { art } });
  return Object.fromEntries(rows.map((r) => [r.slot, r.kindId]));
}

export async function ensureWeekAssignments(wocheStart: Date) {
  const existing = await prisma.dienstZuweisung.findMany({ where: { wocheStart } });
  if (existing.length === 3) return existing;

  const kinder = await prisma.person.findMany({
    where: { name: { in: ROTATIONS_KINDER_NAMEN } },
  });
  // Fix-Batch 150 (Florians Entscheidung nach Audit-Fund: "Die anderen zwei rotieren allein
  // weiter"): vorher brach die GESAMTE Rotation ab, sobald eins der drei Kinder deaktiviert war
  // (`kinder.length !== 3`) — auch für die verbleibenden aktiven. Jetzt rotieren die aktiven
  // Kinder (1, 2 oder 3) untereinander durch alle 3 Schichten; bei z. B. 2 aktiven Kindern
  // übernimmt in einer Woche eins davon zwei Schichten, in der nächsten Woche dreht sich das
  // (dieselbe Formel wie bisher, nur mit `n` statt fest `3` — für n=3 exakt identisch zum
  // bisherigen, bereits als korrekt bestätigten Verhalten aus Fix-Batch 91).
  const aktiveKinder = ROTATIONS_KINDER_NAMEN.map((name) => kinder.find((k) => k.name === name && k.aktiv)).filter(
    (k): k is NonNullable<typeof k> => !!k
  );
  const n = aktiveKinder.length;
  if (n === 0) return existing; // Personen noch nicht angelegt oder alle deaktiviert

  const offset = ((weeksSinceAnchor(wocheStart) % n) + n) % n;
  const dauerhaft = await holeDauerhafteZuordnungen("DIENST");
  // Fix-Batch 150 (Audit-Fund, Zweitprüfung): `dauerhaft[schicht]` kam bisher ungefiltert zum
  // Zug und gewann immer gegen die neu aktiv-gefilterte Rotation — ein VOR seiner Deaktivierung
  // dauerhaft zugeordnetes Kind erschien trotz Deaktivierung weiter im Dienstplan. Eine
  // dauerhafte Zuordnung auf ein inzwischen inaktives Kind wird jetzt ignoriert (fällt auf die
  // normale Rotation unter den aktiven Kindern zurück).
  const aktiveIds = new Set(aktiveKinder.map((k) => k.id));

  const created = [];
  for (let schicht = 1; schicht <= 3; schicht++) {
    // Fix-Batch 91 (Florians Bug-Meldung): pro Person rückte die Schicht-Nummer bisher jede
    // Woche eine Nummer NACH UNTEN (3→2→1→3...), obwohl die Kinder seit Monaten in die andere
    // Richtung rotieren (1→2→3→1...). Die alte Formel ((offset + schicht - 1) % 3) ergab genau
    // die falsche Richtung; ((schicht - offset) % 3) ist an derselben Referenzwoche verankert,
    // dreht die Richtung aber um. Bereits erzeugte künftige Wochen werden dazu einmalig in
    // prisma/seed.ts korrigiert.
    const kindIndex = (((schicht - offset) % n) + n) % n;
    const berechnetesKindId = aktiveKinder[kindIndex]?.id;
    const dauerhaftesKindId = dauerhaft[schicht] && aktiveIds.has(dauerhaft[schicht]) ? dauerhaft[schicht] : undefined;
    const kindId = dauerhaftesKindId ?? berechnetesKindId;
    if (!kindId) continue;
    const row = await prisma.dienstZuweisung.upsert({
      where: { wocheStart_schichtNummer: { wocheStart, schichtNummer: schicht } },
      update: {},
      create: { wocheStart, schichtNummer: schicht, kindId },
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
export async function getEffectiveWeek(wocheStart: Date) {
  const basis = await ensureWeekAssignments(wocheStart);
  const definitionen = await prisma.dienstDefinition.findMany({
    orderBy: [{ schichtNummer: "asc" }, { reihenfolge: "asc" }],
  });
  const personen = await prisma.person.findMany();
  const personById = Object.fromEntries(personen.map((p) => [p.id, p]));

  const wochenweiteTausche = await prisma.dienstTausch.findMany({
    where: { wocheStart, aufgehoben: false, tag: null },
  });
  const tagesTausche = await prisma.dienstTausch.findMany({
    where: { wocheStart, aufgehoben: false, tag: { not: null } },
  });

  // Fix-Batch 150 (Audit-Fund, Zweitprüfung): seit ein Kind bei aktiven Kindern < 3 mehrere
  // Schichten gleichzeitig innehaben kann (siehe ensureWeekAssignments), reichte ein einzelnes
  // `.find()` nicht mehr — es griff immer nur die ERSTE passende Schicht eines Kindes, eine
  // zweite Schicht desselben Kindes blieb von Tausch/Abgabe unberührt. `alleSchichtenVon` findet
  // jetzt ALLE Schichten, die aktuell bei diesem Kind liegen.
  const alleSchichtenVon = (zuweisung: Record<number, string>, kindId: string): number[] =>
    Object.entries(zuweisung)
      .filter(([, kid]) => kid === kindId)
      .map(([schicht]) => Number(schicht));

  // 1. Basis + wochenweite Tausche -> gilt für die ganze Woche.
  // ABGEBEN: nur vonKind -> mitKind (einseitig, mitKind macht zusätzlich zu seinem eigenen Dienst).
  // TAUSCH: vonKind und mitKind tauschen ihre Dienste gegenseitig.
  const effektivWoche: Record<number, string> = {};
  for (const b of basis) effektivWoche[b.schichtNummer] = b.kindId;
  for (const t of wochenweiteTausche) {
    const vonSchichten = alleSchichtenVon(effektivWoche, t.vonKindId);
    if (t.modus === "TAUSCH") {
      const mitSchichten = alleSchichtenVon(effektivWoche, t.mitKindId);
      for (const s of vonSchichten) effektivWoche[s] = t.mitKindId;
      for (const s of mitSchichten) effektivWoche[s] = t.vonKindId;
    } else {
      for (const s of vonSchichten) effektivWoche[s] = t.mitKindId;
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
      const vonSchichten = alleSchichtenVon(zuweisung, t.vonKindId);
      if (t.modus === "TAUSCH") {
        const mitSchichten = alleSchichtenVon(zuweisung, t.mitKindId);
        for (const s of vonSchichten) zuweisung[s] = t.mitKindId;
        for (const s of mitSchichten) zuweisung[s] = t.vonKindId;
      } else {
        for (const s of vonSchichten) zuweisung[s] = t.mitKindId;
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

export async function ensureBadZuweisungen(wocheStart: Date) {
  const bestehende = await prisma.badZuweisung.findMany({ where: { wocheStart } });
  if (bestehende.length === 6) return bestehende;

  const basis = await ensureWeekAssignments(wocheStart);
  if (basis.length !== 3) return bestehende;

  const sortiert = [...basis].sort((a, b) => a.schichtNummer - b.schichtNummer);
  const morgensReihenfolge = sortiert.map((b) => b.kindId);
  const abendsReihenfolge = [...morgensReihenfolge].reverse();
  const dauerhaftMorgens = await holeDauerhafteZuordnungen("BAD_MORGENS");
  const dauerhaftAbends = await holeDauerhafteZuordnungen("BAD_ABENDS");
  // Fix-Batch 151 (Audit-Fund, Zweitprüfung): derselbe Bug wie bei DIENST (Fix-Batch 150) —
  // eine dauerhafte Bad-Positions-Zuordnung auf ein inzwischen deaktiviertes Kind gewann bisher
  // weiter gegen die aktive Rotation. Dieselbe aktiv-Prüfung wie in ensureWeekAssignments.
  const aktiveKinderFuerBad = await prisma.person.findMany({ where: { name: { in: ROTATIONS_KINDER_NAMEN }, aktiv: true } });
  const aktiveIdsFuerBad = new Set(aktiveKinderFuerBad.map((k) => k.id));

  const rows = [];
  for (let i = 0; i < 3; i++) {
    const dauerhaftMorgensKindId = dauerhaftMorgens[i + 1] && aktiveIdsFuerBad.has(dauerhaftMorgens[i + 1]) ? dauerhaftMorgens[i + 1] : undefined;
    const dauerhaftAbendsKindId = dauerhaftAbends[i + 1] && aktiveIdsFuerBad.has(dauerhaftAbends[i + 1]) ? dauerhaftAbends[i + 1] : undefined;
    const m = await prisma.badZuweisung.upsert({
      where: { wocheStart_zeitpunkt_position: { wocheStart, zeitpunkt: "morgens", position: i + 1 } },
      update: {},
      create: { wocheStart, zeitpunkt: "morgens", position: i + 1, kindId: dauerhaftMorgensKindId ?? morgensReihenfolge[i] },
    });
    const a = await prisma.badZuweisung.upsert({
      where: { wocheStart_zeitpunkt_position: { wocheStart, zeitpunkt: "abends", position: i + 1 } },
      update: {},
      create: { wocheStart, zeitpunkt: "abends", position: i + 1, kindId: dauerhaftAbendsKindId ?? abendsReihenfolge[i] },
    });
    rows.push(m, a);
  }
  return rows;
}

export async function getBadReihenfolge(wocheStart: Date) {
  const rows = await ensureBadZuweisungen(wocheStart);
  const personen = await prisma.person.findMany();
  const personById = Object.fromEntries(personen.map((p) => [p.id, p]));

  const bauen = (zeitpunkt: "morgens" | "abends") =>
    rows
      .filter((r) => r.zeitpunkt === zeitpunkt)
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ position: r.position, kindId: r.kindId, kind: personById[r.kindId] ?? null }));

  return { morgens: bauen("morgens"), abends: bauen("abends") };
}
