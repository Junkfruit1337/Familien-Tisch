"use client";

import { useMemo, useState, useTransition } from "react";
import { addArtikel, toggleArtikel, deleteArtikel, submitWunsch, entscheideWunsch, addKategorie } from "./actions";

type Artikel = { id: string; name: string; menge: string | null; erledigt: boolean; kategorieName: string };
type Wunsch = { id: string; artikelName: string; menge: string | null; status: string; kindName: string };
type Kategorie = { id: string; name: string };

export default function EinkaufslisteClient({
  istEltern,
  artikel,
  wuensche,
  kategorien,
}: {
  istEltern: boolean;
  artikel: Artikel[];
  wuensche: Wunsch[];
  kategorien: Kategorie[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [menge, setMenge] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [neueKategorie, setNeueKategorie] = useState("");

  const nachKategorie = useMemo(() => {
    const offene = artikel.filter((a) => !a.erledigt);
    const gruppen: Record<string, Artikel[]> = {};
    for (const a of offene) {
      gruppen[a.kategorieName] = gruppen[a.kategorieName] || [];
      gruppen[a.kategorieName].push(a);
    }
    return gruppen;
  }, [artikel]);

  const erledigt = artikel.filter((a) => a.erledigt);
  const offeneWuensche = wuensche.filter((w) => w.status === "OFFEN");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Einkaufsliste</h1>

      {istEltern ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Artikel" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Menge (optional)" value={menge} onChange={(e) => setMenge(e.target.value)} />
          <select value={kategorieId} onChange={(e) => setKategorieId(e.target.value)}>
            <option value="">Sonstiges</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await addArtikel({ name, menge: menge || undefined, kategorieId: kategorieId || undefined });
                setName("");
                setMenge("");
              })
            }
          >
            Hinzufügen
          </button>
        </div>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Du kannst die Liste nicht direkt ändern — reiche stattdessen einen Wunsch ein, den die Eltern genehmigen.
          </p>
          <input placeholder="Was wünschst du dir?" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Menge (optional)" value={menge} onChange={(e) => setMenge(e.target.value)} />
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await submitWunsch({ artikelName: name, menge: menge || undefined });
                setName("");
                setMenge("");
              })
            }
          >
            Wunsch einreichen
          </button>
        </div>
      )}

      {istEltern && offeneWuensche.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>Wünsche der Kinder</strong>
          {offeneWuensche.map((w) => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>
                {w.artikelName} {w.menge ? `(${w.menge})` : ""} — <em>{w.kindName}</em>
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ padding: "6px 10px" }} onClick={() => startTransition(() => entscheideWunsch(w.id, true))}>
                  ✓
                </button>
                <button className="btn-danger" style={{ padding: "6px 10px", borderRadius: 10, border: "none" }} onClick={() => startTransition(() => entscheideWunsch(w.id, false))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.entries(nachKategorie).map(([kat, items]) => (
        <div key={kat} className="card">
          <strong>{kat}</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {items.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={false}
                  disabled={!istEltern}
                  onChange={() => istEltern && startTransition(() => toggleArtikel(a.id))}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ flex: 1 }}>
                  {a.name} {a.menge ? <span style={{ color: "var(--text-muted)" }}>· {a.menge}</span> : null}
                </span>
                {istEltern && (
                  <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => startTransition(() => deleteArtikel(a.id))}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {erledigt.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Bereits eingekauft ({erledigt.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {erledigt.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                <input
                  type="checkbox"
                  checked
                  disabled={!istEltern}
                  onChange={() => istEltern && startTransition(() => toggleArtikel(a.id))}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ textDecoration: "line-through" }}>{a.name}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {istEltern && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Kategorien verwalten</summary>
          <div className="card" style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input placeholder="Neue Kategorie" value={neueKategorie} onChange={(e) => setNeueKategorie(e.target.value)} />
            <button
              className="btn"
              onClick={() =>
                startTransition(async () => {
                  if (!neueKategorie) return;
                  await addKategorie(neueKategorie);
                  setNeueKategorie("");
                })
              }
            >
              +
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
