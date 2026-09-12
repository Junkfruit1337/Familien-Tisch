"use client";

import { useEffect, useState } from "react";
import { DESIGN_THEMES, DESIGN_KEY, type DesignThemeId } from "@/lib/designThemes";

// Fix-Batch 70 (Florians Wunsch): 10 bunte Design-Vorlagen, jede Person wählt für sich selbst
// im eigenen Browser — genau wie der Hell/Dunkel-Schalter rein lokal gespeichert (kein Sync
// über die Familie, keine Datenbank nötig). Für Kinder UND Eltern gleichermaßen sichtbar.
export default function DesignAuswahl() {
  const [aktuell, setAktuell] = useState<DesignThemeId>("standard");

  useEffect(() => {
    try {
      const gespeichert = localStorage.getItem(DESIGN_KEY) as DesignThemeId | null;
      if (gespeichert) setAktuell(gespeichert);
    } catch {}
  }, []);

  function waehlen(id: DesignThemeId) {
    setAktuell(id);
    document.documentElement.setAttribute("data-design", id);
    try {
      localStorage.setItem(DESIGN_KEY, id);
    } catch {}
  }

  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>🎨 Design-Vorlage</summary>
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
          Nur für dieses Gerät — jede Person kann ihre eigene Lieblingsfarbe wählen.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 8 }}>
          {DESIGN_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => waehlen(t.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "8px 4px",
                borderRadius: "var(--radius)",
                border: t.id === aktuell ? `2px solid ${t.vorschauFarbe}` : "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  background: t.vorschauFarbe,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                {t.id === aktuell ? "✓" : ""}
              </span>
              <span style={{ fontSize: 11, textAlign: "center", color: "var(--text)" }}>
                {t.emoji} {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
