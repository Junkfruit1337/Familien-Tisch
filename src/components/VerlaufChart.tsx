"use client";

import { useState } from "react";

// Fix-Batch 92 (Florians Wunsch): einfacher, abhängigkeitsfreier Linien-Chart für Verläufe
// (Taschengeld-Kontostand über Zeit, Notenverlauf pro Fach) — bewusst kein Chart-Paket
// eingebunden, um die App nicht unnötig aufzublähen; ein reines SVG-Polygon reicht für
// diese einfachen Verläufe völlig aus.
// Fix-Batch 116 (Florians Bug-Meldung, gilt für ALLE Graphen der App, da alle diese eine
// Komponente teilen): die Punkte waren nicht antippbar — "bringt nichts, wenn man die Werte
// nicht sehen kann". Jeder Punkt hat jetzt eine großzügige, unsichtbare Tipp-Fläche (der
// sichtbare Punkt allein ist auf dem Handy zu klein zum Treffen) und zeigt beim Antippen
// Label + Wert oberhalb des Charts an, der angetippte Punkt wird optisch hervorgehoben.
export type VerlaufPunkt = { label: string; wert: number };

export default function VerlaufChart({ punkte, farbe = "var(--accent)", einheit = "" }: { punkte: VerlaufPunkt[]; farbe?: string; einheit?: string }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<number | null>(null);

  if (punkte.length < 2) {
    return <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Noch zu wenige Werte für einen Verlauf.</p>;
  }

  const werte = punkte.map((p) => p.wert);
  const minWert = Math.min(...werte);
  const maxWert = Math.max(...werte);
  const spanne = maxWert - minWert || 1;
  const breite = 280;
  const hoehe = 90;
  const padX = 6;
  const padY = 14;

  const koordinaten = punkte.map((p, i) => {
    const x = padX + (i / (punkte.length - 1)) * (breite - padX * 2);
    const y = hoehe - padY - ((p.wert - minWert) / spanne) * (hoehe - padY * 2);
    return { x, y, punkt: p };
  });
  const linie = koordinaten.map((k) => `${k.x},${k.y}`).join(" ");
  const gewaehlt = ausgewaehlt !== null ? koordinaten[ausgewaehlt] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: farbe, textAlign: "center", minHeight: 16 }}>
        {gewaehlt ? `${gewaehlt.punkt.label}: ${gewaehlt.punkt.wert.toFixed(2)}${einheit}` : ""}
      </div>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} style={{ width: "100%", maxWidth: breite, height: hoehe, overflow: "visible" }}>
        <polyline points={linie} fill="none" stroke={farbe} strokeWidth={2} />
        {koordinaten.map((k, i) => (
          <g
            key={i}
            onClick={() => setAusgewaehlt((prev) => (prev === i ? null : i))}
            style={{ cursor: "pointer" }}
          >
            {/* Großzügige, unsichtbare Tipp-Fläche — der sichtbare Punkt allein ist zu klein
                zum verlässlichen Antippen auf dem Handy. */}
            <circle cx={k.x} cy={k.y} r={12} fill="transparent" />
            <circle
              cx={k.x}
              cy={k.y}
              r={ausgewaehlt === i ? 5.5 : 3}
              fill={farbe}
              stroke={ausgewaehlt === i ? "var(--surface)" : "none"}
              strokeWidth={ausgewaehlt === i ? 1.5 : 0}
            />
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
        <span>
          {punkte[0].label}: {punkte[0].wert.toFixed(2)}
          {einheit}
        </span>
        <span>
          {punkte[punkte.length - 1].label}: {punkte[punkte.length - 1].wert.toFixed(2)}
          {einheit}
        </span>
      </div>
    </div>
  );
}
