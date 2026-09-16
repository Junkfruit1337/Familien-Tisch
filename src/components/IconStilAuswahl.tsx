"use client";

import { useEffect, useState } from "react";
import { ICON_STIL_KEY, anwendenIconStil, type IconStil } from "@/lib/iconStil";
import { BEREICH_ICONS_BUNT, BEREICH_ICONS_MINIMAL } from "@/lib/bereichIcons";
import { Icon } from "@/lib/uiIcons";

// Fix-Batch 124 (Florians Wunsch): "man könnte doch sowas in den Designvorlagen ändern... dass
// sich das durch die ganze App zieht" — Icon-Stil (bunte Emoji vs. schlichte Symbole) als
// eigene Wahl wie Hell/Dunkel und Design-Vorlage, ebenfalls nur für dieses Gerät gespeichert.
export default function IconStilAuswahl() {
  const [aktuell, setAktuell] = useState<IconStil>("bunt");

  useEffect(() => {
    try {
      const gespeichert = localStorage.getItem(ICON_STIL_KEY) as IconStil | null;
      if (gespeichert) setAktuell(gespeichert);
    } catch {}
  }, []);

  function waehlen(stil: IconStil) {
    setAktuell(stil);
    anwendenIconStil(stil);
    try {
      localStorage.setItem(ICON_STIL_KEY, stil);
    } catch {}
  }

  const OPTIONEN: { id: IconStil; label: string }[] = [
    { id: "bunt", label: "Bunt" },
    { id: "minimal", label: "Minimalistisch" },
  ];

  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon id="iconStil" /> Icon-Stil
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>
          Nur für dieses Gerät — gilt für alle Bedien- und Navigations-Symbole in der ganzen App (Lebensmittel-, Sparziel- und Design-Vorlagen-Symbole bleiben immer bunt, da sie konkrete Dinge zeigen statt nur zu dekorieren).
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {OPTIONEN.map((o) => {
            // Bewusst NICHT über BereichIcon (die zeigt immer den gerade AKTIVEN Stil an,
            // gesteuert über das globale data-icon-stil-Attribut) — hier sollen beide
            // Optionen gleichzeitig nebeneinander als Vorschau zu sehen sein.
            const MinimalSchule = BEREICH_ICONS_MINIMAL.schule;
            const MinimalDienst = BEREICH_ICONS_MINIMAL.dienstplan;
            return (
              <button
                key={o.id}
                className="card"
                onClick={() => waehlen(o.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 8px",
                  border: aktuell === o.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {o.id === "bunt" ? (
                    <>
                      <span style={{ fontSize: 26 }}>{BEREICH_ICONS_BUNT.schule}</span>
                      <span style={{ fontSize: 26 }}>{BEREICH_ICONS_BUNT.dienstplan}</span>
                    </>
                  ) : (
                    <>
                      <MinimalSchule size={26} color="var(--accent)" strokeWidth={2} />
                      <MinimalDienst size={26} color="var(--accent)" strokeWidth={2} />
                    </>
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: aktuell === o.id ? 700 : 500 }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
