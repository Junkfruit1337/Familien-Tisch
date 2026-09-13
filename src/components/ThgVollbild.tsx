"use client";

import { useEffect, useState } from "react";

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
const THG_URL = "https://app.thg-lu.de/";

export default function ThgVollbild({ compact }: { compact?: boolean }) {
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
      {offen && (
        <div style={{ position: "fixed", top: headerHoehe, left: 0, right: 0, bottom: 0, zIndex: 20, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: 8, background: "#eee", flexShrink: 0 }}>
            <button className="btn-secondary" onClick={() => setOffen(false)}>
              ✕ Schließen
            </button>
          </div>
          <iframe src={THG_URL} title="THG-App" style={{ flex: 1, width: "100%", border: 0 }} />
        </div>
      )}
    </>
  );
}
