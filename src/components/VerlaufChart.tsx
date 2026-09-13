"use client";

// Fix-Batch 92 (Florians Wunsch): einfacher, abhängigkeitsfreier Linien-Chart für Verläufe
// (Taschengeld-Kontostand über Zeit, Notenverlauf pro Fach) — bewusst kein Chart-Paket
// eingebunden, um die App nicht unnötig aufzublähen; ein reines SVG-Polygon reicht für
// diese einfachen Verläufe völlig aus.
export type VerlaufPunkt = { label: string; wert: number };

export default function VerlaufChart({ punkte, farbe = "var(--accent)", einheit = "" }: { punkte: VerlaufPunkt[]; farbe?: string; einheit?: string }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} style={{ width: "100%", maxWidth: breite, height: hoehe }}>
        <polyline points={linie} fill="none" stroke={farbe} strokeWidth={2} />
        {koordinaten.map((k, i) => (
          <circle key={i} cx={k.x} cy={k.y} r={3} fill={farbe} />
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
