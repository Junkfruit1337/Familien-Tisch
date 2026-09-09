"use client";

import { useMemo, useState, useTransition } from "react";
import { createTermin, deleteTermin } from "./actions";

type Termin = {
  id: string;
  titel: string;
  start: string;
  ende: string | null;
  ganztaegig: boolean;
  kategorie: string;
  personId: string | null;
  personName: string;
  personFarbe: string;
};
type Person = { id: string; name: string; farbe: string };

const KATEGORIEN = [
  { value: "TERMIN", label: "Termin" },
  { value: "HOBBY", label: "Hobby" },
  { value: "AUSFLUG", label: "Ausflug" },
];

export default function KalenderClient({
  istEltern,
  eigeneId,
  termine,
  personen,
}: {
  istEltern: boolean;
  eigeneId: string;
  termine: Termin[];
  personen: Person[];
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [nurZukunft, setNurZukunft] = useState(true);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [pending, startTransition] = useTransition();

  const [titel, setTitel] = useState("");
  const [start, setStart] = useState("");
  const [kategorie, setKategorie] = useState("TERMIN");
  const [personId, setPersonId] = useState<string>(istEltern ? "" : eigeneId);

  const gefiltert = useMemo(() => {
    const jetzt = new Date();
    return termine
      .filter((t) => !filter || t.personId === filter)
      .filter((t) => !nurZukunft || new Date(t.start) >= new Date(jetzt.toDateString()));
  }, [termine, filter, nurZukunft]);

  function submit() {
    if (!titel || !start) return;
    startTransition(async () => {
      await createTermin({
        titel,
        start,
        ganztaegig: false,
        kategorie,
        personId: personId || null,
      });
      setTitel("");
      setStart("");
      setZeigeFormular(false);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Kalender</h1>
        <button className="btn" onClick={() => setZeigeFormular((v) => !v)}>
          + Neuer Termin
        </button>
      </div>

      {zeigeFormular && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <select value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            {KATEGORIEN.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
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
            Speichern
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn-secondary"
          style={{ background: !filter ? "var(--accent)" : undefined, color: !filter ? "#fff" : undefined }}
          onClick={() => setFilter(null)}
        >
          Alle
        </button>
        {personen.map((p) => (
          <button
            key={p.id}
            className="btn-secondary"
            style={{ background: filter === p.id ? p.farbe : undefined, color: filter === p.id ? "#fff" : undefined }}
            onClick={() => setFilter(p.id)}
          >
            {p.name}
          </button>
        ))}
        <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={nurZukunft} onChange={(e) => setNurZukunft(e.target.checked)} style={{ width: "auto" }} />
          Vergangene ausblenden
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gefiltert.length === 0 && <p style={{ color: "var(--text-muted)" }}>Keine Termine.</p>}
        {gefiltert.map((t) => (
          <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.titel}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {new Date(t.start).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {" · "}
                <span style={{ color: t.personFarbe, fontWeight: 600 }}>{t.personName}</span>
              </div>
            </div>
            {(istEltern || t.personId === eigeneId) && (
              <button
                className="btn-secondary"
                style={{ fontSize: 13 }}
                onClick={() => {
                  if (confirm(`"${t.titel}" wirklich löschen?`)) {
                    startTransition(() => deleteTermin(t.id));
                  }
                }}
              >
                Löschen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
