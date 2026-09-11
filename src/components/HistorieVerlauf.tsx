"use client";

import { useState, useTransition } from "react";
import { listEntityHistorie } from "@/lib/historieActions";

type Eintrag = {
  id: string;
  zeitpunkt: string;
  personName: string;
  aktion: string;
  feld: string | null;
  alterWert: string | null;
  neuerWert: string | null;
};

// Aufklappbarer Änderungsverlauf für einen einzelnen Eintrag (Termin/Note/Aufgabe/
// Dienst-Tausch/Einkaufs-Wunsch), nur für Eltern sichtbar (Frage 44).
export default function HistorieVerlauf({ entityTyp, entityId }: { entityTyp: string; entityId: string }) {
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <details
      style={{ marginTop: 4 }}
      onToggle={(e) => {
        const istOffen = (e.target as HTMLDetailsElement).open;
        if (istOffen && eintraege === null) {
          startTransition(async () => {
            const daten = await listEntityHistorie(entityTyp as any, entityId);
            setEintraege(daten);
          });
        }
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Änderungshistorie</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {pending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Lädt …</span>}
        {eintraege?.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Keine Änderungen erfasst.</span>}
        {eintraege?.map((e) => (
          <div key={e.id} style={{ fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>
              {new Date(e.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>{" "}
            — <strong>{e.personName}</strong>: {e.aktion}
            {e.feld && ` (${e.feld}${e.alterWert ? `: „${e.alterWert}"` : ""}${e.neuerWert ? ` → „${e.neuerWert}"` : ""})`}
          </div>
        ))}
      </div>
    </details>
  );
}
