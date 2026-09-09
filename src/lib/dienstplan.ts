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

export async function ensureWeekAssignments(wocheStart: Date) {
  const existing = await prisma.dienstZuweisung.findMany({ where: { wocheStart } });
  if (existing.length === 3) return existing;

  const kinder = await prisma.person.findMany({
    where: { name: { in: ROTATIONS_KINDER_NAMEN } },
  });
  if (kinder.length !== 3) return existing; // Personen noch nicht angelegt

  const byName = Object.fromEntries(kinder.map((k) => [k.name, k]));
  const offset = ((weeksSinceAnchor(wocheStart) % 3) + 3) % 3;

  const created = [];
  for (let schicht = 1; schicht <= 3; schicht++) {
    const kindIndex = (offset + schicht - 1) % 3;
    const kind = byName[ROTATIONS_KINDER_NAMEN[kindIndex]];
    if (!kind) continue;
    const row = await prisma.dienstZuweisung.upsert({
      where: { wocheStart_schichtNummer: { wocheStart, schichtNummer: schicht } },
      update: {},
      create: { wocheStart, schichtNummer: schicht, kindId: kind.id },
    });
    created.push(row);
  }
  return created;
}

export async function getEffectiveWeek(wocheStart: Date) {
  const basis = await ensureWeekAssignments(wocheStart);
  const definitionen = await prisma.dienstDefinition.findMany({
    orderBy: [{ schichtNummer: "asc" }, { reihenfolge: "asc" }],
  });
  const personen = await prisma.person.findMany();
  const personById = Object.fromEntries(personen.map((p) => [p.id, p]));

  const tausche = await prisma.dienstTausch.findMany({
    where: { wocheStart, aufgehoben: false, tag: null },
  });

  const effektiv: Record<number, string> = {};
  for (const b of basis) effektiv[b.schichtNummer] = b.kindId;

  for (const t of tausche) {
    const schicht = Object.entries(effektiv).find(([, kindId]) => kindId === t.vonKindId)?.[0];
    if (schicht) effektiv[Number(schicht)] = t.mitKindId;
  }

  return [1, 2, 3].map((schicht) => ({
    schichtNummer: schicht,
    kind: personById[effektiv[schicht]] ?? null,
    dienste: definitionen.filter((d) => d.schichtNummer === schicht),
    getauscht: basis.find((b) => b.schichtNummer === schicht)?.kindId !== effektiv[schicht],
  }));
}
