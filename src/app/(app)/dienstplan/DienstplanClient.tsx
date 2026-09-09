"use client";

import { useState, useTransition } from "react";
import { erstelleTausch, hebeTauschAuf } from "./actions";

type Schicht = {
  schichtNummer: number;
  kindName: string;
  kindFarbe: string;
  kindId: string;
  getauscht: boolean;
  dienste: { bezeichnung: string; beschreibung: string | null }[];
};
type Tausch = { id: string; vonName: string; mitName: string; tag: string | null };
type Kind = { id: string; name: string };

export default function DienstplanClient({
  istEltern,
  wocheStart,
  woche,
  tausche,
  kinder,
}: {
  istEltern: boolean;
  wocheStart: string;
  woche: Schicht[];
  tausche: Tausch[];
  kinder: Kind[];
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeTausch, setZeigeTausch] = useState(false);
  const [vonKindId, setVonKindId] = useState("");
  const [mitKindId, setMitKindId] = useState("");
  const [ganzeWoche, setGanzeWoche] = useState(true);
  const [tag, setTag] = useState("");

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
