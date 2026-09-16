"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createTermin,
  updateTermin,
  updateTerminSerie,
  deleteTermin,
  erkenneTerminAusText,
  pruefeTerminKonflikt,
} from "./actions";
import { erkenneTerminKategorie, TERMIN_KATEGORIE_LABEL } from "@/lib/terminkategorisierung";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import Spracheingabe from "@/components/Spracheingabe";
import SeitenTitel from "@/components/SeitenTitel";
import PersonChip from "@/components/PersonChip";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";
import { Icon } from "@/lib/uiIcons";
import { BereichIcon } from "@/lib/bereichIcons";

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
  anhaenge: string[];
  notiz: string | null;
};
type Person = { id: string; name: string; farbe: string };

// Fix-Batch 89 (Florians Wunsch: "einen Anhang hinzufügen ... wie z.B. ein Bild oder eine PDF
// Datei") — Fotos werden wie überall in der App verkleinert (kleinere Datenbank-Zeilen, siehe
// z.B. ticketFotoAufBase64 in den Einstellungen), PDFs unverändert als Base64 gelesen (analog
// rezeptDateiAufBase64 im Essensplan).
function terminDateiAufBase64(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
  // Fix-Batch 95 (Florians Wunsch, generell alle persistierten Fotos stärker komprimieren
  // außer dem Notenfoto): PDFs (oben) bleiben unangetastet, da dort eher wirklich lesbare
  // Infozettel landen — Fotos hier sind eher Schnappschüsse, "ungefähr erkennen" reicht.
  return new Promise((resolve, reject) => {
    const bild = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      bild.onerror = reject;
      bild.onload = () => {
        const maxBreite = 700;
        const skalierung = Math.min(1, maxBreite / bild.width);
        const canvas = document.createElement("canvas");
        canvas.width = bild.width * skalierung;
        canvas.height = bild.height * skalierung;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas nicht verfügbar"));
        ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.55));
      };
      bild.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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

// Fix-Batch 89 (Florians Wunsch): Termine über mehrere Tage — ein Termin erscheint jetzt an
// jedem Tag zwischen (inklusive) Start- und Enddatum, nicht mehr nur am Starttag. `ende` war
// bisher nur als Datenfeld vorhanden, wurde aber nirgends im Formular gesetzt/genutzt.
function umfasstTag(t: Termin, iso: string): boolean {
  const startIso = isoDatum(t.start);
  const endeIso = t.ende ? isoDatum(t.ende) : startIso;
  return iso >= startIso && iso <= endeIso;
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
  // Fix-Batch 112 (Florians Bug-Meldung: die "heute"-Markierung im Monatsraster blieb auf dem
  // Vortag stehen, obwohl schon längst Mitternacht vorbei war): `isoVonDate(new Date())` wurde
  // bisher DIREKT in den useMemo-Blöcken berechnet, deren Abhängigkeits-Arrays sich aber nie
  // ändern, nur weil die Uhrzeit weiterläuft — blieb die Seite über Mitternacht hinweg offen,
  // rechnete keiner der Blöcke neu. Jetzt ein eigener State, der jede Minute geprüft und bei
  // echtem Datumswechsel aktualisiert wird, als gemeinsame Abhängigkeit für alle "heute"-
  // Berechnungen dieser Seite.
  const [heuteIso, setHeuteIso] = useState(() => isoVonDate(new Date()));
  useEffect(() => {
    const timer = setInterval(() => {
      const aktuell = isoVonDate(new Date());
      setHeuteIso((prev) => (prev !== aktuell ? aktuell : prev));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const [loeschAuswahl, setLoeschAuswahl] = useState<{ id: string; titel: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [titel, setTitel] = useState("");
  const [start, setStart] = useState("");
  const [ende, setEnde] = useState("");
  const [ganztaegig, setGanztaegig] = useState(false);
  const [personIds, setPersonIds] = useState<string[]>(istEltern ? [] : [eigeneId]);
  const [wiederholung, setWiederholung] = useState("KEINE");
  const [wiederholungBis, setWiederholungBis] = useState("");
  const [anhaengeEntwurf, setAnhaengeEntwurf] = useState<string[]>([]);
  // Fix-Batch 122 (Florians Wunsch, als Ersatz für die entfernte Packliste): freies Notizfeld
  // je Termin, z. B. "was mitzunehmen ist" — bewusst unstrukturierter Text statt einer eigenen
  // Checkliste.
  const [notizEntwurf, setNotizEntwurf] = useState("");
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  // Fix-Batch 95 (Florians Wunsch): wiederkehrenden Termin nachträglich als GANZE Serie
  // bearbeiten können (bisher nur der Titel/die Zeit des einen angeklickten Einzeltermins).
  const [bearbeitenSerieMoeglich, setBearbeitenSerieMoeglich] = useState(false);
  const [fuerGanzeSerie, setFuerGanzeSerie] = useState(false);
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
    const heuteMitternacht = new Date(`${heuteIso}T00:00:00`);
    const liste = termine
      .filter(passtFilter)
      .filter((t) => !nurZukunft || ausgewaehlterTag || new Date(t.ende ?? t.start) >= heuteMitternacht)
      .filter((t) => !ausgewaehlterTag || umfasstTag(t, ausgewaehlterTag));

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
  }, [termine, filter, nurZukunft, ausgewaehlterTag, heuteIso]);

  const monatsZellen = useMemo(() => {
    const jahr = monatsDatum.getFullYear();
    const monat = monatsDatum.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    const montagOffset = (ersterTag.getDay() + 6) % 7; // 0 = Montag
    const start0 = new Date(jahr, monat, 1 - montagOffset);

    const zellen = [];
    for (let i = 0; i < 42; i++) {
      const datum = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate() + i);
      const iso = isoVonDate(datum);
      const eintraege = termine.filter((t) => passtFilter(t) && umfasstTag(t, iso));
      zellen.push({ iso, tag: datum.getDate(), imMonat: datum.getMonth() === monat, heute: iso === heuteIso, eintraege });
    }
    return zellen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monatsDatum, termine, filter, heuteIso]);

  const wochenTage = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const datum = addTage(wochenDatum, i);
      const iso = isoVonDate(datum);
      const eintraege = termine
        .filter((t) => passtFilter(t) && umfasstTag(t, iso))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return { iso, datum, heute: iso === heuteIso, eintraege };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wochenDatum, termine, filter, heuteIso]);

  const tagesEintraege = useMemo(() => {
    const iso = isoVonDate(tagesDatum);
    return termine
      .filter((t) => passtFilter(t) && umfasstTag(t, iso))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagesDatum, termine, filter]);

  function formularZuruecksetzen() {
    setTitel("");
    setStart("");
    setEnde("");
    setAnhaengeEntwurf([]);
    setNotizEntwurf("");
    setBearbeitenSerieMoeglich(false);
    setFuerGanzeSerie(false);
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
    setEnde(t.ende ? (t.ganztaegig ? isoDatum(t.ende) : t.ende.slice(0, 16)) : "");
    setAnhaengeEntwurf(t.anhaenge);
    setNotizEntwurf(t.notiz ?? "");
    setWiederholung("KEINE");
    setWiederholungBis("");
    setBearbeitenSerieMoeglich(!!(t.seriesId || t.gruppeId));
    setFuerGanzeSerie(false);
    setZeigeFormular(true);
    // Fix-Batch 122 (Florians Bug-Meldung: "es passiert nichts, wenn ich auf Bearbeiten
    // klicke") — das Formular öffnet sich oben auf der Seite; war die Liste weiter
    // heruntergescrollt, blieb das für Florian unsichtbar und wirkte wie ein toter Knopf.
    // Jetzt wird nach dem Öffnen automatisch dorthin gescrollt.
    setTimeout(() => {
      document.getElementById("termin-formular")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
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
      // Fix-Batch 95 (Florians Wunsch, Beispiel "jeden Dienstag Klavier 15–16 Uhr"): eine
      // genannte Endzeit jetzt ebenfalls übernehmen, statt sie stillschweigend zu verwerfen.
      setEnde(t.uhrzeit && t.endzeit ? `${datum}T${t.endzeit}` : "");
      if (istEltern && t.personIds.length > 0) setPersonIds(t.personIds);
      setWiederholung(t.wiederholung);
      setWiederholungBis(t.wiederholungBis ?? "");
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  function submit() {
    if (!titel || !start) return;
    const startWert = ganztaegig ? `${start}T00:00` : start;
    const endeWert = ende ? (ganztaegig ? `${ende}T00:00` : ende) : undefined;
    if (endeWert && new Date(endeWert) < new Date(startWert)) {
      alert("Das \"Bis\"-Datum darf nicht vor dem Start liegen.");
      return;
    }
    startTransition(async () => {
      if (bearbeitenId) {
        if (fuerGanzeSerie) {
          await updateTerminSerie(bearbeitenId, titel);
        } else {
          await updateTermin(bearbeitenId, { titel, start: startWert, ende: endeWert, anhaenge: anhaengeEntwurf, notiz: notizEntwurf || undefined });
        }
      } else {
        // Fix-Batch 63 (Terminkonflikt-Check): vor dem Anlegen prüfen, ob am selben Tag für
        // dieselbe(n) Person(en) schon ein Termin oder eine Klassenarbeit/HÜ-Kontrolle steht
        // — rein informativ, verhindert das Anlegen nicht.
        if (personIds.length > 0) {
          const hinweise = await pruefeTerminKonflikt(startWert, personIds);
          if (hinweise.length > 0 && !confirm(`Achtung, an diesem Tag steht schon etwas an:\n\n${hinweise.join("\n")}\n\nTrotzdem anlegen?`)) {
            return;
          }
        }
        await createTermin({
          titel,
          start: startWert,
          ende: endeWert,
          ganztaegig,
          personIds,
          wiederholung,
          wiederholungBis: wiederholungBis || undefined,
          anhaenge: anhaengeEntwurf,
          notiz: notizEntwurf || undefined,
        });
      }
      formularZuruecksetzen();
    });
  }

  // Fix-Batch 94 (Audit-Ergebnis, Florians Wunsch "einheitliche Lösch-Bestätigung überall wo
  // sinnvoll"): ein einzelner Termin ließ sich bisher ohne jede Rückfrage löschen.
  function loeschKlick(t: Termin) {
    if (t.seriesId || t.gruppeId) {
      setLoeschAuswahl({ id: t.id, titel: t.titel });
    } else {
      if (!confirm(`„${t.titel}" wirklich löschen?`)) return;
      startTransition(() => deleteTermin(t.id, "eins"));
    }
  }

  function renderEintrag(t: Termin) {
    const istEigenerTermin = t.personen.some((p) => p.id === eigeneId);
    const bearbeitbar = t.typ === "termin" && (istEltern || istEigenerTermin);
    const loeschbar = t.typ === "termin" && (istEltern || t.erstelltVonId === eigeneId);
    const icon =
      t.typ === "aufgabe" ? (
        <Icon id="pin" size={14} />
      ) : t.typ === "schule" ? (
        <BereichIcon bereich="schule" size={14} />
      ) : t.typ === "geburtstag" ? (
        <Icon id="cake" size={14} />
      ) : null;
    const zusammenfassung = (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontWeight: 600, textDecoration: t.typ === "aufgabe" && t.erledigt ? "line-through" : undefined, display: "flex", alignItems: "center", gap: 4 }}>
          {icon}
          {t.titel}
          {t.seriesId && <Icon id="repeat" size={14} />}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {/* Fix-Batch 89 (Florians Wunsch): mehrtägige Termine zeigen den ganzen Zeitraum
              statt nur den Starttag, sobald Start- und Enddatum auseinanderliegen. */}
          {t.ende && isoDatum(t.ende) !== isoDatum(t.start) ? (
            <>
              {new Date(t.start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
              {" – "}
              {new Date(t.ende).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </>
          ) : t.ganztaegig ? (
            new Date(t.start).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
          ) : (
            new Date(t.start).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          )}
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
      </div>
    );
    // Fix-Batch 121 (Florians Bug-Meldung: Listenansicht "maximal unübersichtlich", Buttons
    // rutschen teilweise aus dem Rahmen): wie schon bei "Arbeiten & HÜs" in Schule (Fix-Batch
    // 116) sind Anhänge, Packliste, Bearbeiten/Löschen jetzt erst nach Antippen sichtbar
    // (<details>), statt permanent nebeneinander gequetscht — in der Übersicht zählen nur
    // Titel, Datum und Person(en).
    return (
      <details key={t.id} className="card" style={{ opacity: t.typ === "aufgabe" && t.erledigt ? 0.6 : 1 }}>
        <summary style={{ cursor: "pointer", listStyle: "none" }}>{zusammenfassung}</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {t.anhaenge.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.anhaenge.map((a, i) =>
                a.startsWith("data:application/pdf") ? (
                  <a
                    key={i}
                    href={a}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "4px 8px", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <Icon id="pdf" size={12} /> PDF öffnen
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={a}
                    alt="Anhang"
                    style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                    onClick={() => setGrossesBild(a)}
                  />
                )
              )}
            </div>
          )}
          {t.notiz && (
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--text-muted)", display: "flex", gap: 4 }}>
              <Icon id="note" size={13} /> {t.notiz}
            </div>
          )}
          {loeschAuswahl?.id === t.id && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
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
                  // Fix-Batch 94 (Audit-Ergebnis): löscht potenziell viele Termine auf einmal —
                  // verdient eine explizite Rückfrage, mehr als "Nur diesen".
                  const beschreibung = t.gruppeId && !t.seriesId ? "für alle Personen" : "die ganze Serie";
                  if (!confirm(`„${t.titel}" wirklich ${beschreibung} löschen? Das betrifft möglicherweise mehrere Termine.`)) return;
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
          {!loeschAuswahl && (bearbeitbar || loeschbar) && (
            <div style={{ display: "flex", gap: 8 }}>
              {bearbeitbar && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }} onClick={() => bearbeitenStarten(t)}>
                  <Icon id="edit" size={12} /> Bearbeiten
                </button>
              )}
              {loeschbar && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }} onClick={() => loeschKlick(t)}>
                  <Icon id="delete" size={12} /> Löschen
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {grossesBild && (
        <div
          onClick={() => setGrossesBild(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grossesBild} alt="Anhang groß" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SeitenTitel bereich="kalender">Kalender</SeitenTitel>
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
        <div id="termin-formular" className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{bearbeitenId ? "Termin bearbeiten" : "Neuer Termin"}</strong>
          {!bearbeitenId && <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />}
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
          <input placeholder="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
          {/* Fix-Batch 95 (Florians Wunsch): wiederkehrenden Termin/Personen-Gruppe nachträglich
              als GANZE Serie bearbeiten, statt nur den einen angeklickten Einzeltermin. Bewusst
              nur der Titel wird dabei übernommen — Datum/Uhrzeit/Anhänge bleiben je Termin
              unterschiedlich, deshalb werden die Felder unten dann ausgeblendet. */}
          {bearbeitenId && bearbeitenSerieMoeglich && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={fuerGanzeSerie} onChange={(e) => setFuerGanzeSerie(e.target.checked)} />
              Titel für die ganze Serie übernehmen (nicht nur diesen Termin)
            </label>
          )}
          {!fuerGanzeSerie && (
            <>
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
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>
                Bis (optional — für Termine über mehrere Tage)
              </label>
              <input type={ganztaegig ? "date" : "datetime-local"} value={ende} onChange={(e) => setEnde(e.target.value)} />
            </>
          )}
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
          {/* Fix-Batch 122 (Florians Wunsch, als Ersatz für die entfernte Packliste): freies
              Notizfeld statt einer eigenen Checkliste — z. B. "Sonnencreme mitnehmen". */}
          {!fuerGanzeSerie && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Notiz (optional, z. B. was mitzunehmen ist)</span>
              <textarea
                value={notizEntwurf}
                onChange={(e) => setNotizEntwurf(e.target.value)}
                rows={2}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          )}
          {/* Fix-Batch 90 (Florians Nachfrage): Kamera-Direktaufnahme ergänzt — vorher gab es
              nur einen generischen Datei-Picker, der je nach Browser/OS nicht zuverlässig die
              Kamera anbot. Zwei-Buttons-Muster wie beim Rezept-Foto-Upload im Essensplan
              (📷 Foto mit capture="environment" öffnet direkt die Kamera, 📁 Datei für Galerie
              + PDF). */}
          {!fuerGanzeSerie && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Anhang (optional — Bild oder PDF)</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon id="photo" /> Foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";
                    const base64 = await terminDateiAufBase64(file);
                    setAnhaengeEntwurf((prev) => [...prev, base64]);
                  }}
                />
              </label>
              <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon id="file" /> Datei (Bild oder PDF)
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    e.target.value = "";
                    const neue = await Promise.all(files.map((f) => terminDateiAufBase64(f)));
                    setAnhaengeEntwurf((prev) => [...prev, ...neue]);
                  }}
                />
              </label>
            </div>
            {anhaengeEntwurf.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {anhaengeEntwurf.map((a, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {a.startsWith("data:application/pdf") ? (
                      <div
                        style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "var(--surface-soft, var(--border))", borderRadius: 8 }}
                      >
                        <Icon id="pdf" size={22} />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a}
                        alt="Anhang-Vorschau"
                        style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                        onClick={() => setGrossesBild(a)}
                      />
                    )}
                    <button
                      className="btn-secondary"
                      style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, padding: 0, fontSize: 11, borderRadius: 999, lineHeight: 1 }}
                      onClick={() => setAnhaengeEntwurf((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Icon id="close" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: filter.includes(p.id) ? p.farbe : undefined,
                color: filter.includes(p.id) ? "#fff" : undefined,
                borderColor: filter.includes(p.id) ? p.farbe : undefined,
              }}
              onClick={() => setFilter((prev) => (prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
            >
              {!filter.includes(p.id) && <PersonChip name={p.name} farbe={p.farbe} size={16} />}
              {p.name}
            </button>
          ))}
        </div>
      )}
      {ansicht === "liste" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
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
                  border: zelle.iso === ausgewaehlterTag ? "2px solid var(--accent)" : zelle.heute ? "2px solid var(--success)" : "1px solid var(--border)",
                  borderRadius: 8,
                  background: zelle.heute && zelle.iso !== ausgewaehlterTag ? "var(--success-soft)" : "transparent",
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
            {tagesEintraege.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-icon"><Icon id="inbox" size={28} /></span>
                <span>Keine Einträge.</span>
              </div>
            )}
            {tagesEintraege.map(renderEintrag)}
          </div>
        </div>
      )}

      {ausgewaehlterTag && ansicht === "monat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-sm)" }}>
          <span>
            Zeige nur:{" "}
            {new Date(ausgewaehlterTag + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
          </span>
          <button className="btn-secondary" style={{ padding: "2px 10px", fontSize: "var(--font-xs)" }} onClick={() => setAusgewaehlterTag(null)}>
            Filter aufheben
          </button>
        </div>
      )}

      {/* Redesign: im Monat-Raster wird die Liste NUR noch gezeigt, wenn ein Tag ausgewählt
          wurde — vorher erschien hier zusätzlich IMMER die komplette gefilterte Terminliste
          unter dem Raster, obwohl die eigene "Liste"-Ansicht genau das schon bietet
          (Kasten-Dopplung, siehe Redesign-Audit). */}
      {((ansicht === "monat" && ausgewaehlterTag) || ansicht === "liste") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gefiltert.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon"><Icon id="inbox" size={28} /></span>
              <span>Keine Termine.</span>
            </div>
          )}
          {gefiltert.map(renderEintrag)}
        </div>
      )}
    </div>
  );
}
