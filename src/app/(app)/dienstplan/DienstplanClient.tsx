"use client";

import { useState, useTransition } from "react";
import {
  erstelleTausch,
  hebeTauschAuf,
  tauscheBadPosition,
  getWoche,
  listAktiveTausche,
  getBadplan,
  updateDienstBeschreibung,
  addTagesroutine,
  updateTagesroutine,
  deleteTagesroutine,
  setKoerperpflegetag,
  addZusatzAufgabe,
  toggleZusatzAufgabe,
  deleteZusatzAufgabe,
} from "./actions";
import HistorieVerlauf from "@/components/HistorieVerlauf";

type Dienst = { id: string; bezeichnung: string; beschreibung: string | null };
type Tag = { datum: string; kindName: string; kindFarbe: string; getauschtHeute: boolean };
type Schicht = {
  schichtNummer: number;
  kindName: string;
  kindFarbe: string;
  kindId: string;
  getauscht: boolean;
  dienste: Dienst[];
  tage: Tag[];
};
const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WOCHENTAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
type Modus = "ABGEBEN" | "TAUSCH";
type Tausch = { id: string; vonName: string; mitName: string; tag: string | null; modus: Modus };
type Kind = { id: string; name: string };
type BadPosition = { position: number; kindName: string; kindFarbe: string };
type BadPlan = { morgens: BadPosition[]; abends: BadPosition[] };
type Tagesroutine = { id: string; kategorie: string; reihenfolge: number; text: string };
type Koerperpflegetag = { id: string; wochentag: number; text: string };
type ZusatzAufgabe = { id: string; titel: string; personName: string | null; erledigt: boolean };

export default function DienstplanClient({
  istEltern,
  wocheStart: initialWocheStart,
  woche: initialWoche,
  tausche: initialTausche,
  kinder,
  badplan: initialBadplan,
  tagesroutinen,
  koerperpflegeplan,
  zusatzAufgaben,
}: {
  istEltern: boolean;
  wocheStart: string;
  woche: Schicht[];
  tausche: Tausch[];
  kinder: Kind[];
  badplan: BadPlan;
  tagesroutinen: Tagesroutine[];
  koerperpflegeplan: Koerperpflegetag[];
  zusatzAufgaben: ZusatzAufgabe[];
}) {
  const [pending, startTransition] = useTransition();
  const [wocheStart, setWocheStart] = useState(initialWocheStart);
  const [woche, setWoche] = useState(initialWoche);
  const [tausche, setTausche] = useState(initialTausche);
  const [badplan, setBadplan] = useState(initialBadplan);

  const [zeigeTausch, setZeigeTausch] = useState(false);
  const [modus, setModus] = useState<Modus>("ABGEBEN");
  const [vonKindId, setVonKindId] = useState("");
  const [mitKindId, setMitKindId] = useState("");
  const [scope, setScope] = useState<"woche" | "tag">("woche");
  const [tag, setTag] = useState("");
  const [badAuswahl, setBadAuswahl] = useState<{ zeitpunkt: "morgens" | "abends"; position: number } | null>(null);

  const [bearbeiteDienstId, setBearbeiteDienstId] = useState<string | null>(null);
  const [dienstText, setDienstText] = useState("");

  const [neueRoutineKategorie, setNeueRoutineKategorie] = useState("");
  const [neueRoutineText, setNeueRoutineText] = useState("");
  const [bearbeiteRoutineId, setBearbeiteRoutineId] = useState<string | null>(null);
  const [routineText, setRoutineText] = useState("");
  const [bearbeiteWochentag, setBearbeiteWochentag] = useState<number | null>(null);
  const [wochentagText, setWochentagText] = useState("");

  const [neueAufgabeTitel, setNeueAufgabeTitel] = useState("");
  const [neueAufgabePersonId, setNeueAufgabePersonId] = useState("");

  async function ladeWoche(neueWocheStartIso: string) {
    const { wocheStart: neuerStart, woche: neueWoche } = await getWoche(neueWocheStartIso);
    const [neueTausche, neuerBadplan] = await Promise.all([listAktiveTausche(neuerStart), getBadplan(neuerStart)]);
    setWocheStart(neuerStart);
    setWoche(
      neueWoche.map((w: any) => ({
        schichtNummer: w.schichtNummer,
        kindName: w.kind?.name ?? "—",
        kindFarbe: w.kind?.farbe ?? "#8a7a63",
        kindId: w.kind?.id ?? "",
        getauscht: w.getauscht,
        dienste: w.dienste.map((d: any) => ({ id: d.id, bezeichnung: d.bezeichnung, beschreibung: d.beschreibung })),
        tage: w.tage.map((t: any) => ({
          datum: t.datum,
          kindName: t.kind?.name ?? "—",
          kindFarbe: t.kind?.farbe ?? "#8a7a63",
          getauschtHeute: t.getauschtHeute,
        })),
      }))
    );
    setTausche(
      neueTausche.map((t: any) => ({ id: t.id, vonName: t.vonKind.name, mitName: t.mitKind.name, tag: t.tag?.toISOString() ?? null, modus: t.modus }))
    );
    setBadplan({
      morgens: neuerBadplan.morgens.map((b: any) => ({ position: b.position, kindName: b.kind?.name ?? "—", kindFarbe: b.kind?.farbe ?? "#8a7a63" })),
      abends: neuerBadplan.abends.map((b: any) => ({ position: b.position, kindName: b.kind?.name ?? "—", kindFarbe: b.kind?.farbe ?? "#8a7a63" })),
    });
  }

  function wechsleWoche(richtung: 1 | -1) {
    const d = new Date(wocheStart);
    d.setUTCDate(d.getUTCDate() + richtung * 7);
    startTransition(() => ladeWoche(d.toISOString()));
  }

  function badKlick(zeitpunkt: "morgens" | "abends", position: number) {
    if (!istEltern) return;
    if (!badAuswahl) {
      setBadAuswahl({ zeitpunkt, position });
      return;
    }
    if (badAuswahl.zeitpunkt === zeitpunkt && badAuswahl.position !== position) {
      startTransition(() =>
        tauscheBadPosition({ wocheStartIso: wocheStart, zeitpunkt, positionA: badAuswahl.position, positionB: position }).then(() =>
          ladeWoche(wocheStart)
        )
      );
    }
    setBadAuswahl(null);
  }

  const routinenNachKategorie = tagesroutinen.reduce<Record<string, Tagesroutine[]>>((acc, r) => {
    (acc[r.kategorie] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Dienstplan</h1>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button className="btn-secondary" style={{ padding: "6px 12px" }} onClick={() => wechsleWoche(-1)}>
          ‹
        </button>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Woche ab {new Date(wocheStart).toLocaleDateString("de-DE")}</p>
        <button className="btn-secondary" style={{ padding: "6px 12px" }} onClick={() => wechsleWoche(1)}>
          ›
        </button>
      </div>

      {tausche.length > 0 && (
        <div className="card" style={{ background: "#f0dfa8", color: "#6b5117", border: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {tausche.map((t) => (
            <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span>
                  {t.modus === "TAUSCH" ? "🔄" : "➡️"} {t.vonName} {t.modus === "TAUSCH" ? "↔" : "→"} {t.mitName}{" "}
                  {t.tag ? `am ${new Date(t.tag).toLocaleDateString("de-DE")}` : "(ganze Woche)"}{" "}
                  <span style={{ opacity: 0.8 }}>({t.modus === "TAUSCH" ? "Tausch" : "Abgabe"})</span>
                </span>
                {istEltern && (
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "2px 8px", color: "#6b5117", borderColor: "#6b5117" }}
                    onClick={() => startTransition(() => hebeTauschAuf(t.id).then(() => ladeWoche(wocheStart)))}
                  >
                    aufheben
                  </button>
                )}
              </div>
              {istEltern && <HistorieVerlauf entityTyp="DIENST_TAUSCH" entityId={t.id} />}
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
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              {s.dienste.map((d) => (
                <li key={d.id}>
                  {d.bezeichnung}
                  {bearbeiteDienstId === d.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      <textarea rows={2} value={dienstText} onChange={(e) => setDienstText(e.target.value)} style={{ fontSize: 13 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: "3px 8px" }}
                          onClick={() =>
                            startTransition(async () => {
                              await updateDienstBeschreibung(d.id, dienstText);
                              setBearbeiteDienstId(null);
                              await ladeWoche(wocheStart);
                            })
                          }
                        >
                          Speichern
                        </button>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => setBearbeiteDienstId(null)}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {d.beschreibung && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{d.beschreibung}</div>}
                      {istEltern && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: "2px 6px", marginTop: 2 }}
                          onClick={() => {
                            setBearbeiteDienstId(d.id);
                            setDienstText(d.beschreibung ?? "");
                          }}
                        >
                          ✎ Regeltext
                        </button>
                      )}
                    </>
                  )}
                </li>
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
            {badplan[zeitpunkt].map((b, i) =>
              istEltern ? (
                <span key={b.position} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {i > 0 && <span style={{ color: "var(--text-muted)" }}>→</span>}
                  <button
                    className="btn-secondary"
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
              ) : (
                <span key={b.position} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  {i > 0 && <span style={{ color: "var(--text-muted)" }}>→</span>}
                  <span style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${b.kindFarbe}` }}>{b.kindName}</span>
                </span>
              )
            )}
          </div>
        ))}
      </div>

      {istEltern && (
        <div className="card">
          <button className="btn-secondary" onClick={() => setZeigeTausch((v) => !v)}>
            Dienste tauschen
          </button>
          {zeigeTausch && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={modus === "ABGEBEN" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: 13 }} onClick={() => setModus("ABGEBEN")}>
                  Abgeben
                </button>
                <button type="button" className={modus === "TAUSCH" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: 13 }} onClick={() => setModus("TAUSCH")}>
                  Tauschen
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                {modus === "ABGEBEN"
                  ? "Eine Person gibt ihren Dienst komplett ab, die andere übernimmt ihn zusätzlich."
                  : "Beide Personen tauschen ihre Dienste gegenseitig."}
              </p>
              <select value={vonKindId} onChange={(e) => setVonKindId(e.target.value)}>
                <option value="">{modus === "ABGEBEN" ? "Wer gibt ab?" : "Erste Person"}</option>
                {kinder.map((k) => (
                  <option key={k.id} value={k.id} disabled={k.id === mitKindId}>
                    {k.name}
                  </option>
                ))}
              </select>
              <select value={mitKindId} onChange={(e) => setMitKindId(e.target.value)}>
                <option value="">{modus === "ABGEBEN" ? "Wer übernimmt?" : "Zweite Person"}</option>
                {kinder.map((k) => (
                  <option key={k.id} value={k.id} disabled={k.id === vonKindId}>
                    {k.name}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={scope === "woche" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: 13 }} onClick={() => setScope("woche")}>
                  Ganze Woche
                </button>
                <button type="button" className={scope === "tag" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: 13 }} onClick={() => setScope("tag")}>
                  Einzelner Tag
                </button>
              </div>
              {scope === "tag" && <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} />}
              <button
                className="btn"
                disabled={pending || !vonKindId || !mitKindId || (scope === "tag" && !tag)}
                onClick={() =>
                  startTransition(async () => {
                    await erstelleTausch({ wocheStartIso: wocheStart, tag: scope === "woche" ? undefined : tag, vonKindId, mitKindId, modus });
                    setZeigeTausch(false);
                    setVonKindId("");
                    setMitKindId("");
                    setScope("woche");
                    setTag("");
                    await ladeWoche(wocheStart);
                  })
                }
              >
                {modus === "ABGEBEN" ? "Abgabe anlegen" : "Tausch anlegen"}
              </button>
            </div>
          )}
        </div>
      )}

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🧴 Tagesroutinen &amp; Körperpflege-Plan</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          {Object.keys(routinenNachKategorie).length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Noch keine Routinen hinterlegt.</p>
          )}
          {Object.entries(routinenNachKategorie).map(([kategorie, eintraege]) => (
            <div key={kategorie}>
              <strong style={{ fontSize: 14 }}>{kategorie}</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>
                {eintraege.map((r) =>
                  bearbeiteRoutineId === r.id ? (
                    <li key={r.id} style={{ listStyle: "none", marginLeft: -18, marginBottom: 4 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={routineText} onChange={(e) => setRoutineText(e.target.value)} style={{ flex: 1 }} />
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: "3px 8px" }}
                          onClick={() =>
                            startTransition(async () => {
                              await updateTagesroutine(r.id, routineText);
                              setBearbeiteRoutineId(null);
                            })
                          }
                        >
                          ✓
                        </button>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => setBearbeiteRoutineId(null)}>
                          ✕
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li key={r.id}>
                      {r.text}
                      {istEltern && (
                        <>
                          {" "}
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: "1px 6px" }}
                            onClick={() => {
                              setBearbeiteRoutineId(r.id);
                              setRoutineText(r.text);
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: "1px 6px" }}
                            onClick={() => startTransition(() => deleteTagesroutine(r.id))}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}

          <div>
            <strong style={{ fontSize: 14 }}>Körperpflege nach Wochentag</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {WOCHENTAGE_LANG.map((name, i) => {
                const wt = i + 1;
                const eintrag = koerperpflegeplan.find((k) => k.wochentag === wt);
                return (
                  <div key={wt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <span style={{ width: 90, color: "var(--text-muted)", fontSize: 13 }}>{name}</span>
                    {bearbeiteWochentag === wt ? (
                      <>
                        <input value={wochentagText} onChange={(e) => setWochentagText(e.target.value)} style={{ flex: 1 }} />
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: "3px 8px" }}
                          onClick={() =>
                            startTransition(async () => {
                              await setKoerperpflegetag(wt, wochentagText);
                              setBearbeiteWochentag(null);
                            })
                          }
                        >
                          ✓
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1 }}>{eintrag?.text ?? "—"}</span>
                        {istEltern && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: "1px 6px" }}
                            onClick={() => {
                              setBearbeiteWochentag(wt);
                              setWochentagText(eintrag?.text ?? "");
                            }}
                          >
                            ✎
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {istEltern && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <strong style={{ fontSize: 13 }}>Neue Routine hinzufügen</strong>
              <input placeholder="Kategorie, z.B. Morgens" value={neueRoutineKategorie} onChange={(e) => setNeueRoutineKategorie(e.target.value)} />
              <input placeholder="Text" value={neueRoutineText} onChange={(e) => setNeueRoutineText(e.target.value)} />
              <button
                className="btn"
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  startTransition(async () => {
                    if (!neueRoutineKategorie || !neueRoutineText) return;
                    await addTagesroutine(neueRoutineKategorie, neueRoutineText);
                    setNeueRoutineKategorie("");
                    setNeueRoutineText("");
                  })
                }
              >
                Hinzufügen
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🧹 Zusätzliche Aufgaben ({zusatzAufgaben.filter((a) => !a.erledigt).length} offen)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {zusatzAufgaben.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Keine Ad-hoc-Aufgaben.</p>}
          {zusatzAufgaben.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, textDecoration: a.erledigt ? "line-through" : "none", color: a.erledigt ? "var(--text-muted)" : undefined }}>
                <input type="checkbox" checked={a.erledigt} onChange={() => startTransition(() => toggleZusatzAufgabe(a.id))} />
                {a.titel} {a.personName && <span style={{ color: "var(--text-muted)" }}>({a.personName})</span>}
              </label>
              {istEltern && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => startTransition(() => deleteZusatzAufgabe(a.id))}>
                  🗑
                </button>
              )}
            </div>
          ))}
          {istEltern && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <input placeholder="Neue Aufgabe" value={neueAufgabeTitel} onChange={(e) => setNeueAufgabeTitel(e.target.value)} />
              <select value={neueAufgabePersonId} onChange={(e) => setNeueAufgabePersonId(e.target.value)}>
                <option value="">Für alle / niemand Bestimmtes</option>
                {kinder.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  startTransition(async () => {
                    if (!neueAufgabeTitel) return;
                    await addZusatzAufgabe(neueAufgabeTitel, neueAufgabePersonId || undefined);
                    setNeueAufgabeTitel("");
                    setNeueAufgabePersonId("");
                  })
                }
              >
                Hinzufügen
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
