"use client";

import { useMemo, useState, useTransition } from "react";
import { createTermin, updateTermin, deleteTermin, erkenneTerminAusText } from "./actions";
import { erkenneTerminKategorie, TERMIN_KATEGORIE_LABEL } from "@/lib/terminkategorisierung";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import Spracheingabe from "@/components/Spracheingabe";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

type PersonKurz = { id: string; name: string; farbe: string };
type Termin = {
  id: string;
  ids: string[];
  typ: "termin" | "aufgabe" | "schule" | "geburtstag";
  titel: string;
  start: string;
  ende: string | null;
  ganztaegig: boolean;
  kategorie: string;
  personen: PersonKurz[];
  erledigt: boolean;
  seriesId: string | null;
  gruppeId: string | null;
  erstelltVonId: string | null;
};
type Person = { id: string; name: string; farbe: string };

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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

function addTage(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function wochenStart(d: Date): Date {
  const montagOffset = (d.getDay() + 6) % 7; // 0 = Montag
  return addTage(d, -montagOffset);
}

function personenLabel(personen: PersonKurz[]): string {
  return personen.length > 0 ? personen.map((p) => p.name).join(", ") : "Familie";
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
  const [ansicht, setAnsicht] = useState<"liste" | "monat" | "woche" | "tag">("monat");
  const [monatsDatum, setMonatsDatum] = useState(() => new Date());
  const [wochenDatum, setWochenDatum] = useState(() => wochenStart(new Date()));
  const [tagesDatum, setTagesDatum] = useState(() => new Date());
  const [ausgewaehlterTag, setAusgewaehlterTag] = useState<string | null>(null);
  // Nur für Eltern relevant — Kinder sehen ohnehin nur ihre eigenen + familienweite
  // Einträge, ein Personen-Filter ergäbe für sie keinen Sinn (Fix-Batch 30).
  const [filter, setFilter] = useState<string[]>([]);
  const [nurZukunft, setNurZukunft] = useState(true);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const [loeschAuswahl, setLoeschAuswahl] = useState<{ id: string; titel: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [titel, setTitel] = useState("");
  const [start, setStart] = useState("");
  const [ganztaegig, setGanztaegig] = useState(false);
  const [personIds, setPersonIds] = useState<string[]>(istEltern ? [] : [eigeneId]);
  const [wiederholung, setWiederholung] = useState("KEINE");
  const [wiederholungBis, setWiederholungBis] = useState("");
  const [spracheVerarbeitung, setSpracheVerarbeitung] = useState(false);
  const erkannteKategorie = useMemo(() => erkenneTerminKategorie(titel), [titel]);

  function passtFilter(t: Termin): boolean {
    // Geburtstage gehören der ganzen Familie, keiner einzelnen Person — sollen daher nie
    // durch den Personen-Filter ausgeblendet werden (Florians Ticket "Lösung für Geburtstage").
    if (t.typ === "geburtstag") return true;
    if (filter.length === 0) return true;
    return t.personen.some((p) => filter.includes(p.id));
  }

  const gefiltert = useMemo(() => {
    const jetzt = new Date();
    const heuteMitternacht = new Date(jetzt.toDateString());
    const liste = termine
      .filter(passtFilter)
      .filter((t) => !nurZukunft || ausgewaehlterTag || new Date(t.start) >= heuteMitternacht)
      .filter((t) => !ausgewaehlterTag || isoDatum(t.start) === ausgewaehlterTag);

    // Geburtstage werden serverseitig für mehrere Jahre (letztes bis +5) vorausberechnet, damit
    // sie im Monats-/Wochen-/Tag-Raster an ihrem jeweiligen Datum erscheinen — in der flachen
    // "Liste"-Ansicht (kein einzelner Tag ausgewählt) würde das sonst dieselbe Person mit
    // bis zu 7 Zeilen gleichzeitig auflisten (Ticket "Geburtstage werden mehrfach angezeigt").
    // Hier deshalb pro Person nur den nächsten (oder, falls keiner mehr aussteht, jüngsten
    // vergangenen) Termin behalten — aber nur, wenn kein einzelner Tag ausgewählt ist (sonst
    // soll genau der Geburtstag DIESES Tages erscheinen, egal ob "repräsentativ" oder nicht).
    if (ausgewaehlterTag) return liste;
    const naechsterGeburtstagProPerson = new Map<string, Termin>();
    for (const t of liste) {
      if (t.typ !== "geburtstag") continue;
      const key = t.personen[0]?.name ?? t.id;
      const bisher = naechsterGeburtstagProPerson.get(key);
      if (!bisher) {
        naechsterGeburtstagProPerson.set(key, t);
        continue;
      }
      const istZukunft = (x: Termin) => new Date(x.start) >= heuteMitternacht;
      if (istZukunft(t) && (!istZukunft(bisher) || new Date(t.start) < new Date(bisher.start))) {
        naechsterGeburtstagProPerson.set(key, t);
      } else if (!istZukunft(t) && !istZukunft(bisher) && new Date(t.start) > new Date(bisher.start)) {
        naechsterGeburtstagProPerson.set(key, t);
      }
    }
    const behalteneGeburtstagIds = new Set(Array.from(naechsterGeburtstagProPerson.values()).map((t) => t.id));

    return liste.filter((t) => t.typ !== "geburtstag" || behalteneGeburtstagIds.has(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const eintraege = termine.filter((t) => passtFilter(t) && isoDatum(t.start) === iso);
      zellen.push({ iso, tag: datum.getDate(), imMonat: datum.getMonth() === monat, heute: iso === heuteIso, eintraege });
    }
    return zellen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monatsDatum, termine, filter]);

  const wochenTage = useMemo(() => {
    const heuteIso = isoVonDate(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const datum = addTage(wochenDatum, i);
      const iso = isoVonDate(datum);
      const eintraege = termine
        .filter((t) => passtFilter(t) && isoDatum(t.start) === iso)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return { iso, datum, heute: iso === heuteIso, eintraege };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wochenDatum, termine, filter]);

  const tagesEintraege = useMemo(() => {
    const iso = isoVonDate(tagesDatum);
    return termine
      .filter((t) => passtFilter(t) && isoDatum(t.start) === iso)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagesDatum, termine, filter]);

  function formularZuruecksetzen() {
    setTitel("");
    setStart("");
    setGanztaegig(false);
    setWiederholung("KEINE");
    setWiederholungBis("");
    setZeigeFormular(false);
    setBearbeitenId(null);
  }

  function bearbeitenStarten(t: Termin) {
    setBearbeitenId(t.id);
    setTitel(t.titel);
    setGanztaegig(t.ganztaegig);
    setStart(t.ganztaegig ? isoDatum(t.start) : t.start.slice(0, 16));
    setWiederholung("KEINE");
    setWiederholungBis("");
    setZeigeFormular(true);
  }

  async function spracheErkannt(text: string) {
    setSpracheVerarbeitung(true);
    try {
      const ergebnis = await erkenneTerminAusText(text);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      const t = ergebnis.termin;
      setZeigeFormular(true);
      setBearbeitenId(null);
      setTitel(t.titel);
      const datum = t.datum ?? isoVonDate(new Date());
      // Keine Uhrzeit erkannt → als ganztägig übernehmen statt eine Uhrzeit zu erfinden.
      setGanztaegig(!t.uhrzeit);
      setStart(t.uhrzeit ? `${datum}T${t.uhrzeit}` : datum);
      if (istEltern && t.personIds.length > 0) setPersonIds(t.personIds);
      setWiederholung(t.wiederholung);
      setWiederholungBis(t.wiederholungBis ?? "");
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  function submit() {
    if (!titel || !start) return;
    startTransition(async () => {
      const startWert = ganztaegig ? `${start}T00:00` : start;
      if (bearbeitenId) {
        await updateTermin(bearbeitenId, { titel, start: startWert });
      } else {
        await createTermin({
          titel,
          start: startWert,
          ganztaegig,
          personIds,
          wiederholung,
          wiederholungBis: wiederholungBis || undefined,
        });
      }
      formularZuruecksetzen();
    });
  }

  function loeschKlick(t: Termin) {
    if (t.seriesId || t.gruppeId) {
      setLoeschAuswahl({ id: t.id, titel: t.titel });
    } else {
      startTransition(() => deleteTermin(t.id, "eins"));
    }
  }

  function renderEintrag(t: Termin) {
    const istEigenerTermin = t.personen.some((p) => p.id === eigeneId);
    const bearbeitbar = t.typ === "termin" && (istEltern || istEigenerTermin);
    const loeschbar = t.typ === "termin" && (istEltern || t.erstelltVonId === eigeneId);
    const icon = t.typ === "aufgabe" ? "📌 " : t.typ === "schule" ? "🎓 " : t.typ === "geburtstag" ? "" : "";
    return (
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
            {icon}
            {t.titel}
            {t.seriesId ? " 🔁" : ""}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {t.ganztaegig
              ? new Date(t.start).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
              : new Date(t.start).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {t.typ !== "geburtstag" && (
              <>
                {" · "}
                {t.personen.length > 0 ? (
                  t.personen.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <span style={{ color: p.farbe, fontWeight: 600 }}>{p.name}</span>
                    </span>
                  ))
                ) : (
                  <span style={{ fontWeight: 600 }}>Familie</span>
                )}
              </>
            )}
            {t.typ === "aufgabe" && <span> · Aufgabe</span>}
            {t.typ === "schule" && <span> · Schule</span>}
          </div>
          {loeschAuswahl?.id === t.id && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
              <span>Nur diesen Termin oder {t.gruppeId && !t.seriesId ? "alle Personen" : "die ganze Serie"} löschen?</span>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => {
                  startTransition(() => deleteTermin(t.id, "eins"));
                  setLoeschAuswahl(null);
                }}
              >
                Nur diesen
              </button>
              <button
                className="btn-danger"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => {
                  startTransition(() => deleteTermin(t.id, "serie"));
                  setLoeschAuswahl(null);
                }}
              >
                {t.gruppeId && !t.seriesId ? "Alle Personen" : "Ganze Serie"}
              </button>
              <button className="btn-secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setLoeschAuswahl(null)}>
                Abbrechen
              </button>
            </div>
          )}
          {istEltern && t.typ === "termin" && !loeschAuswahl && <HistorieVerlauf entityTyp="TERMIN" entityId={t.id} />}
        </div>
        {!loeschAuswahl && (bearbeitbar || loeschbar) && (
          <div style={{ display: "flex", gap: 6 }}>
            {bearbeitbar && (
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => bearbeitenStarten(t)}>
                Bearbeiten
              </button>
            )}
            {loeschbar && (
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => loeschKlick(t)}>
                Löschen
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SeitenTitel icon="📅" farbe={BEREICH_FARBEN.kalender}>Kalender</SeitenTitel>
        <button
          className="btn"
          onClick={() => {
            if (zeigeFormular) formularZuruecksetzen();
            else setZeigeFormular(true);
          }}
        >
          + Neuer Termin
        </button>
      </div>

      {zeigeFormular && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{bearbeitenId ? "Termin bearbeiten" : "Neuer Termin"}</strong>
          {!bearbeitenId && <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />}
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
          <input placeholder="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={ganztaegig}
              onChange={(e) => {
                const neu = e.target.checked;
                setGanztaegig(neu);
                // Beim Umschalten den bisherigen Wert sinnvoll umformatieren, statt ihn zu verwerfen.
                setStart((prev) => (neu ? prev.slice(0, 10) : prev ? `${prev}T09:00` : prev));
              }}
            />
            Ganztägig (keine Uhrzeit)
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>{ganztaegig ? "Datum" : "Datum & Uhrzeit"}</label>
          <input type={ganztaegig ? "date" : "datetime-local"} value={start} onChange={(e) => setStart(e.target.value)} />
          {titel.trim() && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Erkannt als: <strong>{TERMIN_KATEGORIE_LABEL[erkannteKategorie]}</strong>
            </p>
          )}
          {istEltern && !bearbeitenId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Für wen?</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input type="checkbox" checked={personIds.length === 0} onChange={() => setPersonIds([])} />
                Familie (alle)
              </label>
              {personen.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
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
          {!bearbeitenId && (
            <>
              <select value={wiederholung} onChange={(e) => setWiederholung(e.target.value)}>
                {WIEDERHOLUNGEN.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
              {wiederholung !== "KEINE" && (
                <>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>Wiederholen bis</label>
                  <input type="date" value={wiederholungBis} onChange={(e) => setWiederholungBis(e.target.value)} />
                </>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={pending} onClick={submit}>
              Speichern
            </button>
            {bearbeitenId && (
              <button className="btn-secondary" onClick={formularZuruecksetzen}>
                Abbrechen
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["monat", "woche", "tag", "liste"] as const).map((a) => (
          <button
            key={a}
            className="btn-secondary"
            style={{ background: ansicht === a ? "var(--accent)" : undefined, color: ansicht === a ? "var(--accent-contrast)" : undefined }}
            onClick={() => setAnsicht(a)}
          >
            {a === "monat" ? "Monat" : a === "woche" ? "Woche" : a === "tag" ? "Tag" : "Liste"}
          </button>
        ))}
      </div>

      {istEltern && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn-secondary"
            style={{ background: filter.length === 0 ? "var(--accent)" : undefined, color: filter.length === 0 ? "var(--accent-contrast)" : undefined }}
            onClick={() => setFilter([])}
          >
            Alle
          </button>
          {personen.map((p) => (
            <button
              key={p.id}
              className="btn-secondary"
              style={{ background: filter.includes(p.id) ? p.farbe : undefined, color: filter.includes(p.id) ? "#fff" : undefined }}
              onClick={() => setFilter((prev) => (prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
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
      )}
      {!istEltern && ansicht === "liste" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={nurZukunft} onChange={(e) => setNurZukunft(e.target.checked)} style={{ width: "auto" }} />
          Vergangene ausblenden
        </label>
      )}

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
                  border: zelle.iso === ausgewaehlterTag ? "2px solid var(--accent)" : zelle.heute ? "2px solid var(--success)" : "1px solid rgba(128,128,128,0.25)",
                  borderRadius: 8,
                  background: zelle.heute && zelle.iso !== ausgewaehlterTag ? "rgba(107,143,90,0.12)" : "transparent",
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
                  {zelle.eintraege
                    .flatMap((e) => (e.personen.length > 0 ? e.personen.map((p) => ({ key: `${e.id}-${p.id}`, farbe: p.farbe })) : [{ key: e.id, farbe: "var(--accent)" }]))
                    .slice(0, 4)
                    .map((d) => (
                      <span key={d.key} style={{ width: 6, height: 6, borderRadius: "50%", background: d.farbe, display: "inline-block" }} />
                    ))}
                  {zelle.eintraege.length > 4 && <span style={{ fontSize: 9 }}>+{zelle.eintraege.length - 4}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {ansicht === "woche" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setWochenDatum((d) => addTage(d, -7))}>
              ‹
            </button>
            <strong>
              {wochenTage[0].datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} –{" "}
              {wochenTage[6].datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </strong>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setWochenDatum((d) => addTage(d, 7))}>
              ›
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {wochenTage.map((tag) => (
              <div key={tag.iso} style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <div style={{ width: 60, flexShrink: 0, fontSize: 12, color: "var(--text-muted)", fontWeight: tag.heute ? 700 : 400 }}>
                  {WOCHENTAGE[(tag.datum.getDay() + 6) % 7]}
                  <br />
                  {tag.datum.getDate()}.{tag.datum.getMonth() + 1}.
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  {tag.eintraege.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                  {tag.eintraege.map((e) => (
                    <div key={e.id} style={{ fontSize: 13 }}>
                      {e.typ !== "geburtstag" && (
                        <span style={{ color: e.personen[0]?.farbe ?? "var(--text)", fontWeight: 600 }}>{personenLabel(e.personen)} · </span>
                      )}
                      {e.titel}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ansicht === "tag" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setTagesDatum((d) => addTage(d, -1))}>
              ‹
            </button>
            <strong style={{ textTransform: "capitalize" }}>
              {tagesDatum.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
            </strong>
            <button className="btn-secondary" style={{ padding: "4px 12px" }} onClick={() => setTagesDatum((d) => addTage(d, 1))}>
              ›
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tagesEintraege.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Keine Einträge.</p>}
            {tagesEintraege.map(renderEintrag)}
          </div>
        </div>
      )}

      {ausgewaehlterTag && ansicht === "monat" && (
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

      {(ansicht === "monat" || ansicht === "liste") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gefiltert.length === 0 && <p style={{ color: "var(--text-muted)" }}>Keine Termine.</p>}
          {gefiltert.map(renderEintrag)}
        </div>
      )}
    </div>
  );
}
