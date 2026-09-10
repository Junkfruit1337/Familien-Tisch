"use client";

import { useState, useTransition } from "react";
import { erstelleTausch, hebeTauschAuf, tauscheBadPosition } from "./actions";

type Tag = { datum: string; kindName: string; kindFarbe: string; getauschtHeute: boolean };
type Schicht = {
  schichtNummer: number;
  kindName: string;
  kindFarbe: string;
  kindId: string;
  getauscht: boolean;
  dienste: { bezeichnung: string; beschreibung: string | null }[];
  tage: Tag[];
};
const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
type Tausch = { id: string; vonName: string; mitName: string; tag: string | null };
type Kind = { id: string; name: string };
type BadPosition = { position: number; kindName: string; kindFarbe: string };
type BadPlan = { morgens: BadPosition[]; abends: BadPosition[] };

export default function DienstplanClient({
  istEltern,
  wocheStart,
  woche,
  tausche,
  kinder,
  badplan,
}: {
  istEltern: boolean;
  wocheStart: string;
  woche: Schicht[];
  tausche: Tausch[];
  kinder: Kind[];
  badplan: BadPlan;
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeTausch, setZeigeTausch] = useState(false);
  const [vonKindId, setVonKindId] = useState("");
  const [mitKindId, setMitKindId] = useState("");
  const [ganzeWoche, setGanzeWoche] = useState(true);
  const [tag, setTag] = useState("");
  const [badAuswahl, setBadAuswahl] = useState<{ zeitpunkt: "morgens" | "abends"; position: number } | null>(null);

  function badKlick(zeitpunkt: "morgens" | "abends", position: number) {
    if (!istEltern) return;
    if (!badAuswahl) {
      setBadAuswahl({ zeitpunkt, position });
      return;
    }
    if (badAuswahl.zeitpunkt === zeitpunkt && badAuswahl.position !== position) {
      startTransition(() =>
        tauscheBadPosition({ wocheStartIso: wocheStart, zeitpunkt, positionA: badAuswahl.position, positionB: position })
      );
    }
    setBadAuswahl(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Dienstplan</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        Woche ab {new Date(wocheStart).toLocaleDateString("de-DE")}
      </p>

      {tausche.length > 0 && (
        <div className="card" style={{ background: "#f0dfa8", border: "none" }}>
          {tausche.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span>
                🔄 {t.vonName} ↔ {t.mitName} {t.tag ? `am ${new Date(t.tag).toLocaleDateString("de-DE")}` : "(ganze Woche)"}
              </span>
              {istEltern && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => startTransition(() => hebeTauschAuf(t.id))}>
                  aufheben
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {woche.map((s) => (
          <div key={s.schichtNummer} className="card" style={{ flex: "1 0 200px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.kindFarbe, display: "inline-block" }} />
              <strong>{s.kindName}</strong>
              {s.getauscht && <span className="pill pill-offen">getauscht</span>}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {s.dienste.map((d, i) => (
                <li key={i}>{d.bezeichnung}</li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
              {s.tage.map((t, i) => (
                <div key={t.datum} style={{ textAlign: "center", flex: 1 }} title={`${WOCHENTAGE_KURZ[i]}: ${t.kindName}`}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{WOCHENTAGE_KURZ[i]}</div>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: t.kindFarbe,
                      margin: "2px auto 0",
                      border: t.getauschtHeute ? "2px solid var(--accent)" : "none",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>🛁 Bad-Reihenfolge</strong>
        {istEltern && (
          <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--text-muted)" }}>
            Zum Tauschen: zwei Namen in derselben Zeile nacheinander anklicken.
          </p>
        )}
        {(["morgens", "abends"] as const).map((zeitpunkt) => (
          <div key={zeitpunkt} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)", width: 70 }}>{zeitpunkt === "morgens" ? "Morgens" : "Abends"}</span>
            {badplan[zeitpunkt].map((b, i) => (
              <span key={b.position} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span style={{ color: "var(--text-muted)" }}>→</span>}
                <button
                  className="btn-secondary"
                  disabled={!istEltern}
                  onClick={() => badKlick(zeitpunkt, b.position)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 13,
                    background: badAuswahl?.zeitpunkt === zeitpunkt && badAuswahl.position === b.position ? b.kindFarbe : undefined,
                    color: badAuswahl?.zeitpunkt === zeitpunkt && badAuswahl.position === b.position ? "#fff" : undefined,
                    borderColor: b.kindFarbe,
                  }}
                >
                  {b.kindName}
                </button>
              </span>
            ))}
          </div>
        ))}
      </div>

      {istEltern && (
        <div className="card">
          <button className="btn-secondary" onClick={() => setZeigeTausch((v) => !v)}>
            Dienste tauschen
          </button>
          {zeigeTausch && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              <select value={vonKindId} onChange={(e) => setVonKindId(e.target.value)}>
                <option value="">Wer gibt ab?</option>
                {kinder.map((k) => (
                  <option key={k.id} value={k.id} disabled={k.id === mitKindId}>
                    {k.name}
                  </option>
                ))}
              </select>
              <select value={mitKindId} onChange={(e) => setMitKindId(e.target.value)}>
                <option value="">Wer übernimmt?</option>
                {kinder.map((k) => (
                  <option key={k.id} value={k.id} disabled={k.id === vonKindId}>
                    {k.name}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={ganzeWoche} onChange={(e) => setGanzeWoche(e.target.checked)} style={{ width: "auto" }} />
                Ganze Woche
              </label>
              {!ganzeWoche && <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} />}
              <button
                className="btn"
                disabled={pending || !vonKindId || !mitKindId}
                onClick={() =>
                  startTransition(async () => {
                    await erstelleTausch({
                      wocheStartIso: wocheStart,
                      tag: ganzeWoche ? undefined : tag,
                      vonKindId,
                      mitKindId,
                    });
                    setZeigeTausch(false);
                    setVonKindId("");
                    setMitKindId("");
                  })
                }
              >
                Tausch anlegen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
