"use client";

import { useState } from "react";
import { login } from "./actions";

type Person = { id: string; name: string; farbe: string };

export default function LoginClient({ personen }: { personen: Person[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(value: string) {
    if (!ausgewaehlt || value.length !== 4) return;
    setLoading(true);
    setError(null);
    const res = await login(ausgewaehlt.id, value);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      setPin("");
    }
  }

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

  if (!ausgewaehlt) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Familientisch</h1>
        <p style={{ color: "var(--text-muted)" }}>Wer bist du?</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", maxWidth: 420 }}>
          {personen.map((p) => (
            <button
              key={p.id}
              onClick={() => setAusgewaehlt(p)}
              style={{
                width: 96,
                height: 96,
                borderRadius: 20,
                border: "none",
                background: p.farbe,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: ausgewaehlt.farbe,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
        }}
      >
        {ausgewaehlt.name}
      </div>
      <p style={{ color: "var(--text-muted)" }}>PIN eingeben</p>
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
            <button
              key={i}
              onClick={() => pressKey(k)}
              className="btn-secondary"
              style={{ height: 64, fontSize: 20 }}
            >
              {k === "back" ? "⌫" : k}
            </button>
          )
        )}
      </div>
      <button className="btn-secondary" onClick={() => { setAusgewaehlt(null); setPin(""); setError(null); }}>
        Zurück
      </button>
    </div>
  );
}
