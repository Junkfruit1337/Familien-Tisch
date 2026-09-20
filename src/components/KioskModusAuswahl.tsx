"use client";

import { useEffect, useState } from "react";
import { KIOSK_MODUS_KEY, anwendenKioskModus } from "@/lib/kioskModus";

// Fix-Batch 141 (Florians Wunsch, Vorschlag 8 aus der Zehner-Liste vom 20.09.2026): für ein
// Tablet, das dauerhaft irgendwo hängt (z.B. in der Küche) — Bildschirm bleibt wach,
// "Abmelden" ist ausgeblendet (damit niemand aus Versehen den geteilten Zugang abmeldet), und
// die App kehrt nach ein paar Minuten Untätigkeit automatisch zur Startseite zurück (siehe
// AppShell.tsx). Bewusst nur pro Gerät (localStorage, wie Design/Icon-Stil) und in den
// Einstellungen unauffällig platziert statt direkt sichtbar, wie von Florian gewünscht.
export default function KioskModusAuswahl() {
  const [aktiv, setAktiv] = useState(false);

  useEffect(() => {
    try {
      setAktiv(localStorage.getItem(KIOSK_MODUS_KEY) === "1");
    } catch {}
  }, []);

  function umschalten(neu: boolean) {
    setAktiv(neu);
    anwendenKioskModus(neu);
    try {
      localStorage.setItem(KIOSK_MODUS_KEY, neu ? "1" : "0");
    } catch {}
    if (neu) {
      // Bestbemüht — Vollbild braucht eine Nutzer-Interaktion (dieser Klick zählt) und
      // funktioniert nicht auf jedem Gerät/Browser, dann bleibt es einfach beim normalen Fenster.
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  return (
    <details>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 13 }}>
        Kiosk-Modus (für ein dauerhaft angezeigtes Tablet)
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Für ein Tablet, das dauerhaft z. B. in der Küche hängt: Bildschirm bleibt wach, „Abmelden" ist
          ausgeblendet, und die App kehrt nach ein paar Minuten Untätigkeit automatisch zur Startseite zurück.
          Nur für dieses Gerät — wirkt vollständig erst nach einem Neuladen der Seite.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={aktiv} onChange={(e) => umschalten(e.target.checked)} style={{ width: "auto" }} />
          Kiosk-Modus für dieses Gerät aktivieren
        </label>
      </div>
    </details>
  );
}
