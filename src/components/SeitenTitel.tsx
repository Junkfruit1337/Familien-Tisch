import type { ReactNode } from "react";

// Seitenüberschrift mit farbigem Icon-Chip je Bereich (Fix-Batch 32 Nachtrag, Redesign
// Fix-Batch 56: weicher Schatten statt Flatdesign, passend zum überarbeiteten Kartenbild)
// — macht auf den ersten Blick erkennbar, in welchem Bereich man sich befindet, statt dass
// jede Seite nur mit demselben schwarzen Text-Header gleich aussieht.
export default function SeitenTitel({ icon, farbe, children }: { icon: string; farbe: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: "var(--radius)",
          background: farbe,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 21,
          flexShrink: 0,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {icon}
      </span>
      <h1 style={{ fontSize: "var(--font-xl)", margin: 0, fontWeight: 700 }}>{children}</h1>
    </div>
  );
}
