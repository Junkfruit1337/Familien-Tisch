"use client";

import { useEffect, useState } from "react";

// Fix-Batch 103 (Florians Bug-Meldung "Fenster braucht mehr Platz, sonst nutzt es keiner"):
// echtes Vollbild-Overlay statt eines eingeklemmten, abgeschnittenen Fensters.
// Fix-Batch 104 (Florians Bug-Meldung "vollkommen verkackt" + Feedback): der Invertierungs-
// Filter aus Fix-Batch 103 zum Erzwingen von hell im Dunkelmodus machte Teile der THG-App
// unleserlich statt sie zu verbessern — komplett zurückgenommen (kein Filter mehr). Stattdessen
// Florians eigener, einfacherer Wunsch umgesetzt: die Kopfzeile von Familientisch (mit dem
// Hell/Dunkel-Umschalter) bleibt beim Öffnen sichtbar — dafür wird ihre tatsächliche Höhe live
// gemessen (`document.querySelector("header")`), damit das Overlay exakt darunter beginnt, egal
// wie hoch die Kopfzeile auf dem jeweiligen Gerät tatsächlich ausfällt.
// Wichtig, ehrlich zu sagen: der Hell/Dunkel-Umschalter in unserer eigenen Kopfzeile ändert nur
// das Erscheinungsbild von Familientisch selbst — die THG-App (fremde Seite in einem iframe)
// richtet sich technisch nachweislich nach dem echten Dunkelmodus des Geräts/Browsers, nicht
// nach Familientischs eigenem Schalter. Bleibt sie nach dem Umschalten weiterhin dunkel, hilft
// nur der echte Dunkelmodus des Telefons bzw. der Browser-App selbst.
// Fix-Batch 106 (Florians Wunsch): auf der Schule-Seite nimmt der ganze Block (Icon, Titel,
// Beschreibung, Button, Warnhinweis) zu viel Platz oben ein — `compact` zeigt stattdessen nur
// einen kleinen "THG"-Button (z. B. neben dem Seitentitel), der Hinweistext wandert dafür mit
// in die Kopfleiste des Vollbild-Overlays selbst, statt auf der Seite zu stehen.
const THG_URL = "https://app.thg-lu.de/";

export default function ThgVollbild({ hinweis, compact }: { hinweis: string; compact?: boolean }) {
  const [offen, setOffen] = useState(false);
  const [headerHoehe, setHeaderHoehe] = useState(64);

  useEffect(() => {
    if (!offen) return;
    const header = document.querySelector("header");
    if (header) setHeaderHoehe(header.getBoundingClientRect().height);
  }, [offen]);

  return (
    <>
      <button
        className="btn-secondary"
        style={compact ? { fontSize: 13, padding: "8px 12px", flexShrink: 0 } : undefined}
        onClick={() => setOffen(true)}
      >
        {compact ? "🏫 THG" : "🏫 THG-App öffnen"}
      </button>
      {!compact && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{hinweis}</p>}
      {offen && (
        <div style={{ position: "fixed", top: headerHoehe, left: 0, right: 0, bottom: 0, zIndex: 20, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 8, background: "#eee", flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{hinweis}</p>
            <button className="btn-secondary" style={{ flexShrink: 0 }} onClick={() => setOffen(false)}>
              ✕ Schließen
            </button>
          </div>
          <iframe src={THG_URL} title="THG-App" style={{ flex: 1, width: "100%", border: 0 }} />
        </div>
      )}
    </>
  );
}
