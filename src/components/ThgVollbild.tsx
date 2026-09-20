"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/uiIcons";

// Fix-Batch 103 (Florians Bug-Meldung "Fenster braucht mehr Platz, sonst nutzt es keiner"):
// echtes Vollbild-Overlay statt eines eingeklemmten, abgeschnittenen Fensters.
// Fix-Batch 104: die Kopfzeile von Familientisch (mit dem Hell/Dunkel-Umschalter) bleibt beim
// Öffnen sichtbar — dafür wird ihre tatsächliche Höhe live gemessen
// (`document.querySelector("header")`), damit das Overlay exakt darunter beginnt, egal wie
// hoch die Kopfzeile auf dem jeweiligen Gerät tatsächlich ausfällt.
// Fix-Batch 106: `compact` zeigt nur einen kleinen "THG"-Button statt des ganzen Blocks.
// Fix-Batch 107 (Florians Feedback: "funktioniert super", Warnhinweis wird nicht mehr
// gebraucht): der Hinweistext (gemeinsame Anmeldung/Hell-Modus) komplett entfernt — beides
// hat sich in der Praxis als kein Problem mehr erwiesen.
// Fix-Batch 111 hatte die feste hell/#fff-Optik hier fälschlich als generische Dunkelmodus-
// Inkonsistenz "korrigiert" (auf Theme-Variablen umgestellt) — das war falsch: die THG-App
// selbst bleibt laut Fix-Batch 103/104 ausdrücklich IMMER hell, unabhängig vom Familientisch-
// Theme, sonst wird sie bei aktivem Dunkelmodus teils unlesbar. Bewusst wieder zurück auf
// feste helle Farben statt Theme-Variablen — hier absichtlich, keine Nachlässigkeit.
// Fix-Batch 137 (Multi-Tenant, Florians Wunsch): die URL war bisher hier fest hinterlegt und
// damit fix für ALLE Familien sichtbar — jetzt pro Familie über Familie.thgUrl einstellbar
// (siehe einstellungen/actions.ts). Ohne gesetzte URL erscheint der Button gar nicht erst.
export default function ThgVollbild({ compact, url }: { compact?: boolean; url: string | null }) {
  const [offen, setOffen] = useState(false);
  const [headerHoehe, setHeaderHoehe] = useState(64);

  useEffect(() => {
    if (!offen) return;
    const header = document.querySelector("header");
    if (header) setHeaderHoehe(header.getBoundingClientRect().height);
  }, [offen]);

  if (!url) return null;

  return (
    <>
      <button
        className="btn-secondary"
        style={compact ? { fontSize: 13, padding: "8px 12px", flexShrink: 0 } : undefined}
        onClick={() => setOffen(true)}
      >
        {compact ? (
          <>
            <Icon id="school" /> THG
          </>
        ) : (
          <>
            <Icon id="school" /> THG-App öffnen
          </>
        )}
      </button>
      {offen && (
        <div style={{ position: "fixed", top: headerHoehe, left: 0, right: 0, bottom: 0, zIndex: 20, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: 8, background: "#eee", flexShrink: 0 }}>
            <button className="btn-secondary" onClick={() => setOffen(false)}>
              <Icon id="close" /> Schließen
            </button>
          </div>
          <iframe src={url} title="THG-App" style={{ flex: 1, width: "100%", border: 0 }} />
        </div>
      )}
    </>
  );
}
