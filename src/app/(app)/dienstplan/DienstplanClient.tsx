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
import PersonChip from "@/components/PersonChip";
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
type HistorieEintrag = { id: string; zeitpunkt: string; personName: string; aktion: string; bezug: string | null };

export default function DienstplanClient({
  istEltern,
  wocheStart: initialWocheStart,
  woche: initialWoche,
  tausche: initialTausche,
  kinder,
  badplan: initialBadplan,
  tagesroutinen,
  koerperpflegeplan,
  historie,
}: {
  istEltern: boolean;
  wocheStart: string;
  woche: Schicht[];
  tausche: Tausch[];
  kinder: Kind[];
  badplan: BadPlan;
  tagesroutinen: Tagesroutine[];
  koerperpflegeplan: Koerperpflegetag[];
  historie: HistorieEintrag[];
}) {
  const [pending, startTransition] = useTransition();
  const [wocheStart, setWocheStart] = useState(initialWocheStart);
  const [woche, setWoche] = useState(initialWoche);
  const [tausche, setTausche] = useState(initialTausche);
  const [badplan, setBadplan] = useState(initialBadplan);

  const [modus, setModus] = useState<Modus>("ABGEBEN");
  const [vonKindId, setVonKindId] = useState("");
  const [mitKindId, setMitKindId] = useState("");
  const [scope, setScope] = useState<"woche" | "tag" | "dauerhaft">("woche");
  const [tag, setTag] = useState("");
  const [badAuswahl, setBadAuswahl] = useState<{ zeitpunkt: "morgens" | "abends"; position: number } | null>(null);
  const [badDauerhaftZeitpunkt, setBadDauerhaftZeitpunkt] = useState<"morgens" | "abends">("morgens");
  const [badDauerhaftPosition, setBadDauerhaftPosition] = useState(1);
  const [badDauerhaftKindId, setBadDauerhaftKindId] = useState("");

  const [bearbeiteDienstId, setBearbeiteDienstId] = useState<string | null>(null);
  const [dienstText, setDienstText] = useState("");


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
        <div className="card" style={{ background: "var(--warning-soft)", color: "#6b5117", display: "flex", flexDirection: "column", gap: 6 }}>
          {tausche.map((t) => (
            <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--font-sm)" }}>
                <span>
                  {t.modus === "TAUSCH" ? "🔄" : "➡️"} {t.vonName} {t.modus === "TAUSCH" ? "↔" : "→"} {t.mitName}{" "}
                  {t.tag ? `am ${new Date(t.tag).toLocaleDateString("de-DE")}` : "(ganze Woche)"}{" "}
                  <span style={{ opacity: 0.8 }}>({t.modus === "TAUSCH" ? "Tausch" : "Abgabe"})</span>
                </span>
                {istEltern && (
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "var(--font-xs)", padding: "2px 8px", color: "#6b5117", borderColor: "#6b5117" }}
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
              <PersonChip name={s.kindName} farbe={s.kindFarbe} size={24} />
              <strong>{s.kindName}</strong>
              {s.getauscht && <span className="pill pill-info">🔄 getauscht</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {s.dienste.map((d) =>
                bearbeiteDienstId === d.id ? (
                  <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "var(--font-base)", fontWeight: 600 }}>{d.bezeichnung}</span>
                    <textarea rows={2} value={dienstText} onChange={(e) => setDienstText(e.target.value)} style={{ fontSize: "var(--font-sm)" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn"
                        style={{ fontSize: "var(--font-xs)", padding: "3px 8px" }}
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
                      <button className="btn-secondary" style={{ fontSize: "var(--font-xs)", padding: "3px 8px" }} onClick={() => setBearbeiteDienstId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : d.beschreibung || istEltern ? (
                  <details key={d.id}>
                    <summary style={{ fontSize: "var(--font-base)", fontWeight: 500 }}>{d.bezeichnung}</summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {d.beschreibung && <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>{d.beschreibung}</p>}
                      {istEltern && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: "var(--font-xs)", padding: "3px 8px", alignSelf: "flex-start" }}
                          onClick={() => {
                            setBearbeiteDienstId(d.id);
                            setDienstText(d.beschreibung ?? "");
                          }}
                        >
                          ✎ Regeltext {d.beschreibung ? "bearbeiten" : "hinzufügen"}
                        </button>
                      )}
                    </div>
                  </details>
                ) : (
                  <span key={d.id} style={{ fontSize: "var(--font-base)" }}>
                    {d.bezeichnung}
                  </span>
                )
              )}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
              {s.tage.map((t, i) => (
                <div key={t.datum} style={{ textAlign: "center", flex: 1 }} title={`${WOCHENTAGE_KURZ[i]}: ${t.kindName}`}>
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{WOCHENTAGE_KURZ[i]}</div>
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
          <p style={{ margin: "4px 0 8px", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
            Zum Tauschen: zwei Namen in derselben Zeile nacheinander anklicken.
          </p>
        )}
        {/* Redesign (Florians Feedback): die vorherige horizontale Kette mit Pfeilen brach auf
            schmalen Bildschirmen mitten in der Zeile um und wirkte dadurch chaotisch/verrutscht.
            Jetzt eine feste, immer senkrechte Reihenfolge-Liste je Tageszeit — bricht nie um,
            sieht auf jeder Bildschirmbreite gleich aufgeräumt aus. */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {(["morgens", "abends"] as const).map((zeitpunkt) => (
            <div key={zeitpunkt} style={{ flex: "1 0 150px" }}>
              <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                {zeitpunkt === "morgens" ? "☀️ Morgens" : "🌙 Abends"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {badplan[zeitpunkt].map((b, i) => {
                  const ausgewaehlt = badAuswahl?.zeitpunkt === zeitpunkt && badAuswahl.position === b.position;
                  return istEltern ? (
                    <button
                      key={b.position}
                      className="btn-secondary"
                      onClick={() => badKlick(zeitpunkt, b.position)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        fontSize: "var(--font-sm)",
                        justifyContent: "flex-start",
                        background: ausgewaehlt ? b.kindFarbe : undefined,
                        color: ausgewaehlt ? "#fff" : undefined,
                        borderColor: b.kindFarbe,
                      }}
                    >
                      <span style={{ fontSize: "var(--font-xs)", color: ausgewaehlt ? "#fff" : "var(--text-muted)", width: 14 }}>{i + 1}.</span>
                      {!ausgewaehlt && <PersonChip name={b.kindName} farbe={b.kindFarbe} size={18} />}
                      {b.kindName}
                    </button>
                  ) : (
                    <div
                      key={b.position}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "var(--font-sm)",
                        padding: "6px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${b.kindFarbe}`,
                      }}
                    >
                      <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", width: 14 }}>{i + 1}.</span>
                      <PersonChip name={b.kindName} farbe={b.kindFarbe} size={18} />
                      {b.kindName}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {istEltern && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: "var(--font-sm)" }}>Position dauerhaft festlegen</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={badDauerhaftZeitpunkt === "morgens" ? "btn" : "btn-secondary"}
                  style={{ flex: 1, fontSize: "var(--font-sm)" }}
                  onClick={() => setBadDauerhaftZeitpunkt("morgens")}
                >
                  Morgens
                </button>
                <button
                  type="button"
                  className={badDauerhaftZeitpunkt === "abends" ? "btn" : "btn-secondary"}
                  style={{ flex: 1, fontSize: "var(--font-sm)" }}
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
                    setBadDauerhaftKindId("");
                    await ladeWoche(wocheStart);
                  })
                }
              >
                Dauerhaft festlegen
              </button>
            </div>
          </details>
        )}
      </div>

      {istEltern && (
        <details className="card">
          <summary style={{ fontWeight: 600 }}>🔁 Dienst abgeben oder tauschen</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              Z. B. wenn ein Kind krank ist, im Urlaub ist, oder dauerhaft mit jemandem tauschen möchte.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className={modus === "ABGEBEN" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: "var(--font-sm)" }} onClick={() => setModus("ABGEBEN")}>
                Abgeben
              </button>
              <button type="button" className={modus === "TAUSCH" ? "btn" : "btn-secondary"} style={{ flex: 1, fontSize: "var(--font-sm)" }} onClick={() => setModus("TAUSCH")}>
                Tauschen
              </button>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className={scope === "woche" ? "btn" : "btn-secondary"} style={{ flex: "1 0 90px", fontSize: "var(--font-sm)" }} onClick={() => setScope("woche")}>
                Ganze Woche
              </button>
              <button type="button" className={scope === "tag" ? "btn" : "btn-secondary"} style={{ flex: "1 0 90px", fontSize: "var(--font-sm)" }} onClick={() => setScope("tag")}>
                Einzelner Tag
              </button>
              <button type="button" className={scope === "dauerhaft" ? "btn" : "btn-secondary"} style={{ flex: "1 0 90px", fontSize: "var(--font-sm)" }} onClick={() => setScope("dauerhaft")}>
                Dauerhaft
              </button>
            </div>
            {scope === "tag" && <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} />}
            {scope === "dauerhaft" && (
              <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
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
        </details>
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

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🕘 Dienste-Historie ({historie.length})</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {historie.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)" }}>Noch keine Tausche erfasst.</p>}
          {historie.map((h) => (
            <div key={h.id} style={{ fontSize: "var(--font-sm)", borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>
                {new Date(h.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>{" "}
              — <strong>{h.personName}</strong>: {h.aktion}
              {h.bezug ? ` „${h.bezug}"` : ""}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
