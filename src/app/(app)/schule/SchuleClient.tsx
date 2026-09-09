"use client";

import { useMemo, useState, useTransition } from "react";
import { addFach, einreichenNote, entscheideNote, loescheNote, auszahlen, setSparziel } from "./actions";

type Note = { id: string; fachName: string; art: string; note: number; datum: string; status: string; notiz: string | null };
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

const ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Klassenarbeit",
  HAUSAUFGABEN_KONTROLLE: "Hausaufgaben-Kontrolle",
  EPOCHALNOTE: "Epochalnote",
};

export default function SchuleClient({ istEltern, eigeneId, kinder }: { istEltern: boolean; eigeneId: string; kinder: Kind[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState(kinder[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const kind = useMemo(() => kinder.find((k) => k.id === ausgewaehlt) ?? kinder[0], [kinder, ausgewaehlt]);

  const [neuesFach, setNeuesFach] = useState("");
  const [fachId, setFachId] = useState("");
  const [art, setArt] = useState("KLASSENARBEIT");
  const [noteWert, setNoteWert] = useState(1);
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [auszahlBetrag, setAuszahlBetrag] = useState("");
  const [zielBezeichnung, setZielBezeichnung] = useState(kind?.sparziel?.bezeichnung ?? "");
  const [zielBetrag, setZielBetrag] = useState(kind?.sparziel?.zielbetrag?.toString() ?? "");

  if (!kind) return <p>Noch keine Kinder angelegt.</p>;

  const offeneNoten = istEltern ? kinder.flatMap((k) => k.noten.filter((n) => n.status === "OFFEN").map((n) => ({ ...n, kindName: k.name }))) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Schule &amp; Taschengeld</h1>

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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {offeneNoten.map((n) => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {(n as any).kindName} — {n.fachName}: Note {n.note} ({ART_LABEL[n.art]})
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" style={{ padding: "6px 10px" }} onClick={() => startTransition(() => entscheideNote(n.id, true))}>
                    ✓
                  </button>
                  <button className="btn-danger" style={{ padding: "6px 10px", borderRadius: 10, border: "none" }} onClick={() => startTransition(() => entscheideNote(n.id, false))}>
                    ✕
                  </button>
                </div>
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
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!fachId) return;
                await einreichenNote({ fachId, art, note: noteWert, datum });
              })
            }
          >
            Eintragen
          </button>

          <details>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Fach hinzufügen</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
          </details>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Noten</strong>
        {kind.noten.map((n) => (
          <div key={n.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {n.fachName}: Note {n.note} <span className={`pill pill-${n.status.toLowerCase()}`}>{n.status}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {ART_LABEL[n.art]} · {new Date(n.datum).toLocaleDateString("de-DE")}
              </div>
            </div>
            {istEltern && (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startTransition(() => loescheNote(n.id))}>
                Löschen
              </button>
            )}
          </div>
        ))}
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
