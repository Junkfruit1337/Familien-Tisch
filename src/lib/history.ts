import "server-only";
import { prisma } from "./prisma";
import type { EntityTyp } from "@prisma/client";

export async function logAenderung(params: {
  entityTyp: EntityTyp;
  entityId: string;
  aktion: string;
  feld?: string;
  alterWert?: string | null;
  neuerWert?: string | null;
  geaendertVonId: string;
}) {
  await prisma.aenderungsLog.create({
    data: {
      entityTyp: params.entityTyp,
      entityId: params.entityId,
      aktion: params.aktion,
      feld: params.feld,
      alterWert: params.alterWert ?? undefined,
      neuerWert: params.neuerWert ?? undefined,
      geaendertVonId: params.geaendertVonId,
    },
  });
}

export async function getHistorie(entityTyp: EntityTyp, entityId: string) {
  return prisma.aenderungsLog.findMany({
    where: { entityTyp, entityId },
    include: { geaendertVon: true },
    orderBy: { zeitpunkt: "desc" },
  });
}
