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
    erkennung.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text) onErgebnis(text);
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
