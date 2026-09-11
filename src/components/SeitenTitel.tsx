import type { ReactNode } from "react";

// Seitenüberschrift mit farbigem Icon-Chip je Bereich (Fix-Batch 32 Nachtrag) — macht auf
// den ersten Blick erkennbar, in welchem Bereich man sich befindet, statt dass jede Seite
// nur mit demselben schwarzen Text-Header gleich aussieht.
export default function SeitenTitel({ icon, farbe, children }: { icon: string; farbe: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: farbe,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <h1 style={{ fontSize: 22, margin: 0 }}>{children}</h1>
    </div>
  );
}
