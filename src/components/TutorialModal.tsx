"use client";

import { useRef, useState } from "react";
import { TUTORIAL_KAPITEL } from "@/lib/tutorialInhalte";

// Fix-Batch 88 (Florians Wunsch): In-App-Einführung, erreichbar über Einstellungen ("📘
// Einführung"). Bewusst als eigenständiges Overlay mit rein inhaltlichem Content
// (tutorialInhalte.ts) statt eines an echte Buttons angehefteten Live-Tours — letzteres würde
// bei jeder Redesign-Änderung kaputtgehen und müsste an dutzenden Stellen im Code verankert
// werden. Diese Variante lebt komplett in EINER Content-Datei, die sich unabhängig vom
// restlichen UI pflegen lässt.
export default function TutorialModal({ istEltern, onClose }: { istEltern: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const kapitel = TUTORIAL_KAPITEL[index];
  const istLetztes = index === TUTORIAL_KAPITEL.length - 1;

  const punkte = [...kapitel.punkte, ...((istEltern ? kapitel.punkteEltern : kapitel.punkteKind) ?? [])];

  function weiter() {
    if (istLetztes) {
      onClose();
    } else {
      setIndex((i) => Math.min(i + 1, TUTORIAL_KAPITEL.length - 1));
    }
  }
  function zurueck() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  // Wisch-Geste innerhalb der Einführung navigiert Kapitel (wie die App-weite Reiter-Wisch-
  // Geste in AppShell.tsx) — stopPropagation verhindert, dass derselbe Wisch zusätzlich den
  // App-Tab wechselt, da dieses Overlay innerhalb von AppShells äußerem Wisch-Bereich liegt.
  const wischStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    const t = e.touches[0];
    wischStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    const start = wischStartRef.current;
    wischStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) weiter();
    else zurueck();
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 26,
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-pill)",
                background: `${kapitel.farbe}22`,
                flexShrink: 0,
              }}
            >
              {kapitel.icon}
            </span>
            <strong style={{ fontSize: "var(--font-md)", color: kapitel.farbe }}>{kapitel.titel}</strong>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Einführung schließen">
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14 }}>{kapitel.nutzen}</p>
          {punkte.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              {punkte.map((p, i) => (
                <li key={i} style={{ fontSize: 13 }}>
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {TUTORIAL_KAPITEL.map((k, i) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={k.titel}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: "none",
                padding: 0,
                background: i === index ? kapitel.farbe : "var(--border)",
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={zurueck} disabled={index === 0}>
            ‹ Zurück
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={weiter}>
            {istLetztes ? "Fertig" : "Weiter ›"}
          </button>
        </div>
      </div>
    </div>
  );
}
