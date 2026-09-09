import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FAMILIE = [
  { name: "Flo", rolle: "ELTERN" as const, farbe: "#a97155" },
  { name: "Tugce", rolle: "ELTERN" as const, farbe: "#8a9a6e" },
  { name: "Lina", rolle: "KIND" as const, farbe: "#c98a68" },
  { name: "Emil", rolle: "KIND" as const, farbe: "#6e8fa9" },
  { name: "Emma", rolle: "KIND" as const, farbe: "#b58fc9" },
  { name: "Ayla", rolle: "KIND_OHNE_ZUGANG" as const, farbe: "#d9b25c" },
];

const DIENSTE = [
  { schichtNummer: 1, reihenfolge: 1, bezeichnung: "Küchendienst", beschreibung: "Küche nach dem Essen aufräumen" },
  { schichtNummer: 1, reihenfolge: 2, bezeichnung: "Tisch decken", beschreibung: "" },
  { schichtNummer: 1, reihenfolge: 3, bezeichnung: "Mülleimer leeren", beschreibung: "" },
  { schichtNummer: 2, reihenfolge: 1, bezeichnung: "Badputzdienst", beschreibung: "" },
  { schichtNummer: 2, reihenfolge: 2, bezeichnung: "Staubsaugen", beschreibung: "" },
  { schichtNummer: 2, reihenfolge: 3, bezeichnung: "Wäsche zusammenlegen", beschreibung: "" },
  { schichtNummer: 3, reihenfolge: 1, bezeichnung: "Tiere versorgen", beschreibung: "" },
  { schichtNummer: 3, reihenfolge: 2, bezeichnung: "Pflanzen gießen", beschreibung: "" },
  { schichtNummer: 3, reihenfolge: 3, bezeichnung: "Schuhe/Flur aufräumen", beschreibung: "" },
];

const KATEGORIEN = ["Obst & Gemüse", "Milchprodukte", "Fleisch & Fisch", "Backwaren", "Tiefkühl", "Getränke", "Drogerie", "Sonstiges"];

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

  for (const d of DIENSTE) {
    const existing = await prisma.dienstDefinition.findFirst({ where: { schichtNummer: d.schichtNummer, reihenfolge: d.reihenfolge } });
    if (!existing) await prisma.dienstDefinition.create({ data: d });
  }

  for (let i = 0; i < KATEGORIEN.length; i++) {
    await prisma.einkaufsKategorie.upsert({
      where: { name: KATEGORIEN[i] },
      update: {},
      create: { name: KATEGORIEN[i], reihenfolge: i },
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
