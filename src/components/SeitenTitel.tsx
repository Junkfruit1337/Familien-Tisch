import type { ReactNode } from "react";
import { BEREICH_FARBEN, type Bereich } from "@/lib/bereichFarben";
import { BereichIcon } from "@/lib/bereichIcons";

// Seitenüberschrift mit Bereichs-Icon (Fix-Batch 32 Nachtrag, Redesign Fix-Batch 56, Fix-Batch
// 123/124: Icon-Stil siehe BereichIcon).
// Fix-Batch 123 (Florians Bug-Meldung: "das Symbol oben links... mit so einer komischen
// Hintergrundfarbe... sieht total schrecklich aus"): der vorherige farbige Kreis-Hintergrund
// ist bewusst weg — das Icon steht jetzt einfach größer und direkt in der Bereichsfarbe da,
// ohne Chip/Kachel drumherum.
export default function SeitenTitel({ bereich, children }: { bereich: Bereich; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <BereichIcon bereich={bereich} size={34} farbe={BEREICH_FARBEN[bereich]} />
      <h1 style={{ fontSize: "var(--font-xl)", margin: 0, fontWeight: 700 }}>{children}</h1>
    </div>
  );
}
