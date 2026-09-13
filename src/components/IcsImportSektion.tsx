"use client";

import { useState, useTransition } from "react";
import { parseIcsVorschau, importiereIcsTermine } from "@/app/(app)/kalender/actions";

// Fix-Batch 96 (Florians Wunsch): Termine per ICS-Datei importieren (Umzug von Faminice).
// Fix-Batch 101 (Florians Feedback): dieser Import passiert höchstens ein paar Mal beim
// Umzug von einer anderen Kalender-App, danach nie wieder — gehört daher in die
// Einstellungen statt prominent oben auf der täglich genutzten Kalender-Seite zu stehen
// (analog zur Notengewichtung/Dienstkatalog-Verwaltung, die aus demselben Grund schon dort
// liegen). Eigene, in sich geschlossene Komponente statt Teil der ohnehin schon sehr großen
// KalenderClient/EinstellungenClient-Dateien.
type IcsEreignis = { titel: string; start: string; ende: string | null; ganztaegig: boolean };

export default function IcsImportSektion({ personen }: { personen: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [icsErgebnis, setIcsErgebnis] = useState<{ ereignisse: IcsEreignis[]; quelle: "ics" | "ki" } | null>(null);
  const [icsAuswahl, setIcsAuswahl] = useState<boolean[]>([]);
  const [icsPersonId, setIcsPersonId] = useState("");
  const [icsLaedt, setIcsLaedt] = useState(false);
  const [icsFehler, setIcsFehler] = useState<string | null>(null);
  const [icsImportiert, setIcsImportiert] = useState<number | null>(null);

  async function icsDateiAusgewaehlt(datei: File) {
    setIcsFehler(null);
    setIcsImportiert(null);
    setIcsErgebnis(null);
    setIcsLaedt(true);
    try {
      const text = await datei.text();
      const ergebnis = await parseIcsVorschau(text);
      if (!ergebnis.ok) {
        setIcsFehler(ergebnis.fehler);
        return;
      }
      setIcsErgebnis({ ereignisse: ergebnis.ereignisse, quelle: ergebnis.quelle });
      setIcsAuswahl(ergebnis.ereignisse.map(() => true));
    } catch (err) {
      setIcsFehler(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.");
    } finally {
      setIcsLaedt(false);
    }
  }

  function icsImportBestaetigen() {
    if (!icsErgebnis) return;
    const ausgewaehlt = icsErgebnis.ereignisse.filter((_, i) => icsAuswahl[i]);
    if (ausgewaehlt.length === 0) return;
    startTransition(async () => {
      const anzahl = await importiereIcsTermine(icsPersonId || null, ausgewaehlt);
      setIcsImportiert(anzahl);
      setIcsErgebnis(null);
      setIcsAuswahl([]);
    });
  }

  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>📥 Termine aus einer Kalender-Datei importieren (ICS)</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
          Für einen Umzug aus einer anderen Kalender-App: dort als ICS-Datei exportieren (meist pro Person eine eigene
          Datei), hier hochladen, prüfen und übernehmen. Es wird nichts gespeichert, bevor du unten "Importieren" anklickst.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Für wen ist diese Datei?</label>
          <select value={icsPersonId} onChange={(e) => setIcsPersonId(e.target.value)}>
            <option value="">Familie (alle)</option>
            {personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", alignSelf: "flex-start" }}>
          📁 ICS-Datei auswählen
          <input
            type="file"
            accept=".ics,text/calendar"
            style={{ display: "none" }}
            onChange={(e) => {
              const datei = e.target.files?.[0];
              e.target.value = "";
              if (datei) icsDateiAusgewaehlt(datei);
            }}
          />
        </label>
        {icsLaedt && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Datei wird gelesen …</p>}
        {icsFehler && <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{icsFehler}</p>}
        {icsImportiert !== null && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--success)" }}>✓ {icsImportiert} Termin(e) übernommen.</p>
        )}
        {icsErgebnis && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {icsErgebnis.quelle === "ki" && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--warning)" }}>
                ⚠️ Diese Datei war nicht im Standard-Kalenderformat — die Termine wurden per KI ausgelesen. Bitte besonders
                sorgfältig prüfen, bevor du übernimmst.
              </p>
            )}
            <p style={{ margin: 0, fontSize: 13 }}>
              {icsErgebnis.ereignisse.length} Termin(e) gefunden — bitte prüfen, welche übernommen werden sollen:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {icsErgebnis.ereignisse.map((e, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={icsAuswahl[i] ?? true}
                    onChange={() => setIcsAuswahl((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                  />
                  <span style={{ flex: 1 }}>{e.titel}</span>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    {e.ganztaegig
                      ? new Date(e.start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })
                      : new Date(e.start).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {e.ende && ` – ${new Date(e.ende).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={pending} onClick={icsImportBestaetigen}>
                {icsAuswahl.filter(Boolean).length} Termin(e) importieren
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setIcsErgebnis(null);
                  setIcsAuswahl([]);
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
