"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import {
  einreichenNote,
  entscheideNote,
  loescheNote,
  auszahlen,
  manuelleGutschrift,
  setSparziel,
  pruefeNotenDuplikat,
  korrigiereNote,
  erneutEinreichen,
  createSchulEintrag,
  updateSchulEintrag,
  deleteSchulEintrag,
} from "./actions";
import HistorieVerlauf from "@/components/HistorieVerlauf";

type Note = {
  id: string;
  fachId: string;
  fachName: string;
  art: string;
  note: number;
  datum: string;
  status: string;
  notiz: string | null;
  gewichtung: number;
  fotoBase64: string | null;
};
type Transaktion = { id: string; betrag: number; typ: string; grund: string | null; createdAt: string };
type Kind = {
  id: string;
  name: string;
  farbe: string;
  faecher: { id: string; name: string }[];
  noten: Note[];
  kontostand: number;
  taschengeld: Transaktion[];
  sparziel: { bezeichnung: string; zielbetrag: number } | null;
};
type SchulEintrag = {
  id: string;
  titel: string;
  fachName: string | null;
  art: string;
  datum: string;
  personId: string;
  personName: string;
  personFarbe: string;
};

const ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Klassenarbeit",
  HAUSAUFGABEN_KONTROLLE: "Hausaufgaben-Kontrolle",
  EPOCHALNOTE: "Epochalnote",
};

function resizeBildAufBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const bild = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      bild.onerror = reject;
      bild.onload = () => {
        const maxBreite = 1000;
        const skalierung = Math.min(1, maxBreite / bild.width);
        const canvas = document.createElement("canvas");
        canvas.width = bild.width * skalierung;
        canvas.height = bild.height * skalierung;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas nicht verfügbar"));
        ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      bild.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function Feier({ onEnde }: { onEnde: () => void }) {
  const stuecke = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dauer: 1.8 + Math.random() * 1,
        emoji: ["🎉", "✨", "⭐", "🎊"][i % 4],
      })),
    []
  );

  useEffect(() => {
    const t = setTimeout(onEnde, 2600);
    return () => clearTimeout(t);
  }, [onEnde]);

  return (
    <>
      <div className="confetti-overlay">
        {stuecke.map((s) => (
          <span
            key={s.id}
            className="confetti-piece"
            style={{ left: `${s.left}%`, animationDelay: `${s.delay}s`, animationDuration: `${s.dauer}s` }}
          >
            {s.emoji}
          </span>
        ))}
      </div>
      <span className="flugzeug-banner">✈️</span>
      <span className="weiter-so-banner">Weiter so!</span>
    </>
  );
}

function BildModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 20,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Notenzettel" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} />
    </div>
  );
}

function tageBisText(datumIso: string): { tageBis: number; text: string } {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const datum = new Date(datumIso);
  datum.setHours(0, 0, 0, 0);
  const tageBis = Math.round((datum.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
  if (tageBis < 0) return { tageBis, text: "vorbei" };
  if (tageBis === 0) return { tageBis, text: "heute" };
  if (tageBis === 1) return { tageBis, text: "noch 1 Tag" };
  return { tageBis, text: `noch ${tageBis} Tage` };
}

function SchulEintraegeSektion({
  istEltern,
  eigeneId,
  kinder,
  fachNamen,
  eintraege,
}: {
  istEltern: boolean;
  eigeneId: string;
  kinder: { id: string; name: string; farbe: string }[];
  fachNamen: string[];
  eintraege: SchulEintrag[];
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeForm, setZeigeForm] = useState(false);
  const [titel, setTitel] = useState("");
  const [fachName, setFachName] = useState("");
  const [art, setArt] = useState("KLASSENARBEIT");
  const [datum, setDatum] = useState("");
  const [ausgewaehlteKinder, setAusgewaehlteKinder] = useState<string[]>(istEltern ? [] : [eigeneId]);
  const [filterKindId, setFilterKindId] = useState<string>("alle");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bearbeitenTitel, setBearbeitenTitel] = useState("");
  const [bearbeitenDatum, setBearbeitenDatum] = useState("");

  function toggleKind(id: string) {
    setAusgewaehlteKinder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const sichtbareEintraege = eintraege.filter((e) => filterKindId === "alle" || e.personId === filterKindId);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>🎓 Klassenarbeiten &amp; Hausaufgaben-Kontrollen</strong>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setZeigeForm((v) => !v)}>
          {zeigeForm ? "Abbrechen" : "+ Eintrag"}
        </button>
      </div>

      {istEltern && kinder.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12, background: filterKindId === "alle" ? "var(--accent)" : undefined, color: filterKindId === "alle" ? "var(--accent-contrast)" : undefined }}
            onClick={() => setFilterKindId("alle")}
          >
            Alle
          </button>
          {kinder.map((k) => (
            <button
              key={k.id}
              className="btn-secondary"
              style={{ fontSize: 12, background: filterKindId === k.id ? k.farbe : undefined, color: filterKindId === k.id ? "#fff" : undefined }}
              onClick={() => setFilterKindId(k.id)}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      {zeigeForm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <input placeholder="Titel (z. B. Mathe-Arbeit)" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input
            list="fachnamen-liste"
            placeholder="Fach (optional)"
            value={fachName}
            onChange={(e) => setFachName(e.target.value)}
          />
          <datalist id="fachnamen-liste">
            {fachNamen.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <select value={art} onChange={(e) => setArt(e.target.value)}>
            <option value="KLASSENARBEIT">Klassenarbeit</option>
            <option value="HAUSAUFGABEN_KONTROLLE">Hausaufgaben-Kontrolle</option>
          </select>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />

          {istEltern && (
            <div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Für wen?</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {kinder.map((k) => (
                  <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14 }}>
                    <input type="checkbox" checked={ausgewaehlteKinder.includes(k.id)} onChange={() => toggleKind(k.id)} />
                    {k.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!titel || !datum) return;
                await createSchulEintrag({
                  titel,
                  fachName: fachName || undefined,
                  art,
                  datum,
                  personIds: istEltern ? ausgewaehlteKinder : undefined,
                });
                setTitel("");
                setFachName("");
                setDatum("");
                setAusgewaehlteKinder(istEltern ? [] : [eigeneId]);
                setZeigeForm(false);
              })
            }
          >
            Speichern
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sichtbareEintraege.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)" }}>Nichts Anstehendes.</p>}
        {sichtbareEintraege.map((e) => {
          const { text } = tageBisText(e.datum);
          const darfBearbeiten = istEltern || e.personId === eigeneId;
          const wirdBearbeitet = bearbeiteId === e.id;
          return (
            <div key={e.id} className="card">
              {wirdBearbeitet ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={bearbeitenTitel} onChange={(ev) => setBearbeitenTitel(ev.target.value)} />
                  <input type="date" value={bearbeitenDatum} onChange={(ev) => setBearbeitenDatum(ev.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      style={{ padding: "6px 10px" }}
                      onClick={() =>
                        startTransition(async () => {
                          await updateSchulEintrag(e.id, { titel: bearbeitenTitel, datum: bearbeitenDatum });
                          setBearbeiteId(null);
                        })
                      }
                    >
                      Speichern
                    </button>
                    <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setBearbeiteId(null)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>
                        {new Date(e.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>
                        {e.titel} {e.fachName && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {e.fachName}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                        {ART_LABEL[e.art]} · {text}
                        {istEltern && (
                          <>
                            {" · "}
                            <span style={{ color: e.personFarbe, fontWeight: 600 }}>{e.personName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {darfBearbeiten && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: "4px 8px" }}
                          onClick={() => {
                            setBearbeiteId(e.id);
                            setBearbeitenTitel(e.titel);
                            setBearbeitenDatum(e.datum.slice(0, 10));
                          }}
                        >
                          ✎
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: "4px 8px" }}
                          onClick={() => startTransition(() => deleteSchulEintrag(e.id))}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SchuleClient({
  istEltern,
  eigeneId,
  kinder,
  schulEintraege,
  fachNamen,
}: {
  istEltern: boolean;
  eigeneId: string;
  kinder: Kind[];
  schulEintraege: SchulEintrag[];
  fachNamen: string[];
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState(kinder[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const kind = useMemo(() => kinder.find((k) => k.id === ausgewaehlt) ?? kinder[0], [kinder, ausgewaehlt]);

  const [fachId, setFachId] = useState("");
  const [art, setArt] = useState("KLASSENARBEIT");
  const [noteWert, setNoteWert] = useState(1);
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [notiz, setNotiz] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [auszahlBetrag, setAuszahlBetrag] = useState("");
  const [gutschriftBetrag, setGutschriftBetrag] = useState("");
  const [gutschriftGrund, setGutschriftGrund] = useState("");
  const [zielBezeichnung, setZielBezeichnung] = useState(kind?.sparziel?.bezeichnung ?? "");
  const [zielBetrag, setZielBetrag] = useState(kind?.sparziel?.zielbetrag?.toString() ?? "");
  const [feier, setFeier] = useState(false);
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  const [korrekturId, setKorrekturId] = useState<string | null>(null);
  const [korrekturNote, setKorrekturNote] = useState(1);
  const [korrekturNotiz, setKorrekturNotiz] = useState("");
  const [neueinreichungId, setNeueinreichungId] = useState<string | null>(null);
  const [neueinreichungNote, setNeueinreichungNote] = useState(1);
  const [neueinreichungNotiz, setNeueinreichungNotiz] = useState("");

  if (!kind) return <p>Noch keine Kinder angelegt.</p>;

  const offeneNoten = istEltern ? kinder.flatMap((k) => k.noten.filter((n) => n.status === "OFFEN").map((n) => ({ ...n, kindName: k.name }))) : [];

  async function jetztEinreichen() {
    if (!fachId) return;
    const istDuplikat = await pruefeNotenDuplikat({ fachId, art, datum });
    if (istDuplikat && !confirm("Für dieses Fach/diese Art gibt es an diesem Tag schon eine Note. Trotzdem speichern?")) {
      return;
    }
    const ergebnis = await einreichenNote({ fachId, art, note: noteWert, datum, notiz: notiz || undefined, fotoBase64: foto ?? undefined });
    setNotiz("");
    setFoto(null);
    if (ergebnis.istKindEinreichung && (ergebnis.note === 1 || ergebnis.note === 2)) {
      setFeier(true);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Schule &amp; Taschengeld</h1>

      {feier && <Feier onEnde={() => setFeier(false)} />}
      {grossesBild && <BildModal src={grossesBild} onClose={() => setGrossesBild(null)} />}

      <SchulEintraegeSektion
        istEltern={istEltern}
        eigeneId={eigeneId}
        kinder={kinder.map((k) => ({ id: k.id, name: k.name, farbe: k.farbe }))}
        fachNamen={fachNamen}
        eintraege={schulEintraege}
      />

      {istEltern && kinder.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {kinder.map((k) => (
            <button
              key={k.id}
              className="btn-secondary"
              style={{ background: ausgewaehlt === k.id ? k.farbe : undefined, color: ausgewaehlt === k.id ? "#fff" : undefined }}
              onClick={() => setAusgewaehlt(k.id)}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      {istEltern && offeneNoten.length > 0 && (
        <div className="card">
          <strong>Noten zur Genehmigung</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {offeneNoten.map((n) => (
              <div key={n.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                {korrekturId === n.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {(n as any).kindName} — {n.fachName} ({ART_LABEL[n.art]})
                    </span>
                    <select value={korrekturNote} onChange={(e) => setKorrekturNote(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((v) => (
                        <option key={v} value={v}>
                          Note {v}
                        </option>
                      ))}
                    </select>
                    <input placeholder="Notiz" value={korrekturNotiz} onChange={(e) => setKorrekturNotiz(e.target.value)} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px" }}
                        onClick={() =>
                          startTransition(async () => {
                            await korrigiereNote(n.id, { note: korrekturNote, notiz: korrekturNotiz || undefined });
                            setKorrekturId(null);
                          })
                        }
                      >
                        Korrektur speichern
                      </button>
                      <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setKorrekturId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {n.fotoBase64 && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.fotoBase64}
                          alt="Notenzettel"
                          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                          onClick={() => setGrossesBild(n.fotoBase64)}
                        />
                      )}
                      <span>
                        {(n as any).kindName} — {n.fachName}: Note {n.note} ({ART_LABEL[n.art]})
                        {n.notiz && <span style={{ color: "var(--text-muted)" }}> · „{n.notiz}"</span>}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 10px" }}
                        onClick={() => {
                          setKorrekturId(n.id);
                          setKorrekturNote(n.note);
                          setKorrekturNotiz(n.notiz ?? "");
                        }}
                      >
                        ✎
                      </button>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => startTransition(() => entscheideNote(n.id, true))}>
                        ✓
                      </button>
                      <button className="btn-danger" style={{ padding: "6px 10px", borderRadius: 10, border: "none" }} onClick={() => startTransition(() => entscheideNote(n.id, false))}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <strong>Kontostand: {kind.kontostand.toFixed(2)} €</strong>
        {kind.sparziel && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Sparziel: {kind.sparziel.bezeichnung} ({kind.sparziel.zielbetrag} €)
            </div>
            <div style={{ background: "var(--border)", borderRadius: 8, height: 10, marginTop: 4 }}>
              <div
                style={{
                  width: `${Math.min(100, (kind.kontostand / kind.sparziel.zielbetrag) * 100)}%`,
                  background: "var(--accent)",
                  height: "100%",
                  borderRadius: 8,
                }}
              />
            </div>
          </div>
        )}
        {(istEltern || kind.id === eigeneId) && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Sparziel bearbeiten</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input placeholder="Bezeichnung" value={zielBezeichnung} onChange={(e) => setZielBezeichnung(e.target.value)} />
              <input type="number" placeholder="Zielbetrag €" value={zielBetrag} onChange={(e) => setZielBetrag(e.target.value)} />
              <button
                className="btn"
                onClick={() =>
                  startTransition(() => setSparziel(kind.id, zielBezeichnung, parseFloat(zielBetrag) || 0))
                }
              >
                Speichern
              </button>
            </div>
          </details>
        )}
        {istEltern && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Auszahlung erfassen</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="number" placeholder="Betrag €" value={auszahlBetrag} onChange={(e) => setAuszahlBetrag(e.target.value)} />
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const b = parseFloat(auszahlBetrag);
                    if (!b) return;
                    try {
                      await auszahlen(kind.id, b);
                      setAuszahlBetrag("");
                    } catch (e: any) {
                      alert(e.message);
                    }
                  })
                }
              >
                Auszahlen
              </button>
            </div>
            {auszahlBetrag && !isNaN(parseFloat(auszahlBetrag)) && (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Rest danach: {(kind.kontostand - parseFloat(auszahlBetrag)).toFixed(2)} €
              </p>
            )}
          </details>
        )}
        {istEltern && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Geld manuell gutschreiben</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <input type="number" placeholder="Betrag €" value={gutschriftBetrag} onChange={(e) => setGutschriftBetrag(e.target.value)} />
              <input placeholder="Notiz (Pflicht) — z. B. Geburtstagsgeld" value={gutschriftGrund} onChange={(e) => setGutschriftGrund(e.target.value)} />
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const b = parseFloat(gutschriftBetrag);
                    if (!b) return;
                    try {
                      await manuelleGutschrift(kind.id, b, gutschriftGrund);
                      setGutschriftBetrag("");
                      setGutschriftGrund("");
                    } catch (e: any) {
                      alert(e.message);
                    }
                  })
                }
              >
                Gutschreiben
              </button>
            </div>
          </details>
        )}
      </div>

      {(istEltern || kind.id === eigeneId) && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>Note eintragen</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={fachId} onChange={(e) => setFachId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Fach wählen</option>
              {kind.faecher.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <select value={art} onChange={(e) => setArt(e.target.value)}>
            {Object.entries(ART_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select value={noteWert} onChange={(e) => setNoteWert(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                Note {n}
              </option>
            ))}
          </select>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          <input placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Foto vom Notenzettel (optional)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const base64 = await resizeBildAufBase64(file);
                setFoto(base64);
              }}
            />
          </label>
          {foto && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt="Vorschau" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />
              <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setFoto(null)}>
                Entfernen
              </button>
            </div>
          )}
          <button className="btn" disabled={pending} onClick={() => startTransition(jetztEinreichen)}>
            Eintragen
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Noten je Fach</strong>
        {kind.faecher.map((f) => {
          const notenDesFachs = kind.noten.filter((n) => n.fachId === f.id);
          if (notenDesFachs.length === 0) return null;
          const genehmigt = notenDesFachs.filter((n) => n.status === "GENEHMIGT");
          const summeGewicht = genehmigt.reduce((s, n) => s + n.gewichtung, 0);
          const schnitt = summeGewicht > 0 ? genehmigt.reduce((s, n) => s + n.note * n.gewichtung, 0) / summeGewicht : null;
          return (
            <details key={f.id} className="card">
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                <span>{f.name}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  {schnitt !== null ? `Ø ${schnitt.toFixed(2)} · ${genehmigt.length} Note(n)` : "noch keine genehmigte Note"}
                </span>
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {notenDesFachs.map((n) =>
                  neueinreichungId === n.id ? (
                    <div key={n.id} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <select value={neueinreichungNote} onChange={(e) => setNeueinreichungNote(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <option key={v} value={v}>
                            Note {v}
                          </option>
                        ))}
                      </select>
                      <input placeholder="Notiz (optional)" value={neueinreichungNotiz} onChange={(e) => setNeueinreichungNotiz(e.target.value)} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn"
                          style={{ padding: "6px 10px" }}
                          onClick={() =>
                            startTransition(async () => {
                              await erneutEinreichen(n.id, { note: neueinreichungNote, notiz: neueinreichungNotiz || undefined });
                              setNeueinreichungId(null);
                            })
                          }
                        >
                          Erneut einreichen
                        </button>
                        <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setNeueinreichungId(null)}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {n.fotoBase64 && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={n.fotoBase64}
                            alt="Notenzettel"
                            style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                            onClick={() => setGrossesBild(n.fotoBase64)}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            Note {n.note} <span className={`pill pill-${n.status.toLowerCase()}`}>{n.status}</span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                            {ART_LABEL[n.art]} · {new Date(n.datum).toLocaleDateString("de-DE")}
                            {n.gewichtung !== 1 && ` · Gewichtung ${n.gewichtung}`}
                            {n.notiz && ` · „${n.notiz}"`}
                          </div>
                          {istEltern && <HistorieVerlauf entityTyp="NOTE" entityId={n.id} />}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {n.status === "ABGELEHNT" && kind.id === eigeneId && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12 }}
                            onClick={() => {
                              setNeueinreichungId(n.id);
                              setNeueinreichungNote(n.note);
                              setNeueinreichungNotiz(n.notiz ?? "");
                            }}
                          >
                            Erneut einreichen
                          </button>
                        )}
                        {istEltern && (
                          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startTransition(() => loescheNote(n.id))}>
                            Löschen
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </details>
          );
        })}
        {kind.noten.length === 0 && <p style={{ color: "var(--text-muted)" }}>Noch keine Noten.</p>}
      </div>

      <details>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Verlauf Taschengeld</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {kind.taschengeld.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{t.grund ?? t.typ}</span>
              <span style={{ color: t.typ === "GUTSCHRIFT" ? "var(--success)" : "var(--danger)" }}>
                {t.typ === "GUTSCHRIFT" ? "+" : "-"}
                {t.betrag.toFixed(2)} €
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
