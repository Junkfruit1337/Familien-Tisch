"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aendereEigenePin } from "./actions";

// Fix-Batch 131: dieselbe Ziffernblock-Optik wie beim Login (LoginClient.tsx), aber zweistufig
// (PIN + Wiederholung), damit sich niemand aus Versehen auf eine falsch getippte PIN aussperrt.
export default function PinAendernClient({
  name,
  farbe,
  erforderlich,
}: {
  name: string;
  farbe: string;
  erforderlich: boolean;
}) {
  const router = useRouter();
  const [erste, setErste] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pressKey(k: string) {
    if (loading) return;
    if (k === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  }

  async function submit(value: string) {
    if (!erste) {
      setErste(value);
      setPin("");
      return;
    }
    if (value !== erste) {
      setError("Die beiden PINs stimmen nicht überein — bitte erneut eingeben.");
      setErste(null);
      setPin("");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await aendereEigenePin(value);
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message);
      setErste(null);
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: farbe,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
        }}
      >
        {name}
      </div>
      {erforderlich && !erste && (
        <p style={{ color: "var(--danger)", fontSize: 14, textAlign: "center", maxWidth: 320 }}>
          Du nutzt noch die Standard-PIN. Bitte lege jetzt eine eigene PIN fest, bevor es weitergeht.
        </p>
      )}
      <p style={{ color: "var(--text-muted)" }}>{erste ? "Neue PIN wiederholen" : "Neue PIN eingeben"}</p>
      <div style={{ display: "flex", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid var(--accent)",
              background: pin.length > i ? "var(--accent)" : "transparent",
            }}
          />
        ))}
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: 12 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((k, i) =>
          k === "" ? (
            <div key={i} />
          ) : (
            <button key={i} onClick={() => pressKey(k)} className="btn-secondary" style={{ height: 64, fontSize: 20 }}>
              {k === "back" ? "⌫" : k}
            </button>
          )
        )}
      </div>
      {!erforderlich && (
        <button className="btn-secondary" onClick={() => router.back()}>
          Abbrechen
        </button>
      )}
    </div>
  );
}
