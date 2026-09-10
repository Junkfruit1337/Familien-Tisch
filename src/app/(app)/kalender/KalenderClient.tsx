"use client";

import { useMemo, useState, useTransition } from "react";
import { createTermin, deleteTermin } from "./actions";

type Termin = {
  id: string;
  typ: "termin" | "aufgabe";
  titel: string;
  start: string;
  ende: string | null;
  ganztaegig: boolean;
  kategorie: string;
  personId: string | null;
  personName: string;
  personFarbe: string;
  erledigt: boolean;
};
type Person = { id: string; name: string; farbe: string };

const KATEGORIEN = [
  { value: "TERMIN", label: "Termin" },
  { value: "HOBBY", label: "Hobby" },
  { value: "AUSFLUG", label: "Ausflug" },
];

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function isoDatum(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoVonDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonate(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export default function KalenderClient({
  istEltern,
  eigeneId,
  termine,
  personen,
}: {
  istEltern: boolean;
  eigeneId: string;
  termine: Termin[];
  personen: Person[];
}) {
  const [ansicht, setAnsicht] = useState<"liste" | "monat">("monat");
  const [monatsDatum, setMonatsDatum] = useState(() => new Date());
  const [ausgewaehlterTag, setAusgewaehlterTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [nurZukunft, setNurZukunft] = useState(true);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [pending, startTransition] = useTransition();

  const [titel, setTitel] = useState("");
  const [start, setStart] = useState("");
  const [kategorie, setKategorie] = useState("TERMIN");
  const [personId, setPersonId] = useState<string>(istEltern ? "" : eigeneId);

  const gefiltert = useMemo(() => {
    const jetzt = new Date();
    return termine
      .filter((t) => !filter || t.personId === filter)
      .filter((t) => !nurZukunft || ausgewaehlterTag || new Date(t.start) >= new Date(jetzt.toDateString()))
      .filter((t) => !ausgewaehlterTag || isoDatum(t.start) === ausgewaehlterTag);
  }, [termine, filter, nurZukunft, ausgewaehlterTag]);

  const monatsZellen = useMemo(() => {
    const jahr = monatsDatum.getFullYear();
    const monat = monatsDatum.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    const montagOffset = (ersterTag.getDay() + 6) % 7; // 0 = Montag
    const start0 = new Date(jahr, monat, 1 - montagOffset);
    const heuteIso = isoVonDate(new Date());

    const zellen = [];
    for (let i = 0; i < 42; i++) {
      const datum = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i);
      const iso = isoVonDate(datum);
      const eintraege = termine.filter((t) => (!filter || t.personId === filter) && isoDatum(t.start) === iso);
      zellen.push({ iso, tag: datum.getDate(), imMonat: datum.getMonth() === monat, heute: iso === heuteIso, eintraege });
    }
    return zellen;
  }, [monatsDatum, termine, filter]);

  function submit() {
    if (!titel || !start) return;
    startTransition(async () => {
      await createTermin({
        titel,
        start,
        ganztaegig: false,
        kategorie,
        personId: personId || null,
      });
      setTitel("");
      setStart("");
      setZeigeFormular(false);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Kalender</h1>
        <button className="btn" onClick={() => setZeigeFormular((v) => !v)}>
          + Neuer Termin
        </button>
      </div>

      {zeigeFormular && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>Datum &amp; Uhrzeit</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <select value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            {KATEGORIEN.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {istEltern && (
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Familie (alle)</option>
              {personen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn" disabled={pending} onClick={submit}>
            Speichern
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn-secondary"
          style={{ background: ansicht === "monat" ? "var(--accent)" : undefined, color: ansicht === "monat" ? "#fff" : undefined }}
          onClick={() => setAnsicht("monat")}
        >
          Monat
        </button>
        <button
          className="btn-secondary"
          style={{ background: ansicht === "liste" ? "var(--accent)" : undefined, color: ansicht === "liste" ? "#fff" : undefined }}
          onClick={() => setAnsicht("liste")}
        >
          Liste
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn-secondary"
          style={{ background: !filter ? "var(--accent)" : undefined, color: !filter ? "#fff" : undefined }}
          onClick={() => setFilter(null)}
        >
          Alle
        </button>
        {personen.map((p) => (
          <button
            key={p.id}
            className="btn-secondary"
            style={{ background: filter === p.id ? p.farbe : undefined, color: filter === p.id ? "#fff" : undefined }}
            onClick={() => setFilter(p.id)}
          >
            {p.name}
          </button>
        ))}
        {ansicht === "liste" && (
          <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
            <input type="checkbox" checked={nurZukunft} onChange={(e) => setNurZukunft(e.target.checked)} style={{ width: "auto" }} />
            Vergangene ausblenden
          </label>
        )}
      </div>

      {ansicht === "monat" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setMonatsDatum((d) => addMonate(d, -1))}>
              ‹
            </button>
            <strong style={{ textTransform: "capitalize" }}>
              {monatsDatum.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
            </strong>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setMonatsDatum((d) => addMonate(d, 1))}>
              ›
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            {WOCHENTAGE.map((t) => (
              <div key={t} style={{ textAlign: "center" }}>
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {monatsZellen.map((zelle) => (
              <button
                key={zelle.iso}
                onClick={() => setAusgewaehlterTag((cur) => (cur === zelle.iso ? null : zelle.iso))}
                style={{
                  aspectRatio: "1",
                  minWidth: 0,
                  border: zelle.iso === ausgewaehlterTag ? "2px solid var(--accent)" : zelle.heute ? "2px solid var(--accent)" : "1px solid rgba(128,128,128,0.25)",
                  borderRadius: 8,
                  background: "transparent",
                  color: "inherit",
                  opacity: zelle.imMonat ? 1 : 0.35,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  padding: 2,
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              >
                <span>{zelle.tag}</span>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                  {zelle.eintraege.slice(0, 4).map((e) => (
                    <span
                      key={e.id}
                      style={{ width: 6, height: 6, borderRadius: "50%", background: e.personFarbe, display: "inline-block" }}
                    />
                  ))}
                  {zelle.eintraege.length > 4 && <span style={{ fontSize: 9 }}>+{zelle.eintraege.length - 4}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {ausgewaehlterTag && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span>
            Zeige nur:{" "}
            {new Date(ausgewaehlterTag + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
          </span>
          <button className="btn-secondary" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setAusgewaehlterTag(null)}>
            Filter aufheben
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gefiltert.length === 0 && <p style={{ color: "var(--text-muted)" }}>Keine Termine.</p>}
        {gefiltert.map((t) => (
          <div
            key={t.id}
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              opacity: t.typ === "aufgabe" && t.erledigt ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, textDecoration: t.typ === "aufgabe" && t.erledigt ? "line-through" : undefined }}>
                {t.typ === "aufgabe" ? "📌 " : ""}
                {t.titel}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {t.typ === "aufgabe"
                  ? `Fällig: ${new Date(t.start).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}`
                  : new Date(t.start).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {" · "}
                <span style={{ color: t.personFarbe, fontWeight: 600 }}>{t.personName}</span>
                {t.typ === "aufgabe" && <span> · Aufgabe</span>}
              </div>
            </div>
            {t.typ === "termin" && (istEltern || t.personId === eigeneId) && (
              <button
                className="btn-secondary"
                style={{ fontSize: 13 }}
                onClick={() => {
                  if (confirm(`"${t.titel}" wirklich löschen?`)) {
                    startTransition(() => deleteTermin(t.id));
                  }
                }}
              >
                Löschen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
