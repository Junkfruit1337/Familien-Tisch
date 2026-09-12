"use client";

import { useEffect, useState } from "react";
import { DESIGN_THEMES, DESIGN_KEY, type DesignThemeId } from "@/lib/designThemes";

// Fix-Batch 72: reine Vorschau-Werte fürs Auswahl-Menü selbst (Ecken/Schatten der Kachel-
// Buttons hier), damit man den Stil-Unterschied schon vor dem Antippen sieht — unabhängig
// von den echten CSS-Overrides in globals.css, die erst NACH der Auswahl app-weit greifen.
const VORSCHAU_STIL: Record<DesignThemeId, { radius: number; schatten: string }> = {
  standard: { radius: 14, schatten: "0 1px 2px rgba(58,51,42,0.12)" },
  ozean: { radius: 18, schatten: "0 3px 8px rgba(27,138,138,0.18)" },
  sonnenuntergang: { radius: 18, schatten: "0 3px 8px rgba(226,102,45,0.2)" },
  wald: { radius: 10, schatten: "0 1px 3px rgba(47,125,79,0.18)" },
  beere: { radius: 24, schatten: "0 4px 10px rgba(168,62,120,0.22)" },
  lavendel: { radius: 18, schatten: "0 2px 6px rgba(123,94,167,0.14)" },
  feuer: { radius: 6, schatten: "0 2px 4px rgba(201,58,58,0.28)" },
  himmel: { radius: 20, schatten: "0 2px 6px rgba(47,143,214,0.12)" },
  honig: { radius: 14, schatten: "0 2px 6px rgba(214,158,31,0.22)" },
  pastell: { radius: 24, schatten: "0 3px 8px rgba(231,143,179,0.18)" },
};

// Fix-Batch 70/72 (Florians Wunsch, in Fix-Batch 72 präzisiert: "nicht einfach nur eine
// Farbe, sondern wirklich ein anderes Design") — 10 Design-Vorlagen mit eigener Farbe UND
// eigener Stil-Persönlichkeit (Ecken/Schatten), jede Person wählt für sich selbst im eigenen
// Browser (wie der Hell/Dunkel-Schalter, kein Sync über die Familie). Für Kinder UND Eltern
// gleichermaßen sichtbar.
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
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>
          Nur für dieses Gerät — jede Person kann ihren eigenen Stil wählen. Farbe UND Optik (Ecken, Schatten) ändern sich.
        </p>
        {DESIGN_THEMES.map((t) => {
          const stil = VORSCHAU_STIL[t.id];
          const aktiv = t.id === aktuell;
          return (
            <button
              key={t.id}
              onClick={() => waehlen(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: stil.radius,
                border: aktiv ? `2px solid ${t.vorschauFarbe}` : "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: stil.schatten,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: Math.min(stil.radius, 15),
                  background: t.vorschauFarbe,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  color: "#fff",
                }}
              >
                {aktiv ? "✓" : t.emoji}
              </span>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {t.emoji} {t.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.stil}</span>
              </span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
