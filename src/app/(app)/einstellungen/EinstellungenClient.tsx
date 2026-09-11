"use client";

import { useState, useTransition } from "react";
import { createPerson, setPin, setFarbe, setAktiv } from "./actions";
import { addKategorie, verschiebeKategorie } from "../einkaufsliste/actions";
import { addFach, deleteFach } from "../schule/actions";
import {
  addDienst,
  updateDienst,
  verschiebeDienstSchicht,
  verschiebeDienstReihenfolge,
  deleteDienst,
  installiereSchichtsystemVorlage,
} from "../dienstplan/actions";
import NotengewichtungSektion from "@/components/NotengewichtungSektion";
import PushBenachrichtigungen from "@/components/PushBenachrichtigungen";

type Person = { id: string; name: string; rolle: string; farbe: string; aktiv: boolean; hatPin: boolean };
type Kategorie = { id: string; name: string; reihenfolge: number };
type Gewichtung = { fachId: string; fachName: string; gewichtungen: { art: string; gewichtung: number }[] };
type Kind = { id: string; name: string; faecher: { id: string; name: string }[]; gewichtung: Gewichtung[] };
type Dienst = { id: string; schichtNummer: number; reihenfolge: number; bezeichnung: string; beschreibung: string | null };

const ROLLEN = [
  { value: "ELTERN", label: "Elternteil" },
  { value: "KIND", label: "Kind (mit Login)" },
  { value: "KIND_OHNE_ZUGANG", label: "Kind ohne eigenen Zugang" },
];

export default function EinstellungenClient({
  istEltern,
  personen,
  kategorien,
  kinder,
  dienstkatalog,
}: {
  istEltern: boolean;
  personen: Person[];
  kategorien: Kategorie[];
  kinder: Kind[];
  dienstkatalog: Dienst[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rolle, setRolle] = useState("KIND");
  const [pin, setPinInput] = useState("");
  const [farbe, setFarbeInput] = useState("#a97155");
  const [pins, setPins] = useState<Record<string, string>>({});
  const [neueKategorie, setNeueKategorie] = useState("");
  const [ausgewaehltesKind, setAusgewaehltesKind] = useState(kinder[0]?.id ?? "");
  const [neuesFach, setNeuesFach] = useState("");
  const [bearbeiteDienstId, setBearbeiteDienstId] = useState<string | null>(null);
  const [dienstBezeichnung, setDienstBezeichnung] = useState("");
  const [dienstBeschreibung, setDienstBeschreibung] = useState("");
  const [neuerDienst, setNeuerDienst] = useState<Record<number, string>>({});

  if (!istEltern) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Einstellungen</h1>
        <PushBenachrichtigungen />
        <p style={{ color: "var(--text-muted)" }}>Der Rest dieses Bereichs ist nur für Eltern.</p>
      </div>
    );
  }

  const kind = kinder.find((k) => k.id === ausgewaehltesKind) ?? kinder[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Einstellungen</h1>

      <PushBenachrichtigungen />

      <details open>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>👪 Personen &amp; Zugänge</summary>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
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

          <details>
            <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Neue Person anlegen</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
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
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🛒 Einkaufsliste: Kategorien</summary>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {kategorien.map((k, i) => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 14 }}>{k.name}</span>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "3px 8px" }}
                disabled={i === 0}
                onClick={() => startTransition(() => verschiebeKategorie(k.id, "hoch"))}
              >
                ↑
              </button>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "3px 8px" }}
                disabled={i === kategorien.length - 1}
                onClick={() => startTransition(() => verschiebeKategorie(k.id, "runter"))}
              >
                ↓
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
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
        </div>
      </details>

      {kinder.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>🎓 Schule: Fächer &amp; Notengewichtung</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {kinder.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {kinder.map((k) => (
                  <button
                    key={k.id}
                    className="btn-secondary"
                    style={{
                      background: ausgewaehltesKind === k.id ? "var(--accent)" : undefined,
                      color: ausgewaehltesKind === k.id ? "var(--accent-contrast)" : undefined,
                    }}
                    onClick={() => setAusgewaehltesKind(k.id)}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}
            {kind && (
              <>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>Fächer ({kind.name})</strong>
                  {kind.faecher.map((f) => (
                    <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14 }}>{f.name}</span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await deleteFach(f.id);
                            } catch (e: any) {
                              alert(e.message);
                            }
                          })
                        }
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                  {kind.faecher.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Noch keine Fächer.</p>}
                  <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <input placeholder="Neues Fach" value={neuesFach} onChange={(e) => setNeuesFach(e.target.value)} />
                    <button
                      className="btn"
                      onClick={() =>
                        startTransition(async () => {
                          if (!neuesFach) return;
                          await addFach(kind.id, neuesFach);
                          setNeuesFach("");
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <NotengewichtungSektion
                  kindId={kind.id}
                  kindName={kind.name}
                  gewichtung={kind.gewichtung}
                  alleKinder={kinder.map((k) => ({ id: k.id, name: k.name }))}
                />
              </>
            )}
          </div>
        </details>
      )}

      <details open>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🧹 Dienstplan: Dienstkatalog</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Änderungen hier wirken dauerhaft ab sofort — auch rückwirkend für die aktuelle Woche, nicht nur für zukünftige.
          </p>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--accent)", color: "var(--accent-contrast)" }}>
            <strong>Einmalig: Vorlage aus Florians Dokument laden</strong>
            <p style={{ fontSize: 13, margin: 0 }}>
              Überträgt die echten Dienst-Bezeichnungen/-Regeltexte, Tagesroutinen und den Körperpflegeplan aus dem Schichtsystem-Dokument in
              diese Datenbank. Überschreibt eventuell schon vorgenommene eigene Änderungen an diesen Bereichen.
            </p>
            <button
              className="btn-secondary"
              style={{ alignSelf: "flex-start", background: "var(--surface)", color: "var(--text)" }}
              onClick={() => {
                if (confirm("Dienstkatalog, Tagesroutinen und Körperpflegeplan wirklich mit der Vorlage überschreiben?")) {
                  startTransition(() => installiereSchichtsystemVorlage());
                }
              }}
            >
              Jetzt laden
            </button>
          </div>

          {[1, 2, 3].map((schicht) => {
            const diensteDerSchicht = dienstkatalog.filter((d) => d.schichtNummer === schicht);
            return (
              <div key={schicht} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <strong style={{ fontSize: 14 }}>Schicht {schicht}</strong>
                {diensteDerSchicht.map((d, i) => (
                  <div key={d.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    {bearbeiteDienstId === d.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input value={dienstBezeichnung} onChange={(e) => setDienstBezeichnung(e.target.value)} placeholder="Bezeichnung" />
                        <textarea rows={4} value={dienstBeschreibung} onChange={(e) => setDienstBeschreibung(e.target.value)} placeholder="Regeltext" />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            onClick={() =>
                              startTransition(async () => {
                                await updateDienst(d.id, { bezeichnung: dienstBezeichnung, beschreibung: dienstBeschreibung });
                                setBearbeiteDienstId(null);
                              })
                            }
                          >
                            Speichern
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setBearbeiteDienstId(null)}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{d.bezeichnung}</span>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "3px 8px" }}
                            disabled={i === 0}
                            onClick={() => startTransition(() => verschiebeDienstReihenfolge(d.id, "hoch"))}
                          >
                            ↑
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "3px 8px" }}
                            disabled={i === diensteDerSchicht.length - 1}
                            onClick={() => startTransition(() => verschiebeDienstReihenfolge(d.id, "runter"))}
                          >
                            ↓
                          </button>
                          <select
                            value={schicht}
                            onChange={(e) => startTransition(() => verschiebeDienstSchicht(d.id, Number(e.target.value)))}
                            style={{ fontSize: 12, padding: "2px 4px", width: "auto" }}
                            title="In andere Schicht verschieben"
                          >
                            {[1, 2, 3].map((s) => (
                              <option key={s} value={s}>
                                Schicht {s}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "3px 8px" }}
                            onClick={() => {
                              setBearbeiteDienstId(d.id);
                              setDienstBezeichnung(d.bezeichnung);
                              setDienstBeschreibung(d.beschreibung ?? "");
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "3px 8px" }}
                            onClick={() => startTransition(() => deleteDienst(d.id))}
                          >
                            🗑
                          </button>
                        </div>
                        {d.beschreibung && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, whiteSpace: "pre-wrap" }}>{d.beschreibung}</p>}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <input
                    placeholder="Neuer Dienst"
                    value={neuerDienst[schicht] ?? ""}
                    onChange={(e) => setNeuerDienst((prev) => ({ ...prev, [schicht]: e.target.value }))}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      startTransition(async () => {
                        const titel = neuerDienst[schicht];
                        if (!titel) return;
                        await addDienst(schicht, titel);
                        setNeuerDienst((prev) => ({ ...prev, [schicht]: "" }));
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
