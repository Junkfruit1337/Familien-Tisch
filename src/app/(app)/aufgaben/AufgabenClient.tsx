"use client";

import { useState, useTransition } from "react";
import { createAufgabe, toggleAufgabe, deleteAufgabe } from "./actions";

type Aufgabe = {
  id: string;
  titel: string;
  faelligkeit: string | null;
  erledigt: boolean;
  personId: string | null;
  personName: string;
};
type Person = { id: string; name: string };

export default function AufgabenClient({
  istEltern,
  eigeneId,
  aufgaben,
  personen,
}: {
  istEltern: boolean;
  eigeneId: string;
  aufgaben: Aufgabe[];
  personen: Person[];
}) {
  const [titel, setTitel] = useState("");
  const [faelligkeit, setFaelligkeit] = useState("");
  const [personId, setPersonId] = useState(istEltern ? "" : eigeneId);
  const [filter, setFilter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!titel) return;
    startTransition(async () => {
      await createAufgabe({ titel, faelligkeit: faelligkeit || undefined, personId: personId || null });
      setTitel("");
      setFaelligkeit("");
    });
  }

  const sichtbar = aufgaben.filter((a) => !filter || a.personId === filter);
  const offen = sichtbar.filter((a) => !a.erledigt);
  const erledigt = sichtbar.filter((a) => a.erledigt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Aufgaben</h1>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="Neue Aufgabe" value={titel} onChange={(e) => setTitel(e.target.value)} />
        <input type="date" value={faelligkeit} onChange={(e) => setFaelligkeit(e.target.value)} />
        {istEltern && (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Familie (alle)</option>
            {personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn" disabled={pending} onClick={submit}>
          Hinzufügen
        </button>
      </div>

      {istEltern && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            style={{ background: !filter ? "var(--accent)" : undefined, color: !filter ? "var(--accent-contrast)" : undefined }}
            onClick={() => setFilter(null)}
          >
            Alle
          </button>
          {personen.map((p) => (
            <button
              key={p.id}
              className="btn-secondary"
              style={{ background: filter === p.id ? "var(--accent)" : undefined, color: filter === p.id ? "var(--accent-contrast)" : undefined }}
              onClick={() => setFilter(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {offen.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={false} onChange={() => startTransition(() => toggleAufgabe(a.id))} style={{ width: 20, height: 20 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.titel}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {a.faelligkeit ? new Date(a.faelligkeit).toLocaleDateString("de-DE") : "ohne Fälligkeit"} · {a.personName}
              </div>
            </div>
            {(istEltern || a.personId === eigeneId) && (
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => startTransition(() => deleteAufgabe(a.id))}>
                Löschen
              </button>
            )}
          </div>
        ))}
        {offen.length === 0 && <p style={{ color: "var(--text-muted)" }}>Keine offenen Aufgaben. 🎉</p>}
      </div>

      {erledigt.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Erledigt ({erledigt.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {erledigt.map((a) => (
              <div key={a.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                <input type="checkbox" checked onChange={() => startTransition(() => toggleAufgabe(a.id))} style={{ width: 20, height: 20 }} />
                <div style={{ flex: 1, textDecoration: "line-through" }}>{a.titel}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
