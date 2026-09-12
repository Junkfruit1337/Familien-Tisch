"use client";

import { useState, useTransition } from "react";
import { setNotenGewichtung } from "@/app/(app)/schule/actions";

const ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Arbeit",
  HAUSAUFGABEN_KONTROLLE: "HÜ",
  EPOCHALNOTE: "Epo",
};

type Gewichtung = { fachId: string; fachName: string; gewichtungen: { art: string; gewichtung: number }[] };

// In die Einstellungen verschoben (Fahrplan §3, Batch 6 "Einstellungen thematisch
// gruppieren") — vorher unter Schule je Kind, jetzt gebündelt an einer Stelle.
export default function NotengewichtungSektion({
  kindId,
  kindName,
  gewichtung,
}: {
  kindId: string;
  kindName: string;
  gewichtung: Gewichtung[];
}) {
  const [pending, startTransition] = useTransition();
  const [werte, setWerte] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    gewichtung.forEach((g) => g.gewichtungen.forEach((x) => (init[`${g.fachId}_${x.art}`] = x.gewichtung)));
    return init;
  });

  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>⚖️ Notengewichtung ({kindName})</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Legt fest, wie stark eine Note dieser Art in den Fach-Durchschnitt einfließt (z. B. Arbeit = 2, HÜ = 1).
          Eine Änderung wirkt sich sofort auf alle Noten des laufenden Schuljahres aus (auch bereits eingetragene) — ältere Schuljahre bleiben unverändert.
        </p>
        {gewichtung.map((g) => (
          <div key={g.fachId} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <strong style={{ fontSize: 14 }}>{g.fachName}</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {g.gewichtungen.map((x) => {
                const key = `${g.fachId}_${x.art}`;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, flex: 1 }}>{ART_LABEL[x.art]}</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      style={{ width: 70 }}
                      value={werte[key] ?? 1}
                      onChange={(e) => setWerte((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      onBlur={() => startTransition(() => setNotenGewichtung(kindId, g.fachId, x.art, werte[key] ?? 1))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {gewichtung.length === 0 && <p style={{ color: "var(--text-muted)", margin: 0 }}>Noch keine Fächer angelegt.</p>}
      </div>
    </details>
  );
}
