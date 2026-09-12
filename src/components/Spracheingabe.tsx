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
  // Das Browser-eigene "kein Ton mehr erkannt"-Zeitlimit beendet die Aufnahme oft schon nach
  // wenigen Sekunden Sprechpause — SELBST mit continuous=true (Fix-Batch 35 Nachtrag,
  // Ticket "Spracheingabe bricht bei kurzen Pausen ab": continuous=true allein reichte nicht).
  // Deshalb: solange der Nutzer nicht selbst auf "Stoppen" getippt hat, wird bei jedem
  // automatischen onend sofort eine neue Aufnahme-Runde gestartet — der bisher erkannte Text
  // bleibt dabei erhalten (gesammelt in textRef), nur die Browser-Session läuft neu an.
  const sollLaufenRef = useRef(false);
  const textRef = useRef("");

  useEffect(() => {
    const SpeechRecognitionKlasse = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setUnterstuetzt(!!SpeechRecognitionKlasse);
  }, []);

  function starteRunde() {
    const SpeechRecognitionKlasse = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionKlasse) return;

    const erkennung = new SpeechRecognitionKlasse();
    erkennung.lang = "de-DE";
    erkennung.interimResults = false;
    erkennung.maxAlternatives = 1;
    erkennung.continuous = true;
    erkennung.onresult = (event: any) => {
      let neu = "";
      for (let i = 0; i < event.results.length; i++) {
        neu += event.results[i][0].transcript;
      }
      const kombiniert = (textRef.current + " " + neu).trim();
      textRef.current = kombiniert;
      if (kombiniert) onErgebnis(kombiniert);
    };
    erkennung.onerror = (event: any) => {
      // "no-speech" (Stille) ist kein echter Fehler, sondern genau der Fall, den wir per
      // Auto-Neustart abfangen wollen — nur bei echten Fehlern (z. B. Mikrofon-Berechtigung)
      // wirklich beenden.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        sollLaufenRef.current = false;
      }
    };
    erkennung.onend = () => {
      if (sollLaufenRef.current) {
        starteRunde();
      } else {
        setLaeuft(false);
      }
    };
    erkennungRef.current = erkennung;
    erkennung.start();
  }

  function start() {
    textRef.current = "";
    sollLaufenRef.current = true;
    setLaeuft(true);
    starteRunde();
  }

  function stop() {
    sollLaufenRef.current = false;
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
