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
  erstelleDauerhaftenTausch,
  setzeDauerhafteBadZuordnung,
} from "./actions";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

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

export default function DienstplanClient({
  istEltern,
  wocheStart: initialWocheStart,
  woche: initialWoche,
  tausche: initialTausche,
  kinder,
  badplan: initialBadplan,
  tagesroutinen,
  koerperpflegeplan,
}: {
  istEltern: boolean;
  wocheStart: string;
  woche: Schicht[];
  tausche: Tausch[];
  kinder: Kind[];
  badplan: BadPlan;
  tagesroutinen: Tagesroutine[];
  koerperpflegeplan: Koerperpflegetag[];
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
  const [scope, setScope] = useState<"woche" | "tag" | "dauerhaft">("woche");
  const [tag, setTag] = useState("");
  const [badAuswahl, setBadAuswahl] = useState<{ zeitpunkt: "morgens" | "abends"; position: number } | null>(null);
  const [zeigeBadDauerhaft, setZeigeBadDauerhaft] = useState(false);
  const [badDauerhaftZeitpunkt, setBadDauerhaftZeitpunkt] = useState<"morgens" | "abends">("morgens");
  const [badDauerhaftPosition, setBadDauerhaftPosition] = useState(1);
  const [badDauerhaftKindId, setBadDauerhaftKindId] = useState("");

  const [bearbeiteDienstId, setBearbeiteDienstId] = useState<string | null>(null);
  const [dienstText, setDienstText] = useState("");
  const [zeigeDienstDetails, setZeigeDienstDetails] = useState(false);


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
      <SeitenTitel icon="🧹" farbe={BEREICH_FARBEN.dienstplan}>Dienstplan</SeitenTitel>

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

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setZeigeDienstDetails((v) => !v)}>
          {zeigeDienstDetails ? "Regeltexte ausblenden" : "Regeltexte anzeigen"}
        </button>
      </div>

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
                  {zeigeDienstDetails &&
                    (bearbeiteDienstId === d.id ? (
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
                    ))}
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
        {istEltern && (
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setZeigeBadDauerhaft((v) => !v)}>
              Position dauerhaft festlegen
            </button>
            {zeigeBadDauerhaft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={badDauerhaftZeitpunkt === "morgens" ? "btn" : "btn-secondary"}
                    style={{ flex: 1, fontSize: 13 }}
                    onClick={() => setBadDauerhaftZeitpunkt("morgens")}
                  >
                    Morgens
                  </button>
                  <button
                    type="button"
                    className={badDauerhaftZeitpunkt === "abends" ? "btn" : "btn-secondary"}
                    style={{ flex: 1, fontSize: 13 }}
                    onClick={() => setBadDauerhaftZeitpunkt("abends")}
                  >
                    Abends
                  </button>
                </div>
                <select value={badDauerhaftPosition} onChange={(e) => setBadDauerhaftPosition(Number(e.target.value))}>
                  {[1, 2, 3].map((p) => (
                    <option key={p} value={p}>
                      Position {p}
                    </option>
                  ))}
                </select>
                <select value={badDauerhaftKindId} onChange={(e) => setBadDauerhaftKindId(e.target.value)}>
                  <option value="">Wer soll das dauerhaft übernehmen?</option>
                  {kinder.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  disabled={pending || !badDauerhaftKindId}
                  onClick={() =>
                    startTransition(async () => {
                      await setzeDauerhafteBadZuordnung({
                        wocheStartIso: wocheStart,
                        zeitpunkt: badDauerhaftZeitpunkt,
                        position: badDauerhaftPosition,
                        kindId: badDauerhaftKindId,
                      });
                      setZeigeBadDauerhaft(false);
                      setBadDauerhaftKindId("");
                      await ladeWoche(wocheStart);
                    })
                  }
                >
                  Dauerhaft festlegen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {istEltern && (
        <div className="card">
          <button className="btn-secondary" onClick={() => setZeigeTausch((v) => !v)}>
            Dienst abgeben oder tauschen
          </button>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Z. B. wenn ein Kind krank ist, im Urlaub ist, oder dauerhaft mit jemandem tauschen möchte.
          </p>
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
                <button type="button" className={scope === "dauerhaft" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: 13 }} onClick={() => setScope("dauerhaft")}>
                  Dauerhaft
                </button>
              </div>
              {scope === "tag" && <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} />}
              {scope === "dauerhaft" && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  Gilt ab sofort dauerhaft, bis hier erneut geändert — nicht nur für diese eine Woche.
                </p>
              )}
              <button
                className="btn"
                disabled={pending || !vonKindId || !mitKindId || (scope === "tag" && !tag)}
                onClick={() =>
                  startTransition(async () => {
                    if (scope === "dauerhaft") {
                      await erstelleDauerhaftenTausch({ wocheStartIso: wocheStart, vonKindId, mitKindId, modus });
                    } else {
                      await erstelleTausch({ wocheStartIso: wocheStart, tag: scope === "woche" ? undefined : tag, vonKindId, mitKindId, modus });
                    }
                    setZeigeTausch(false);
                    setVonKindId("");
                    setMitKindId("");
                    setScope("woche");
                    setTag("");
                    await ladeWoche(wocheStart);
                  })
                }
              >
                {scope === "dauerhaft" ? "Dauerhaft ändern" : modus === "ABGEBEN" ? "Abgabe anlegen" : "Tausch anlegen"}
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
                {eintraege.map((r) => (
                  <li key={r.id}>{r.text}</li>
                ))}
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
                    <span style={{ flex: 1 }}>{eintrag?.text ?? "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {istEltern && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Texte bearbeiten geht jetzt zentral in den Einstellungen.
            </p>
          )}
        </div>
      </details>

    </div>
  );
}
