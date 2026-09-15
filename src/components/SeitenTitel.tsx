import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Seitenüberschrift mit Bereichs-Icon (Fix-Batch 32 Nachtrag, Redesign Fix-Batch 56, komplett
// überarbeitet Fix-Batch 123).
// Fix-Batch 123 (Florians Bug-Meldung: "das Symbol oben links... mit so einer komischen
// Hintergrundfarbe... sieht total schrecklich aus"): der vorherige farbige Kreis-Hintergrund
// ist bewusst weg — das Icon steht jetzt einfach größer und direkt in der Bereichsfarbe da,
// ohne Chip/Kachel drumherum.
export default function SeitenTitel({ icon: Icon, farbe, children }: { icon: LucideIcon; farbe: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Icon size={34} color={farbe} strokeWidth={2} style={{ flexShrink: 0 }} />
      <h1 style={{ fontSize: "var(--font-xl)", margin: 0, fontWeight: 700 }}>{children}</h1>
    </div>
  );
}
