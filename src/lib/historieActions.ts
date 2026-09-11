"use server";

import { requireParent } from "./auth";
import { getHistorie } from "./history";
import type { EntityTyp } from "@prisma/client";

// Wiederverwendbare Änderungshistorie je Einzeleintrag (Frage 44) — Backend (getHistorie)
// war bereits fertig, wurde bisher aber nirgends außer dem globalen Feed im Dashboard
// aufgerufen. Sichtbar nur für Eltern.
export async function listEntityHistorie(entityTyp: EntityTyp, entityId: string) {
  await requireParent();
  const eintraege = await getHistorie(entityTyp, entityId);
  return eintraege.map((e) => ({
    id: e.id,
    zeitpunkt: e.zeitpunkt.toISOString(),
    personName: e.geaendertVon.name,
    aktion: e.aktion,
    feld: e.feld,
    alterWert: e.alterWert,
    neuerWert: e.neuerWert,
  }));
}
