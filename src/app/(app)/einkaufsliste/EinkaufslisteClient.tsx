"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addArtikel,
  toggleArtikel,
  deleteArtikel,
  submitWunsch,
  entscheideWunsch,
  updateArtikel,
  verschiebeArtikelKategorie,
  listArtikelQuellen,
  listVorschlaege,
  verwirfVorschlag,
  setzeVorschlaegeZurueck,
} from "./actions";
import { erkenneKategorie } from "@/lib/kategorisierung";
import HistorieVerlauf from "@/components/HistorieVerlauf";

type Artikel = { id: string; name: string; menge: string | null; erledigt: boolean; kategorieId: string | null; kategorieName: string };
type Wunsch = { id: string; artikelName: string; menge: string | null; status: string; kindName: string; entschiedenAm: string | null };
type Kategorie = { id: string; name: string };
type Quelle = { id: string; beschreibung: string; menge: string | null; zeitpunkt: string };
type Vorschlag = { name: string; menge: string | null };

function ArtikelHerkunft({ artikelId }: { artikelId: string }) {
  const [quellen, setQuellen] = useState<Quelle[] | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <details
      style={{ marginLeft: 28 }}
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && quellen === null) {
          startTransition(async () => setQuellen(await listArtikelQuellen(artikelId)));
        }
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Herkunft</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        {pending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Lädt …</span>}
        {quellen?.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Keine Herkunft erfasst.</span>}
        {quellen?.map((q) => (
          <div key={q.id} style={{ fontSize: 12 }}>
            {q.menge ? `${q.menge} · ` : ""}
            {q.beschreibung}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function EinkaufslisteClient({
  istEltern,
  artikel,
  wuensche,
  kategorien,
  vorschlaege,
}: {
  istEltern: boolean;
  artikel: Artikel[];
  wuensche: Wunsch[];
  kategorien: Kategorie[];
  vorschlaege: Vorschlag[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [menge, setMenge] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bearbeiteName, setBearbeiteName] = useState("");
  const [bearbeiteMenge, setBearbeiteMenge] = useState("");
  const [wunschKategorie, setWunschKategorie] = useState<Record<string, string>>({});

  const kategorieNachName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of kategorien) m[k.name] = k.id;
    return m;
  }, [kategorien]);

  // Live-Vorschau: welche Kategorie würde "Automatisch" für den aktuell getippten Namen erkennen?
  const erkannteKategorieName = useMemo(() => erkenneKategorie(name), [name]);

  function erkannteKategorieFuer(artikelName: string): string | null {
    if (!artikelName) return null;
    return erkenneKategorie(artikelName);
  }

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
  const entschiedeneWuensche = wuensche.filter((w) => w.status !== "OFFEN");

  function beginneBearbeiten(a: Artikel) {
    setBearbeiteId(a.id);
    setBearbeiteName(a.name);
    setBearbeiteMenge(a.menge ?? "");
  }

  function speichereBearbeiten() {
    if (!bearbeiteId) return;
    startTransition(async () => {
      await updateArtikel(bearbeiteId, { name: bearbeiteName, menge: bearbeiteMenge || undefined });
      setBearbeiteId(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Einkaufsliste</h1>

      {istEltern ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Artikel" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Menge (optional)" value={menge} onChange={(e) => setMenge(e.target.value)} />
          <select value={kategorieId} onChange={(e) => setKategorieId(e.target.value)}>
            <option value="">Automatisch{erkannteKategorieName ? ` (erkannt: ${erkannteKategorieName})` : ""}</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          {!kategorieId && name && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              {erkannteKategorieName
                ? `→ wird automatisch als ${erkannteKategorieName} einsortiert`
                : `→ keine Kategorie erkannt, landet in Sonstiges (oben manuell wählbar)`}
            </p>
          )}
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await addArtikel({ name, menge: menge || undefined, kategorieId: kategorieId || undefined });
                setName("");
                setMenge("");
                setKategorieId("");
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

      {istEltern && vorschlaege.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Vorschläge ({vorschlaege.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Häufig gekaufte Artikel, die gerade nicht auf der Liste stehen.</p>
            {vorschlaege.map((v) => (
              <div key={v.name} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>
                  {v.name} {v.menge ? <span style={{ color: "var(--text-muted)" }}>· {v.menge}</span> : null}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "3px 8px" }}
                    onClick={() =>
                      startTransition(async () => {
                        await addArtikel({ name: v.name, menge: v.menge || undefined });
                      })
                    }
                  >
                    + Hinzufügen
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "3px 8px" }}
                    title="Seltener vorschlagen"
                    onClick={() => startTransition(() => verwirfVorschlag(v.name))}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button className="btn-secondary" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={() => startTransition(() => setzeVorschlaegeZurueck())}>
              Zurücksetzen
            </button>
          </div>
        </details>
      )}

      {istEltern && offeneWuensche.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>Wünsche der Kinder</strong>
          {offeneWuensche.map((w) => {
            const erkannt = erkannteKategorieFuer(w.artikelName);
            const gewaehlt = wunschKategorie[w.id] ?? "";
            return (
              <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span>
                    {w.artikelName} {w.menge ? `(${w.menge})` : ""} — <em>{w.kindName}</em>
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn"
                      style={{ padding: "6px 10px" }}
                      onClick={() =>
                        startTransition(() =>
                          entscheideWunsch(w.id, true, gewaehlt || (erkannt ? kategorieNachName[erkannt] : undefined))
                        )
                      }
                    >
                      ✓
                    </button>
                    <button className="btn-danger" style={{ padding: "6px 10px", borderRadius: 10, border: "none" }} onClick={() => startTransition(() => entscheideWunsch(w.id, false))}>
                      ✕
                    </button>
                  </div>
                </div>
                <select
                  value={gewaehlt}
                  onChange={(e) => setWunschKategorie((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  style={{ fontSize: 13 }}
                >
                  <option value="">Automatisch{erkannt ? ` (erkannt: ${erkannt})` : ""}</option>
                  {kategorien.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <HistorieVerlauf entityTyp="EINKAUFS_WUNSCH" entityId={w.id} />
              </div>
            );
          })}
        </div>
      )}

      {entschiedeneWuensche.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Wunsch-Verlauf ({entschiedeneWuensche.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {entschiedeneWuensche.map((w) => (
              <div key={w.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>
                  {w.artikelName} {w.menge ? `(${w.menge})` : ""}
                  {istEltern && <span style={{ color: "var(--text-muted)" }}> — {w.kindName}</span>}
                  {w.entschiedenAm && <span style={{ color: "var(--text-muted)" }}> · {new Date(w.entschiedenAm).toLocaleDateString("de-DE")}</span>}
                </span>
                <span className={`pill pill-${w.status.toLowerCase()}`}>{w.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {Object.entries(nachKategorie).map(([kat, items]) => (
        <div key={kat} className="card">
          <strong>{kat}</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {items.map((a) => (
              <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {bearbeiteId === a.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={bearbeiteName} onChange={(e) => setBearbeiteName(e.target.value)} style={{ flex: "1 1 120px" }} />
                    <input value={bearbeiteMenge} onChange={(e) => setBearbeiteMenge(e.target.value)} placeholder="Menge" style={{ flex: "0 1 100px" }} />
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 13 }} onClick={speichereBearbeiten} disabled={pending}>
                      Speichern
                    </button>
                    <button className="btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setBearbeiteId(null)}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                      <>
                        <select
                          value={a.kategorieId ?? ""}
                          onChange={(e) => startTransition(() => verschiebeArtikelKategorie(a.id, e.target.value))}
                          style={{ fontSize: 12, padding: "2px 4px" }}
                          title="In andere Kategorie verschieben"
                        >
                          <option value="">Sonstiges</option>
                          {kategorien.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => beginneBearbeiten(a)}>
                          ✎
                        </button>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => startTransition(() => deleteArtikel(a.id))}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                )}
                {istEltern && bearbeiteId !== a.id && <ArtikelHerkunft artikelId={a.id} />}
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
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Kategorien verwalten (hinzufügen, Reihenfolge ändern) geht jetzt zentral in den Einstellungen.
        </p>
      )}
    </div>
  );
}
