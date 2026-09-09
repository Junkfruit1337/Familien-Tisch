"use client";

import { useState, useTransition } from "react";
import { createPerson, setPin, setFarbe, setAktiv } from "./actions";

type Person = { id: string; name: string; rolle: string; farbe: string; aktiv: boolean; hatPin: boolean };

const ROLLEN = [
  { value: "ELTERN", label: "Elternteil" },
  { value: "KIND", label: "Kind (mit Login)" },
  { value: "KIND_OHNE_ZUGANG", label: "Kind ohne eigenen Zugang" },
];

export default function EinstellungenClient({ istEltern, personen }: { istEltern: boolean; personen: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rolle, setRolle] = useState("KIND");
  const [pin, setPinInput] = useState("");
  const [farbe, setFarbeInput] = useState("#a97155");
  const [pins, setPins] = useState<Record<string, string>>({});

  if (!istEltern) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Einstellungen</h1>
        <p style={{ color: "var(--text-muted)" }}>Dieser Bereich ist nur für Eltern.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Einstellungen</h1>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Personen</strong>
        {personen.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, background: p.farbe, display: "inline-block" }} />
            <span style={{ minWidth: 90 }}>{p.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{ROLLEN.find((r) => r.value === p.rolle)?.label}</span>
            <input type="color" value={p.farbe} onChange={(e) => startTransition(() => setFarbe(p.id, e.target.value))} style={{ width: 32, padding: 0 }} />
            {p.rolle !== "KIND_OHNE_ZUGANG" && (
              <>
                <input
                  placeholder="Neuer PIN"
                  maxLength={4}
                  style={{ width: 90 }}
                  value={pins[p.id] ?? ""}
                  onChange={(e) => setPins({ ...pins, [p.id]: e.target.value })}
                />
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    const v = pins[p.id];
                    if (v?.length === 4) startTransition(() => setPin(p.id, v));
                  }}
                >
                  PIN setzen
                </button>
              </>
            )}
            <label style={{ fontSize: 12, marginLeft: "auto" }}>
              <input type="checkbox" checked={p.aktiv} onChange={(e) => startTransition(() => setAktiv(p.id, e.target.checked))} style={{ width: "auto" }} /> aktiv
            </label>
          </div>
        ))}
      </div>

      <details>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Neue Person anlegen</summary>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={rolle} onChange={(e) => setRolle(e.target.value)}>
            {ROLLEN.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {rolle !== "KIND_OHNE_ZUGANG" && <input placeholder="4-stelliger PIN" maxLength={4} value={pin} onChange={(e) => setPinInput(e.target.value)} />}
          <input type="color" value={farbe} onChange={(e) => setFarbeInput(e.target.value)} />
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await createPerson({ name, rolle, pin: pin || undefined, farbe });
                setName("");
                setPinInput("");
              })
            }
          >
            Anlegen
          </button>
        </div>
      </details>
    </div>
  );
}
