"use client";

import { useState, useTransition } from "react";
import { createAufgabe, toggleAufgabe, deleteAufgabe, erkenneAufgabeAusText } from "./actions";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import Spracheingabe from "@/components/Spracheingabe";
import SeitenTitel from "@/components/SeitenTitel";
import PersonChip from "@/components/PersonChip";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

type Aufgabe = {
  id: string;
  titel: string;
  faelligkeit: string | null;
  erledigt: boolean;
  personId: string | null;
  personName: string;
  seriesId: string | null;
};
type Person = { id: string; name: string; farbe: string };

const WIEDERHOLUNGEN = [
  { value: "KEINE", label: "Keine Wiederholung" },
  { value: "TAEGLICH", label: "Täglich" },
  { value: "WERKTAEGLICH", label: "Jeden Werktag (Mo–Fr)" },
  { value: "WOECHENTLICH", label: "Wöchentlich" },
  { value: "ZWEIWOECHENTLICH", label: "Alle 2 Wochen" },
  { value: "MONATLICH", label: "Monatlich" },
  { value: "ALLE_3_MONATE", label: "Alle 3 Monate" },
  { value: "JAEHRLICH", label: "Jährlich" },
];

export default function AufgabenClient({
  istEltern,
  eigeneId,
  aufgaben,
  personen,
}: {
  istEltern: boolean;
  eigeneId: string;
  aufgaben: Aufgabe[];
  personen: Person[];
}) {
  const [titel, setTitel] = useState("");
  const [faelligkeit, setFaelligkeit] = useState("");
  const [personIds, setPersonIds] = useState<string[]>(istEltern ? [] : [eigeneId]);
  const [wiederholung, setWiederholung] = useState("KEINE");
  const [wiederholungUnbegrenzt, setWiederholungUnbegrenzt] = useState(true);
  const [wiederholungBis, setWiederholungBis] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loeschAuswahl, setLoeschAuswahl] = useState<string | null>(null);
  const [spracheVerarbeitung, setSpracheVerarbeitung] = useState(false);
  // Redesign (Fix-Batch 57): Formular ist jetzt wie bei Kalender/Schule ein Auf-/Zuklapp-
  // Toggle statt einer immer offenen Karte — einheitliches "Neu anlegen"-Muster app-weit.
  const [zeigeFormular, setZeigeFormular] = useState(false);

  async function spracheErkannt(text: string) {
    setSpracheVerarbeitung(true);
    try {
      const ergebnis = await erkenneAufgabeAusText(text);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      const a = ergebnis.aufgabe;
      setTitel(a.titel);
      setFaelligkeit(a.datum ?? "");
      if (istEltern && a.personIds.length > 0) setPersonIds(a.personIds);
      setWiederholung(a.datum ? a.wiederholung : "KEINE");
      if (a.wiederholung !== "KEINE" && a.datum) {
        setWiederholungUnbegrenzt(!a.wiederholungBis);
        setWiederholungBis(a.wiederholungBis ?? "");
      } else {
        setWiederholungUnbegrenzt(true);
        setWiederholungBis("");
      }
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  function submit() {
    if (!titel) return;
    startTransition(async () => {
      await createAufgabe({
        titel,
        faelligkeit: faelligkeit || undefined,
        personIds,
        wiederholung,
        wiederholungBis: wiederholung !== "KEINE" && !wiederholungUnbegrenzt ? wiederholungBis : undefined,
      });
      setTitel("");
      setFaelligkeit("");
      setWiederholung("KEINE");
      setWiederholungUnbegrenzt(true);
      setWiederholungBis("");
      setZeigeFormular(false);
    });
  }

  function loeschKlick(a: Aufgabe) {
    if (a.seriesId) {
      setLoeschAuswahl(a.id);
    } else {
      startTransition(() => deleteAufgabe(a.id, "eins"));
    }
  }

  const sichtbar = aufgaben.filter((a) => !filter || a.personId === filter);
  const offen = sichtbar.filter((a) => !a.erledigt);
  const erledigt = sichtbar.filter((a) => a.erledigt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SeitenTitel icon="✅" farbe={BEREICH_FARBEN.aufgaben}>Aufgaben</SeitenTitel>
        <button className="btn" onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? "Abbrechen" : "+ Neue Aufgabe"}
        </button>
      </div>

      {zeigeFormular && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
          <input placeholder="Neue Aufgabe" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input type="date" value={faelligkeit} onChange={(e) => setFaelligkeit(e.target.value)} />
          {!faelligkeit && (
            <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              ℹ️ Ohne Fälligkeitsdatum erscheint diese Aufgabe nicht im Kalender.
            </p>
          )}
          {istEltern && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Für wen?</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-base)" }}>
                <input type="checkbox" checked={personIds.length === 0} onChange={() => setPersonIds([])} />
                Familie (alle)
              </label>
              {personen.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-base)" }}>
                  <input
                    type="checkbox"
                    checked={personIds.includes(p.id)}
                    onChange={() =>
                      setPersonIds((prev) => (prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]))
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <select value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} disabled={!faelligkeit}>
            {WIEDERHOLUNGEN.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          {wiederholung !== "KEINE" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-base)" }}>
                <input type="checkbox" checked={wiederholungUnbegrenzt} onChange={(e) => setWiederholungUnbegrenzt(e.target.checked)} />
                Unbegrenzt wiederholen
              </label>
              {!wiederholungUnbegrenzt && (
                <div>
                  <label style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Wiederholen bis</label>
                  <input type="date" value={wiederholungBis} onChange={(e) => setWiederholungBis(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <button className="btn" disabled={pending} onClick={submit}>
            Hinzufügen
          </button>
        </div>
      )}

      {istEltern && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            style={{ background: !filter ? "var(--accent)" : undefined, color: !filter ? "var(--accent-contrast)" : undefined }}
            onClick={() => setFilter(null)}
          >
            Alle
          </button>
          {personen.map((p) => (
            <button
              key={p.id}
              className="btn-secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: filter === p.id ? p.farbe : undefined,
                color: filter === p.id ? "#fff" : undefined,
                borderColor: filter === p.id ? p.farbe : undefined,
              }}
              onClick={() => setFilter(p.id)}
            >
              {filter !== p.id && <PersonChip name={p.name} farbe={p.farbe} size={16} />}
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {offen.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              type="checkbox"
              checked={false}
              onChange={() => startTransition(() => toggleAufgabe(a.id))}
              style={{ width: 20, height: 20, marginTop: 2 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {a.titel}
                {a.seriesId && " 🔁"}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {a.faelligkeit ? new Date(a.faelligkeit).toLocaleDateString("de-DE") : "ohne Fälligkeit"} · {a.personName}
              </div>
              {loeschAuswahl === a.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", fontSize: 12 }}>
                  <span>Nur diese oder die ganze Serie löschen?</span>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    onClick={() => {
                      startTransition(() => deleteAufgabe(a.id, "eins"));
                      setLoeschAuswahl(null);
                    }}
                  >
                    Nur diese
                  </button>
                  <button
                    className="btn-danger"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    onClick={() => {
                      startTransition(() => deleteAufgabe(a.id, "serie"));
                      setLoeschAuswahl(null);
                    }}
                  >
                    Ganze Serie
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setLoeschAuswahl(null)}>
                    Abbrechen
                  </button>
                </div>
              ) : (
                istEltern && <HistorieVerlauf entityTyp="AUFGABE" entityId={a.id} />
              )}
            </div>
            {(istEltern || a.personId === eigeneId) && loeschAuswahl !== a.id && (
              <button
                className="btn-icon btn-icon-danger"
                title="Aufgabe löschen"
                onClick={() => {
                  if (a.seriesId) {
                    loeschKlick(a);
                    return;
                  }
                  if (confirm(`"${a.titel}" wirklich löschen?`)) loeschKlick(a);
                }}
              >
                🗑
              </button>
            )}
          </div>
        ))}
        {offen.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">🎉</span>
            <span>Keine offenen Aufgaben.</span>
          </div>
        )}
      </div>

      {erledigt.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Erledigt ({erledigt.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {erledigt.map((a) => (
              <div key={a.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                <input type="checkbox" checked onChange={() => startTransition(() => toggleAufgabe(a.id))} style={{ width: 20, height: 20 }} />
                <div style={{ flex: 1, textDecoration: "line-through" }}>{a.titel}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
