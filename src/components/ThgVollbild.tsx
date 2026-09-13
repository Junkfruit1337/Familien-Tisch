"use client";

import { useState } from "react";

// Fix-Batch 103 (Florians Bug-Meldung "Fenster braucht mehr Platz, sonst nutzt es keiner"):
// das THG-Fenster war innerhalb der normalen Seite (Karte/Akkordeon) eingeklemmt und dadurch
// abgeschnitten. Jetzt ein echtes Vollbild-Overlay (position: fixed, inset: 0 — über der
// ganzen App inkl. Kopfzeile/unterer Navigation), das per Knopf geöffnet und mit "✕" wieder
// geschlossen wird, damit die THG-App wirklich genauso viel Platz bekommt wie im eigenen
// Browser-Tab. `.thg-iframe-force-light` (globals.css) dreht die Farben nur dann um, wenn das
// Gerät tatsächlich im Dunkelmodus ist (das Einzige, was cross-origin technisch möglich ist).
const THG_URL = "https://app.thg-lu.de/";

export default function ThgVollbild({ hinweis }: { hinweis: string }) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button className="btn-secondary" onClick={() => setOffen(true)}>
        🏫 THG-App öffnen
      </button>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{hinweis}</p>
      {offen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: 8, background: "#eee", flexShrink: 0 }}>
            <button className="btn-secondary" onClick={() => setOffen(false)}>
              ✕ Schließen
            </button>
          </div>
          <iframe src={THG_URL} title="THG-App" className="thg-iframe-force-light" style={{ flex: 1, width: "100%", border: 0 }} />
        </div>
      )}
    </>
  );
}
