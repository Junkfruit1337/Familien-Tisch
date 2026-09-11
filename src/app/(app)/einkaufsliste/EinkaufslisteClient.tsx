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
import { pruefeZutaten, uebernehmeAusgewaehlteZutaten, pruefeZutatenFuerRezept, uebernehmeZusaetzlicheZutaten } from "../essensplan/actions";
import { erkenneKategorie } from "@/lib/kategorisierung";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import FaktorLeiste from "@/components/FaktorLeiste";

type Artikel = { id: string; name: string; menge: string | null; erledigt: boolean; kategorieId: string | null; kategorieName: string };
type Wunsch = { id: string; artikelName: string; menge: string | null; status: string; kindName: string; entschiedenAm: string | null };
type Kategorie = { id: string; name: string };
type Quelle = { id: string; beschreibung: string; menge: string | null; zeitpunkt: string };
type Vorschlag = { name: string; menge: string | null };
type WochenTag = { eintragId: string; tag: string; rezeptName: string };
type RezeptKurz = { id: string; name: string };
type Zutat = { name: string; menge?: string };

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
  wochenTage,
  rezepte,
}: {
  istEltern: boolean;
  artikel: Artikel[];
  wuensche: Wunsch[];
  kategorien: Kategorie[];
  vorschlaege: Vorschlag[];
  wochenTage: WochenTag[];
  rezepte: RezeptKurz[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [menge, setMenge] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bearbeiteName, setBearbeiteName] = useState("");
  const [bearbeiteMenge, setBearbeiteMenge] = useState("");
  const [wunschKategorie, setWunschKategorie] = useState<Record<string, string>>({});

  const [pruefTagId, setPruefTagId] = useState<string | null>(null);
  const [pruefZeilen, setPruefZeilen] = useState<Zutat[]>([]);
  const [pruefAusgewaehlt, setPruefAusgewaehlt] = useState<boolean[]>([]);
  const [pruefFaktor, setPruefFaktor] = useState(1);
  const [erledigteTage, setErledigteTage] = useState<string[]>([]);

  const [extraRezeptId, setExtraRezeptId] = useState("");
  const [extraFaktor, setExtraFaktor] = useState(1);
  const [extraZeilen, setExtraZeilen] = useState<Zutat[]>([]);
  const [extraAusgewaehlt, setExtraAusgewaehlt] = useState<boolean[]>([]);
  const [extraGeprueft, setExtraGeprueft] = useState(false);

  async function starteWochenPruefung(eintragId: string) {
    setPruefFaktor(1);
    const zeilen = await pruefeZutaten(eintragId, 1);
    setPruefTagId(eintragId);
    setPruefZeilen(zeilen);
    setPruefAusgewaehlt(zeilen.map(() => true));
  }

  async function aendereWochenFaktor(faktor: number) {
    if (!pruefTagId) return;
    setPruefFaktor(faktor);
    const zeilen = await pruefeZutaten(pruefTagId, faktor);
    setPruefZeilen(zeilen);
    setPruefAusgewaehlt(zeilen.map(() => true));
  }

  async function aendereExtraFaktor(faktor: number) {
    setExtraFaktor(faktor);
    if (extraGeprueft && extraRezeptId) {
      const zeilen = await pruefeZutatenFuerRezept(extraRezeptId, faktor);
      setExtraZeilen(zeilen);
      setExtraAusgewaehlt(zeilen.map(() => true));
    }
  }

  async function starteExtraPruefung() {
    if (!extraRezeptId) return;
    const zeilen = await pruefeZutatenFuerRezept(extraRezeptId, extraFaktor);
    setExtraZeilen(zeilen);
    setExtraAusgewaehlt(zeilen.map(() => true));
    setExtraGeprueft(true);
  }

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

      {istEltern && wochenTage.filter((t) => !erledigteTage.includes(t.eintragId)).length > 0 && (
        <details open>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>🍽️ Zutaten aus dem Essensplan (diese Woche)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Geplante Gerichte dieser Woche einzeln prüfen und auswählen, was wirklich noch eingekauft werden muss.
            </p>
            {wochenTage
              .filter((t) => !erledigteTage.includes(t.eintragId))
              .map((t) => (
                <div key={t.eintragId} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>
                      <strong>{new Date(t.tag).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}</strong>
                      {" · "}
                      {t.rezeptName}
                    </span>
                    {pruefTagId !== t.eintragId && (
                      <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => starteWochenPruefung(t.eintragId)}>
                        Zutaten prüfen
                      </button>
                    )}
                  </div>
                  {pruefTagId === t.eintragId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <FaktorLeiste faktor={pruefFaktor} onChange={aendereWochenFaktor} />
                      {pruefZeilen.map((z, i) => (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                          <input
                            type="checkbox"
                            checked={pruefAusgewaehlt[i]}
                            onChange={() => setPruefAusgewaehlt((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                          />
                          <span style={{ textDecoration: pruefAusgewaehlt[i] ? "none" : "line-through", color: pruefAusgewaehlt[i] ? undefined : "var(--text-muted)" }}>
                            {z.menge ? `${z.menge} ${z.name}` : z.name}
                          </span>
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const ausgewaehlt = pruefZeilen.filter((_, i) => pruefAusgewaehlt[i]);
                              await uebernehmeAusgewaehlteZutaten(t.eintragId, ausgewaehlt);
                              setErledigteTage((prev) => [...prev, t.eintragId]);
                              setPruefTagId(null);
                            })
                          }
                        >
                          Übernehmen ({pruefAusgewaehlt.filter(Boolean).length})
                        </button>
                        <button className="btn-secondary" onClick={() => setPruefTagId(null)}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </details>
      )}

      {istEltern && rezepte.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>➕ Extra-Gericht zur Einkaufsliste hinzufügen</summary>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Für Anlässe außerhalb des Essensplans — z. B. ein Dip fürs Grillen zusätzlich einkaufen.
            </p>
            <select
              value={extraRezeptId}
              onChange={(e) => {
                setExtraRezeptId(e.target.value);
                setExtraGeprueft(false);
                setExtraZeilen([]);
              }}
            >
              <option value="">– Rezept wählen –</option>
              {rezepte.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <FaktorLeiste faktor={extraFaktor} onChange={aendereExtraFaktor} />
            {!extraGeprueft && (
              <button className="btn-secondary" style={{ alignSelf: "flex-start" }} disabled={!extraRezeptId} onClick={() => startTransition(starteExtraPruefung)}>
                Zutaten anzeigen
              </button>
            )}
            {extraGeprueft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {extraZeilen.map((z, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={extraAusgewaehlt[i]}
                      onChange={() => setExtraAusgewaehlt((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                    />
                    <span style={{ textDecoration: extraAusgewaehlt[i] ? "none" : "line-through", color: extraAusgewaehlt[i] ? undefined : "var(--text-muted)" }}>
                      {z.menge ? `${z.menge} ${z.name}` : z.name}
                    </span>
                  </label>
                ))}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const ausgewaehlt = extraZeilen.filter((_, i) => extraAusgewaehlt[i]);
                        const faktorLabel = `${extraFaktor}×`.replace(".", ",");
                        await uebernehmeZusaetzlicheZutaten(extraRezeptId, ausgewaehlt, faktorLabel);
                        setExtraRezeptId("");
                        setExtraFaktor(1);
                        setExtraZeilen([]);
                        setExtraGeprueft(false);
                      })
                    }
                  >
                    Zur Einkaufsliste hinzufügen ({extraAusgewaehlt.filter(Boolean).length})
                  </button>
                  <button className="btn-secondary" onClick={() => setExtraGeprueft(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
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
