"use client";

import { useState, useTransition } from "react";
import {
  createPerson,
  setPin,
  setFarbe,
  setAktiv,
  setPortionsGewicht,
  erstelleTicket,
  erkenneTicketAusText,
  setzeTicketStatus,
} from "./actions";
import { addKategorie, verschiebeKategorie } from "../einkaufsliste/actions";
import { addFach, deleteFach, setSchulProfil } from "../schule/actions";
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
import Spracheingabe from "@/components/Spracheingabe";

type Person = { id: string; name: string; rolle: string; farbe: string; aktiv: boolean; hatPin: boolean; portionsGewicht: number };
type Kategorie = { id: string; name: string; reihenfolge: number };
type Gewichtung = { fachId: string; fachName: string; gewichtungen: { art: string; gewichtung: number }[] };
type Kind = {
  id: string;
  name: string;
  faecher: { id: string; name: string }[];
  gewichtung: Gewichtung[];
  bundesland: string | null;
  klassenstufe: number | null;
  klasse: string | null;
};

const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];
type Dienst = { id: string; schichtNummer: number; reihenfolge: number; bezeichnung: string; beschreibung: string | null };
type HistorieEintrag = { id: string; zeitpunkt: string; personName: string; typLabel: string; aktion: string; bezug: string | null };
type Ticket = { id: string; titel: string; beschreibung: string; status: string; begruendung: string | null; createdAt: string };
type TicketMitErsteller = Ticket & { erstellerName: string };

const ROLLEN = [
  { value: "ELTERN", label: "Elternteil" },
  { value: "KIND", label: "Kind (mit Login)" },
  { value: "KIND_OHNE_ZUGANG", label: "Kind ohne eigenen Zugang" },
];

const TICKET_STATUS_LABEL: Record<string, string> = {
  EINGEREICHT: "Eingereicht",
  GENEHMIGT: "Genehmigt",
  ABGELEHNT: "Abgelehnt",
  IN_UMSETZUNG: "Genehmigt und in Umsetzung",
  UMGESETZT: "Umgesetzt",
};

export default function EinstellungenClient({
  istEltern,
  personen,
  kategorien,
  kinder,
  dienstkatalog,
  historie,
  meineTickets,
  alleTickets,
}: {
  istEltern: boolean;
  personen: Person[];
  kategorien: Kategorie[];
  kinder: Kind[];
  dienstkatalog: Dienst[];
  historie: HistorieEintrag[];
  meineTickets: Ticket[];
  alleTickets: TicketMitErsteller[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rolle, setRolle] = useState("KIND");
  const [pin, setPinInput] = useState("");
  const [farbe, setFarbeInput] = useState("#a97155");
  const [pins, setPins] = useState<Record<string, string>>({});
  const [portionenEntwuerfe, setPortionenEntwuerfe] = useState<Record<string, string>>({});
  const [neueKategorie, setNeueKategorie] = useState("");
  const [ausgewaehltesKind, setAusgewaehltesKind] = useState(kinder[0]?.id ?? "");
  const [neuesFach, setNeuesFach] = useState("");
  const [klassenstufeEntwuerfe, setKlassenstufeEntwuerfe] = useState<Record<string, string>>({});
  const [klasseEntwuerfe, setKlasseEntwuerfe] = useState<Record<string, string>>({});
  const [bearbeiteDienstId, setBearbeiteDienstId] = useState<string | null>(null);
  const [dienstBezeichnung, setDienstBezeichnung] = useState("");
  const [dienstBeschreibung, setDienstBeschreibung] = useState("");
  const [neuerDienst, setNeuerDienst] = useState<Record<number, string>>({});

  const [ticketTitel, setTicketTitel] = useState("");
  const [ticketBeschreibung, setTicketBeschreibung] = useState("");
  const [ticketVerarbeitung, setTicketVerarbeitung] = useState(false);
  const [ticketBegruendungen, setTicketBegruendungen] = useState<Record<string, string>>({});

  async function ticketSpracheErkannt(text: string) {
    setTicketVerarbeitung(true);
    try {
      const ergebnis = await erkenneTicketAusText(text);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      setTicketTitel(ergebnis.ticket.titel);
      setTicketBeschreibung(ergebnis.ticket.beschreibung);
    } finally {
      setTicketVerarbeitung(false);
    }
  }

  const fehlerMeldenSektion = (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>🐞 Fehler melden / Verbesserungsvorschlag</summary>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <Spracheingabe onErgebnis={ticketSpracheErkannt} disabled={ticketVerarbeitung} />
        {ticketVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
        <input placeholder="Titel" value={ticketTitel} onChange={(e) => setTicketTitel(e.target.value)} />
        <textarea
          placeholder="Was ist passiert / was wünschst du dir?"
          rows={4}
          value={ticketBeschreibung}
          onChange={(e) => setTicketBeschreibung(e.target.value)}
        />
        <button
          className="btn"
          disabled={pending || !ticketTitel.trim() || !ticketBeschreibung.trim()}
          onClick={() =>
            startTransition(async () => {
              await erstelleTicket(ticketTitel, ticketBeschreibung);
              setTicketTitel("");
              setTicketBeschreibung("");
            })
          }
        >
          Einreichen
        </button>
        {meineTickets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 13 }}>Meine gemeldeten Tickets</strong>
            {meineTickets.map((t) => (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{t.titel}</span>
                  <span className={`pill pill-${t.status === "ABGELEHNT" ? "abgelehnt" : t.status === "EINGEREICHT" ? "offen" : "genehmigt"}`}>
                    {TICKET_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                {t.begruendung && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>„{t.begruendung}"</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );

  if (!istEltern) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Einstellungen</h1>
        <PushBenachrichtigungen />
        {fehlerMeldenSektion}
        <p style={{ color: "var(--text-muted)" }}>Der Rest dieses Bereichs ist nur für Eltern.</p>
      </div>
    );
  }

  const kind = kinder.find((k) => k.id === ausgewaehltesKind) ?? kinder[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Einstellungen</h1>

      <PushBenachrichtigungen />

      {fehlerMeldenSektion}

      {alleTickets.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>🎫 Tickets verwalten ({alleTickets.filter((t) => t.status === "EINGEREICHT").length} neu)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {alleTickets.map((t) => (
              <div key={t.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{t.titel}</strong>
                  <span className={`pill pill-${t.status === "ABGELEHNT" ? "abgelehnt" : t.status === "EINGEREICHT" ? "offen" : "genehmigt"}`}>
                    {TICKET_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13 }}>{t.beschreibung}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  Von {t.erstellerName} · {new Date(t.createdAt).toLocaleDateString("de-DE")}
                </p>
                {t.begruendung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Begründung: „{t.begruendung}"</p>}
                <input
                  placeholder="Begründung (optional)"
                  value={ticketBegruendungen[t.id] ?? ""}
                  onChange={(e) => setTicketBegruendungen((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  style={{ fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["GENEHMIGT", "ABGELEHNT", "IN_UMSETZUNG", "UMGESETZT"].map((s) => (
                    <button
                      key={s}
                      className="btn-secondary"
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        background: t.status === s ? "var(--accent)" : undefined,
                        color: t.status === s ? "var(--accent-contrast)" : undefined,
                      }}
                      onClick={() => startTransition(() => setzeTicketStatus(t.id, s, ticketBegruendungen[t.id] || undefined))}
                    >
                      {TICKET_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

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
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                Portionsgröße
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  style={{ width: 60 }}
                  value={portionenEntwuerfe[p.id] ?? String(p.portionsGewicht)}
                  onChange={(e) => setPortionenEntwuerfe((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={(e) => {
                    const wert = parseFloat(e.target.value.replace(",", "."));
                    if (wert > 0) startTransition(() => setPortionsGewicht(p.id, wert));
                  }}
                />
              </label>
              <label style={{ fontSize: 12, marginLeft: "auto" }}>
                <input type="checkbox" checked={p.aktiv} onChange={(e) => startTransition(() => setAktiv(p.id, e.target.checked))} style={{ width: "auto" }} /> aktiv
              </label>
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Portionsgröße steuert die Mengen-Skalierung beim Essensplan: 1 = normale Portion, 0,5 = halbe, 1,5 = anderthalbfache usw.
          </p>

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
            {kinder.length > 1 && (
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>Alle Fächer im Überblick</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                    Vor dem Anlegen hier prüfen, ob ein Fach bei einem anderen Kind schon (anders geschrieben) existiert.
                  </p>
                  {kinder.map((k) => (
                    <div key={k.id} style={{ fontSize: 13 }}>
                      <strong>{k.name}:</strong> {k.faecher.length > 0 ? k.faecher.map((f) => f.name).join(", ") : "— keine Fächer —"}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {kind && (
              <>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>Schulprofil ({kind.name})</strong>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>Bundesland</label>
                  <select
                    value={kind.bundesland ?? ""}
                    onChange={(e) => startTransition(() => setSchulProfil(kind.id, { bundesland: e.target.value }))}
                  >
                    <option value="">– wählen –</option>
                    {BUNDESLAENDER.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    Grundlage für die echten Ferientermine/den Ferien-Countdown im Schule-Tab.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Klassenstufe</span>
                      <input
                        type="number"
                        min={1}
                        max={13}
                        value={klassenstufeEntwuerfe[kind.id] ?? (kind.klassenstufe ? String(kind.klassenstufe) : "")}
                        onChange={(e) => setKlassenstufeEntwuerfe((prev) => ({ ...prev, [kind.id]: e.target.value }))}
                        onBlur={(e) => {
                          const wert = parseInt(e.target.value, 10);
                          if (!wert || wert === kind.klassenstufe) return;
                          if (kind.klassenstufe && !confirm(`Klassenstufe wirklich von ${kind.klassenstufe} auf ${wert} ändern?`)) {
                            setKlassenstufeEntwuerfe((prev) => ({ ...prev, [kind.id]: String(kind.klassenstufe) }));
                            return;
                          }
                          startTransition(() => setSchulProfil(kind.id, { klassenstufe: wert }));
                        }}
                      />
                    </label>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Klasse (z. B. 5a)</span>
                      <input
                        value={klasseEntwuerfe[kind.id] ?? kind.klasse ?? ""}
                        onChange={(e) => setKlasseEntwuerfe((prev) => ({ ...prev, [kind.id]: e.target.value }))}
                        onBlur={(e) => startTransition(() => setSchulProfil(kind.id, { klasse: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>
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
                          try {
                            await addFach(kind.id, neuesFach);
                            setNeuesFach("");
                          } catch (e: any) {
                            alert(e.message);
                          }
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
    </div>
  );
}
