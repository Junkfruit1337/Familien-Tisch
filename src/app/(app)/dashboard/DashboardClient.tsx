"use client";

import { useState, useTransition } from "react";
import { createSchulEintrag } from "./actions";

type Daten = {
  person: { name: string; rolle: string };
  heutigesEssen: string | null;
  schulEintraege: { id: string; titel: string; fachName: string | null; datum: string; personName: string; tageBis: number; lerntipp: string | null }[];
  termineHeute: { id: string; titel: string; start: string; personName: string }[];
  offeneAufgaben: number;
};
type HistorieEintrag = { id: string; zeitpunkt: string; personName: string; typLabel: string; aktion: string; bezug: string | null };

export default function DashboardClient({
  daten,
  istEltern,
  kinder,
  historie,
}: {
  daten: Daten;
  istEltern: boolean;
  kinder: { id: string; name: string }[];
  historie: HistorieEintrag[];
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeForm, setZeigeForm] = useState(false);
  const [titel, setTitel] = useState("");
  const [art, setArt] = useState("KLASSENARBEIT");
  const [datum, setDatum] = useState("");
  const [personId, setPersonId] = useState(kinder[0]?.id ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Hallo, {daten.person.name}!</h1>

      <div className="card">
        <strong>🍽️ Heute gibt's</strong>
        <p style={{ margin: "4px 0 0" }}>{daten.heutigesEssen ?? "Noch nicht geplant"}</p>
      </div>

      <div className="card">
        <strong>📅 Heute</strong>
        {daten.termineHeute.length === 0 && <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>Keine Termine heute.</p>}
        {daten.termineHeute.map((t) => (
          <div key={t.id} style={{ marginTop: 6, fontSize: 14 }}>
            {new Date(t.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} — {t.titel} ({t.personName})
          </div>
        ))}
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--text-muted)" }}>{daten.offeneAufgaben} offene Aufgabe(n)</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>🎓 Als Nächstes steht an</strong>
          {istEltern && (
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setZeigeForm((v) => !v)}>
              + Eintrag
            </button>
          )}
        </div>

        {zeigeForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <input placeholder="Titel (z.B. Mathe-Arbeit)" value={titel} onChange={(e) => setTitel(e.target.value)} />
            <select value={art} onChange={(e) => setArt(e.target.value)}>
              <option value="KLASSENARBEIT">Klassenarbeit</option>
              <option value="HAUSAUFGABEN_KONTROLLE">Hausaufgaben-Kontrolle</option>
            </select>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {kinder.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!titel || !datum) return;
                  await createSchulEintrag({ titel, art, datum, personId });
                  setTitel("");
                  setDatum("");
                  setZeigeForm(false);
                })
              }
            >
              Speichern
            </button>
          </div>
        )}

        {daten.schulEintraege.length === 0 && <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>Nichts Anstehendes.</p>}
        {daten.schulEintraege.map((s) => (
          <div key={s.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {s.titel} {istEltern && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {s.personName}</span>}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {new Date(s.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })} · noch {s.tageBis} Tag(e)
            </div>
            {s.lerntipp && <div style={{ fontSize: 13, marginTop: 4 }}>💡 {s.lerntipp}</div>}
          </div>
        ))}
      </div>

      {istEltern && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>🕘 Änderungshistorie ({historie.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {historie.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)" }}>Noch keine Änderungen erfasst.</p>}
            {historie.map((h) => (
              <div key={h.id} style={{ fontSize: 13, borderBottom: "1px solid rgba(128,128,128,0.15)", paddingBottom: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(h.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                — <strong>{h.personName}</strong>: {h.typLabel} {h.aktion}
                {h.bezug ? ` „${h.bezug}"` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
