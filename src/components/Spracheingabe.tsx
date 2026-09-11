"use client";

import { useEffect, useRef, useState } from "react";

// Feature-Detection erst nach dem Mount (SSR-safe, analog dem Theme-Umschalter in AppShell) —
// window/SpeechRecognition existiert serverseitig nicht, ein direkter Check würde einen
// Hydration-Mismatch auslösen.
export default function Spracheingabe({
  onErgebnis,
  disabled,
}: {
  onErgebnis: (text: string) => void;
  disabled?: boolean;
}) {
  const [unterstuetzt, setUnterstuetzt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const erkennungRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognitionKlasse = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setUnterstuetzt(!!SpeechRecognitionKlasse);
  }, []);

  function start() {
    const SpeechRecognitionKlasse = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionKlasse) return;

    const erkennung = new SpeechRecognitionKlasse();
    erkennung.lang = "de-DE";
    erkennung.interimResults = false;
    erkennung.maxAlternatives = 1;
    // continuous=true (Fix-Batch 35, Florians Wunsch): ohne das beendet der Browser die
    // Aufnahme selbständig schon nach der ersten kurzen Sprechpause (z. B. beim Nachdenken),
    // was zu abgebrochenen/unvollständigen Aufnahmen führte. Jetzt läuft die Aufnahme weiter,
    // bis der Nutzer selbst auf "Stoppen" tippt (oder das Browser-eigene Zeitlimit greift).
    erkennung.continuous = true;
    erkennung.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (text.trim()) onErgebnis(text.trim());
    };
    erkennung.onerror = () => setLaeuft(false);
    erkennung.onend = () => setLaeuft(false);
    erkennungRef.current = erkennung;
    setLaeuft(true);
    erkennung.start();
  }

  function stop() {
    erkennungRef.current?.stop();
    setLaeuft(false);
  }

  if (!unterstuetzt) return null;

  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={disabled}
      onClick={laeuft ? stop : start}
      style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}
    >
      {laeuft ? "🔴 Aufnahme läuft … (antippen zum Stoppen)" : "🎤 Per Sprache ausfüllen"}
    </button>
  );
}
