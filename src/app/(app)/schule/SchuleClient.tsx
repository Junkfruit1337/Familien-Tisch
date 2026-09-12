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
  erkenneNoteAusText,
  erkenneSchulEintragAusText,
} from "./actions";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import Spracheingabe from "@/components/Spracheingabe";
import { erkenneSparzielIcon } from "@/lib/sparzielIcon";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

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
type FerienEintrag = { typ: string; start: string; ende: string; tageBis: number };
type FerienUebersicht = { bundesland: string; schuljahr: string; ferien: FerienEintrag[]; naechste: FerienEintrag | null } | null;
type Kind = {
  id: string;
  name: string;
  farbe: string;
  bundesland: string | null;
  klassenstufe: number | null;
  klasse: string | null;
  faecher: { id: string; name: string }[];
  noten: Note[];
  kontostand: number;
  taschengeld: Transaktion[];
  sparziel: { bezeichnung: string; zielbetrag: number } | null;
  ferien: FerienUebersicht;
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
  KLASSENARBEIT: "Arbeit",
  HAUSAUFGABEN_KONTROLLE: "HÜ",
  EPOCHALNOTE: "Epo",
};

const FERIEN_LABEL: Record<string, string> = {
  HERBST: "Herbstferien",
  WEIHNACHTEN: "Weihnachtsferien",
  WINTER: "Winterferien",
  OSTERN: "Osterferien",
  PFINGSTEN: "Pfingstferien",
  SOMMER: "Sommerferien",
};

// Schuljahr-Grenze für die Durchschnittsnote (Fix-Batch 27) — bundesweit einheitlich
// 1. August – 31. Juli (siehe aktuellesSchuljahr() in schule/actions.ts, hier dupliziert
// als kleine reine Funktion, da Server-Action-Dateien nicht direkt in Client-Komponenten
// importiert werden können).
function istImLaufendenSchuljahr(datumIso: string): boolean {
  const datum = new Date(datumIso);
  const jetzt = new Date();
  const startJahr = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
  const start = new Date(startJahr, 7, 1);
  const ende = new Date(startJahr + 1, 6, 31, 23, 59, 59);
  return datum >= start && datum <= ende;
}

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

// Klassenstufe + Klasse kombiniert anzeigen (z. B. "6c" statt nur "c") — Florians
// Korrektur: vorher wurde bei vorhandenem Klassen-Buchstaben die Klassenstufe verschluckt.
function klasseAnzeige(klassenstufe: number | null, klasse: string | null): string | null {
  if (!klassenstufe && !klasse) return null;
  return `Klasse ${klassenstufe ?? ""}${klasse ?? ""}`;
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
  eintraege,
}: {
  istEltern: boolean;
  eigeneId: string;
  kinder: { id: string; name: string; farbe: string; faecher: { id: string; name: string }[] }[];
  eintraege: SchulEintrag[];
}) {
  const [pending, startTransition] = useTransition();
  const [zeigeForm, setZeigeForm] = useState(false);
  const [thema, setThema] = useState("");
  const [fachName, setFachName] = useState("");
  const [art, setArt] = useState("KLASSENARBEIT");
  const [datum, setDatum] = useState("");
  const [ausgewaehlteKinder, setAusgewaehlteKinder] = useState<string[]>(istEltern ? [] : [eigeneId]);
  const [filterKindId, setFilterKindId] = useState<string>("alle");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bearbeitenThema, setBearbeitenThema] = useState("");
  const [bearbeitenDatum, setBearbeitenDatum] = useState("");
  const [spracheVerarbeitung, setSpracheVerarbeitung] = useState(false);

  function toggleKind(id: string) {
    setAusgewaehlteKinder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Fächer der aktuell ausgewählten Kinder (bei Eltern: nur wenn welche angehakt sind;
  // sonst — bzw. beim Kind selbst — automatisch dessen eigene Fächer), als echtes Dropdown
  // statt freiem Text (Fix-Batch 30). Nach Name dedupliziert, da mehrere Kinder dasselbe
  // Fach unter je eigener ID haben.
  const relevanteKinder = istEltern && ausgewaehlteKinder.length > 0 ? kinder.filter((k) => ausgewaehlteKinder.includes(k.id)) : kinder;
  const faecherOptionen = useMemo(() => {
    const namen = new Map<string, { id: string; name: string }>();
    for (const k of relevanteKinder) for (const f of k.faecher) if (!namen.has(f.name)) namen.set(f.name, f);
    return [...namen.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [istEltern, ausgewaehlteKinder, kinder]);

  async function spracheErkannt(text: string) {
    setSpracheVerarbeitung(true);
    try {
      const ergebnis = await erkenneSchulEintragAusText(text, faecherOptionen);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      const e = ergebnis.eintrag;
      setZeigeForm(true);
      setThema(e.thema);
      setArt(e.art);
      setDatum(e.datum ?? "");
      if (e.fachId) {
        const f = faecherOptionen.find((x) => x.id === e.fachId);
        if (f) setFachName(f.name);
      }
      if (istEltern && e.personIds.length > 0) setAusgewaehlteKinder(e.personIds);
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  const sichtbareEintraege = eintraege.filter((e) => filterKindId === "alle" || e.personId === filterKindId);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>🎓 Arbeiten &amp; HÜs</strong>
        {!istEltern && (
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setZeigeForm((v) => !v)}>
            {zeigeForm ? "Abbrechen" : "+ Eintrag"}
          </button>
        )}
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

      {!istEltern && zeigeForm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}

          <select value={fachName} onChange={(e) => setFachName(e.target.value)}>
            <option value="">Fach wählen (optional)</option>
            {faecherOptionen.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <input placeholder="Thema (z. B. Bruchrechnung)" value={thema} onChange={(e) => setThema(e.target.value)} />
          <select value={art} onChange={(e) => setArt(e.target.value)}>
            <option value="KLASSENARBEIT">Arbeit</option>
            <option value="HAUSAUFGABEN_KONTROLLE">HÜ</option>
          </select>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />

          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!thema || !datum) return;
                await createSchulEintrag({
                  thema,
                  fachName: fachName || undefined,
                  art,
                  datum,
                });
                setThema("");
                setFachName("");
                setDatum("");
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
                  <input value={bearbeitenThema} onChange={(ev) => setBearbeitenThema(ev.target.value)} placeholder="Thema" />
                  <input type="date" value={bearbeitenDatum} onChange={(ev) => setBearbeitenDatum(ev.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      style={{ padding: "6px 10px" }}
                      onClick={() =>
                        startTransition(async () => {
                          await updateSchulEintrag(e.id, { thema: bearbeitenThema, datum: bearbeitenDatum });
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
                            setBearbeitenThema(e.titel);
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
}: {
  istEltern: boolean;
  eigeneId: string;
  kinder: Kind[];
  schulEintraege: SchulEintrag[];
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
  const [spracheVerarbeitung, setSpracheVerarbeitung] = useState(false);
  // Deep-Link vom Dashboard aus (Fix-Batch 49): "?highlight=<id>" springt direkt zur
  // passenden Note und lässt sie kurz blinken, statt die lange Liste durchsuchen zu müssen.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("highlight");
    if (!id) return;
    setHighlightId(id);
    const timer = setTimeout(() => {
      document.getElementById(`note-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (!kind) return <p>Noch keine Kinder angelegt.</p>;

  // Fix-Batch 51: "Noten zur Genehmigung" folgt jetzt der Kind-Auswahl oben (vorher wurden
  // hier immer ALLE Kinder gepoolt angezeigt, unabhängig vom ausgewählten Reiter).
  const offeneNoten = istEltern ? kind.noten.filter((n) => n.status === "OFFEN").map((n) => ({ ...n, kindName: kind.name })) : [];

  async function spracheErkannt(text: string) {
    setSpracheVerarbeitung(true);
    try {
      const ergebnis = await erkenneNoteAusText(text, kind.id);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      const n = ergebnis.note;
      if (n.fachId) setFachId(n.fachId);
      setArt(n.art);
      if (n.note) setNoteWert(n.note);
      setDatum(n.datum ?? new Date().toISOString().slice(0, 10));
      setNotiz(n.notiz ?? "");
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  async function jetztEinreichen() {
    if (!fachId) return;
    if (!notiz.trim()) {
      alert("Bitte das Thema der Arbeit/Kontrolle angeben.");
      return;
    }
    if (!foto) {
      alert("Bitte ein Foto vom Notenzettel mit der Kamera aufnehmen.");
      return;
    }
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
      <SeitenTitel icon="🎓" farbe={BEREICH_FARBEN.schule}>Schule &amp; Taschengeld</SeitenTitel>
      {(kind.klasse || kind.klassenstufe) && (
        <p style={{ margin: "-8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          {klasseAnzeige(kind.klassenstufe, kind.klasse)}
          {kind.bundesland ? ` · ${kind.bundesland}` : ""}
        </p>
      )}

      {feier && <Feier onEnde={() => setFeier(false)} />}
      {grossesBild && <BildModal src={grossesBild} onClose={() => setGrossesBild(null)} />}

      <SchulEintraegeSektion
        istEltern={istEltern}
        eigeneId={eigeneId}
        kinder={kinder.map((k) => ({ id: k.id, name: k.name, farbe: k.farbe, faecher: k.faecher }))}
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
              {k.klasse || k.klassenstufe ? ` (${k.klassenstufe ?? ""}${k.klasse ?? ""})` : ""}
            </button>
          ))}
        </div>
      )}

      {istEltern && offeneNoten.length > 0 && (
        <div className="card">
          <strong>Noten zur Genehmigung</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {offeneNoten.map((n) => (
              <div
                key={n.id}
                id={`note-${n.id}`}
                className={n.id === highlightId ? "highlight-blink" : undefined}
                style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}
              >
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {n.fotoBase64 && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.fotoBase64}
                          alt="Notenzettel"
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}
                          onClick={() => setGrossesBild(n.fotoBase64)}
                        />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>
                          {(n as any).kindName} — {n.fachName}: Note {n.note}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {ART_LABEL[n.art]} · {new Date(n.datum).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        {n.notiz && <span style={{ fontSize: 13 }}>Thema: „{n.notiz}"</span>}
                      </div>
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
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: BEREICH_FARBEN.schule,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 34, lineHeight: 1 }}>{erkenneSparzielIcon(kind.sparziel.bezeichnung)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                <span>{kind.sparziel.bezeichnung}</span>
                <span>
                  {kind.kontostand.toFixed(2)} / {kind.sparziel.zielbetrag} €
                </span>
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
          </div>
        )}
        {(istEltern || kind.id === eigeneId) && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Sparziel bearbeiten</summary>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Wofür sparst du?</span>
                <input placeholder="z. B. Fahrrad" value={zielBezeichnung} onChange={(e) => setZielBezeichnung(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Zielbetrag in €</span>
                <input type="number" placeholder="z. B. 150" value={zielBetrag} onChange={(e) => setZielBetrag(e.target.value)} />
              </label>
              {zielBezeichnung.trim() && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                  <span>Vorschau-Icon:</span>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: BEREICH_FARBEN.schule,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{erkenneSparzielIcon(zielBezeichnung)}</span>
                  </div>
                </div>
              )}
              <button
                className="btn"
                style={{ alignSelf: "flex-start" }}
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
          <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
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
          <input placeholder="Thema (Pflichtfeld, z. B. Bruchrechnung)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            📷 Foto vom Notenzettel (Pflicht — muss mit der Kamera aufgenommen werden, kein Galerie-Bild)
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
          // Durchschnitt zählt nur Noten des laufenden Schuljahres (Fix-Batch 27) —
          // ältere Noten bleiben in der Liste sichtbar, fließen aber nicht mehr in den Ø ein.
          const genehmigt = notenDesFachs.filter((n) => n.status === "GENEHMIGT" && istImLaufendenSchuljahr(n.datum));
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
                  ) : korrekturId === n.id ? (
                    <div key={n.id} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <select value={korrekturNote} onChange={(e) => setKorrekturNote(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <option key={v} value={v}>
                            Note {v}
                          </option>
                        ))}
                      </select>
                      <input placeholder="Thema" value={korrekturNotiz} onChange={(e) => setKorrekturNotiz(e.target.value)} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn"
                          style={{ padding: "6px 10px" }}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await korrigiereNote(n.id, { note: korrekturNote, notiz: korrekturNotiz || undefined });
                                setKorrekturId(null);
                              } catch (e: any) {
                                alert(e.message);
                              }
                            })
                          }
                        >
                          Speichern
                        </button>
                        <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setKorrekturId(null)}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <details key={n.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          listStyle: "none",
                          display: "grid",
                          gridTemplateColumns: "28px 1fr auto",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{n.note}</span>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {ART_LABEL[n.art]} · {new Date(n.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          {n.fotoBase64 ? " · 📷" : ""}
                        </span>
                        <span className={`pill pill-${n.status.toLowerCase()}`}>{n.status}</span>
                      </summary>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, paddingLeft: 2 }}>
                        {n.fotoBase64 && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={n.fotoBase64}
                            alt="Notenzettel"
                            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => setGrossesBild(n.fotoBase64)}
                          />
                        )}
                        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {n.gewichtung !== 1 && <div>Gewichtung {n.gewichtung}</div>}
                          {n.notiz && <div>Thema: „{n.notiz}"</div>}
                        </div>
                        {istEltern && <HistorieVerlauf entityTyp="NOTE" entityId={n.id} />}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                          {n.status === "OFFEN" && !istEltern && kind.id === eigeneId && (
                            <>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 12 }}
                                onClick={() => {
                                  setKorrekturId(n.id);
                                  setKorrekturNote(n.note);
                                  setKorrekturNotiz(n.notiz ?? "");
                                }}
                              >
                                ✎ Bearbeiten
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 12 }}
                                onClick={() => {
                                  if (confirm("Diese noch offene Note wirklich löschen?")) {
                                    startTransition(async () => {
                                      try {
                                        await loescheNote(n.id);
                                      } catch (e: any) {
                                        alert(e.message);
                                      }
                                    });
                                  }
                                }}
                              >
                                🗑 Löschen
                              </button>
                            </>
                          )}
                          {istEltern && (
                            <button
                              className="btn-secondary"
                              style={{ fontSize: 12 }}
                              onClick={() => {
                                if (confirm("Diese Note wirklich löschen?")) startTransition(() => loescheNote(n.id));
                              }}
                            >
                              🗑 Löschen
                            </button>
                          )}
                        </div>
                      </div>
                    </details>
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
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 8 }}>
              <span>
                {t.grund ?? t.typ}
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}> · {new Date(t.createdAt).toLocaleDateString("de-DE")}</span>
              </span>
              <span style={{ color: t.typ === "GUTSCHRIFT" ? "var(--success)" : "var(--danger)", flexShrink: 0 }}>
                {t.typ === "GUTSCHRIFT" ? "+" : "-"}
                {t.betrag.toFixed(2)} €
              </span>
            </div>
          ))}
        </div>
      </details>

      {kind.ferien ? (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>
            🏖️{" "}
            {kind.ferien.naechste
              ? kind.ferien.naechste.tageBis === 0
                ? `Heute beginnen die ${FERIEN_LABEL[kind.ferien.naechste.typ] ?? kind.ferien.naechste.typ}!`
                : `Noch ${kind.ferien.naechste.tageBis} Tag(e) bis zu den ${FERIEN_LABEL[kind.ferien.naechste.typ] ?? kind.ferien.naechste.typ}`
              : "Ferien dieses Schuljahres"}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Schuljahr {kind.ferien.schuljahr} · {kind.ferien.bundesland}
            </p>
            {kind.ferien.ferien.map((f) => (
              <div key={f.typ} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: f.tageBis < 0 ? 0.5 : 1 }}>
                <span style={{ fontSize: 14 }}>
                  {FERIEN_LABEL[f.typ] ?? f.typ}
                  <br />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {new Date(f.start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – {new Date(f.ende).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {f.tageBis < 0 ? "vorbei" : f.tageBis === 0 ? "heute!" : `noch ${f.tageBis} Tag(e)`}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : (
        !istEltern && (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Für den Ferien-Countdown bitte in den Einstellungen dein Bundesland auswählen.
          </p>
        )
      )}
    </div>
  );
}
