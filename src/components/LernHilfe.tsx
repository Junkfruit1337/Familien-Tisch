"use client";

import { useState } from "react";
import { Icon } from "@/lib/uiIcons";
import {
  erstelleSpickzettelVorschau,
  erklaereAufgabeVorschau,
  generiereUebungsaufgabenVorschau,
  erklaereThemaVorschau,
  generiereUebungsaufgabenZuThemaVorschau,
  pruefeUebungsantwortVorschau,
} from "@/app/(app)/schule/actions";
import Spracheingabe from "@/components/Spracheingabe";

type Uebungsaufgabe = { frage: string; antwort: string; optionen?: string[] };
type Verdict = { korrekt: boolean; erklaerung: string };
type Modus = "SPICKZETTEL" | "ERKLAEREN" | "UEBEN";

// Bewusst kleiner als bei Rezept-/Notenfotos — hier reicht die Auflösung locker, kleinere
// Bilder machen die KI-Antwort spürbar schneller (wichtig direkt vor/während des Lernens).
function fotoAufBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const bild = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      bild.onerror = reject;
      bild.onload = () => {
        const maxBreite = 1200;
        const skalierung = Math.min(1, maxBreite / bild.width);
        const canvas = document.createElement("canvas");
        canvas.width = bild.width * skalierung;
        canvas.height = bild.height * skalierung;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas nicht verfügbar"));
        ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      bild.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function FotoAuswahl({ disabled, onFoto }: { disabled: boolean; onFoto: (base64: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
        <Icon id="photo" /> Foto
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            onFoto(await fotoAufBase64(file));
          }}
        />
      </label>
      <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
        <Icon id="file" /> Aus Galerie
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            onFoto(await fotoAufBase64(file));
          }}
        />
      </label>
    </div>
  );
}

// Fix-Batch 65 (Florians Wunsch): Erklär-/Übungsmodus sollen sich nicht nur per Foto,
// sondern auch per Sprache/Text bedienen lassen — man beschreibt einfach das ganze Thema,
// statt zwingend eine konkrete Aufgabe fotografieren zu müssen.
function ThemaEingabe({ disabled, onSenden, platzhalter }: { disabled: boolean; onSenden: (text: string) => void; platzhalter: string }) {
  const [text, setText] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Spracheingabe disabled={disabled} onErgebnis={setText} />
      <textarea
        placeholder={platzhalter}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <button className="btn" disabled={disabled || !text.trim()} onClick={() => onSenden(text)}>
        Los
      </button>
    </div>
  );
}

// Übungsmodus bewusst als eigene Vollbild-Überlagerung (Florians ausdrücklicher Wunsch:
// "lässt alles andere verschwinden, dass man nicht abgelenkt wird") — kein normaler Card-
// Abschnitt zwischen den restigen Schule-Inhalten.
// Fix-Batch 110 (Florians Bug-Meldung: Schwierigkeit "nicht abgestimmt", nicht intuitiv
// anklickbar wie bei "Anton", "richtig oder falsch sieht man nicht genau", zwei verwirrende
// Buttons die gleichzeitig "war ich richtig" UND "weiter" bedeuten mussten): komplett
// überarbeiteter Ablauf — bei Multiple-Choice-Aufgaben (`optionen`) antippen EINER Option
// prüft sofort automatisch und zeigt richtig/falsch farblich an; bei offenen Aufgaben prüft
// jetzt die KI die Antwort wirklich (statt sie nur selbst einschätzen zu lassen). Danach in
// beiden Fällen GENAU EIN eindeutiger "Weiter"-Button, keine zwei nebeneinander mit
// unterschiedlicher Bedeutung mehr.
function UebungsUeberlagerung({ aufgaben, onSchliessen }: { aufgaben: Uebungsaufgabe[]; onSchliessen: () => void }) {
  const [index, setIndex] = useState(0);
  const [eigeneAntwort, setEigeneAntwort] = useState("");
  const [ausgewaehlteOption, setAusgewaehlteOption] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [pruefeLaeuft, setPruefeLaeuft] = useState(false);
  const [richtigGeloest, setRichtigGeloest] = useState<boolean[]>([]);
  const aktuelle = aufgaben[index];

  function optionAngeklickt(option: string) {
    if (verdict) return;
    setAusgewaehlteOption(option);
    const korrekt = option === aktuelle.antwort;
    setVerdict({ korrekt, erklaerung: korrekt ? "Richtig!" : `Nicht ganz — richtig wäre: ${aktuelle.antwort}` });
  }

  async function antwortPruefen() {
    if (!eigeneAntwort.trim()) return;
    setPruefeLaeuft(true);
    try {
      const ergebnis = await pruefeUebungsantwortVorschau(aktuelle.frage, aktuelle.antwort, eigeneAntwort);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      setVerdict({ korrekt: ergebnis.korrekt, erklaerung: ergebnis.erklaerung });
    } finally {
      setPruefeLaeuft(false);
    }
  }

  function naechste() {
    if (!verdict) return;
    setRichtigGeloest((prev) => [...prev, verdict.korrekt]);
    setEigeneAntwort("");
    setAusgewaehlteOption(null);
    setVerdict(null);
    setIndex((i) => i + 1);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 1000, display: "flex", flexDirection: "column", padding: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon id="puzzle" /> Übungsmodus
        </strong>
        <button className="btn-icon" title="Beenden" onClick={onSchliessen}>
          <Icon id="close" />
        </button>
      </div>
      {index < aufgaben.length ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Aufgabe {index + 1} von {aufgaben.length}
          </span>
          <p style={{ fontSize: 16, margin: 0 }}>{aktuelle.frage}</p>

          {aktuelle.optionen && aktuelle.optionen.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aktuelle.optionen.map((option) => {
                const istRichtigeAntwort = option === aktuelle.antwort;
                const istAusgewaehlt = option === ausgewaehlteOption;
                let hintergrund = "var(--surface-alt)";
                let rahmen = "1px solid var(--border)";
                if (verdict) {
                  if (istRichtigeAntwort) {
                    hintergrund = "var(--success-soft)";
                    rahmen = "1px solid var(--success)";
                  } else if (istAusgewaehlt) {
                    hintergrund = "var(--danger-soft)";
                    rahmen = "1px solid var(--danger)";
                  }
                }
                return (
                  <button
                    key={option}
                    onClick={() => optionAngeklickt(option)}
                    disabled={!!verdict}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: "var(--radius)",
                      border: rahmen,
                      background: hintergrund,
                      fontSize: 15,
                      cursor: verdict ? "default" : "pointer",
                    }}
                  >
                    {option}
                    {verdict && istRichtigeAntwort && " ✓"}
                    {verdict && istAusgewaehlt && !istRichtigeAntwort && (
                      <>
                        {" "}
                        <Icon id="close" size={13} />
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <textarea
                rows={3}
                placeholder="Deine Antwort …"
                value={eigeneAntwort}
                onChange={(e) => setEigeneAntwort(e.target.value)}
                disabled={!!verdict || pruefeLaeuft}
              />
              {!verdict && (
                <button className="btn" disabled={!eigeneAntwort.trim() || pruefeLaeuft} onClick={antwortPruefen}>
                  {pruefeLaeuft ? "Wird geprüft …" : "Antwort prüfen"}
                </button>
              )}
            </>
          )}

          {verdict && (
            <>
              <div
                style={{
                  background: verdict.korrekt ? "var(--success-soft)" : "var(--danger-soft)",
                  borderRadius: "var(--radius)",
                  padding: 10,
                }}
              >
                <strong style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  {verdict.korrekt ? (
                    <>
                      <Icon id="check" /> Richtig!
                    </>
                  ) : (
                    <>
                      <Icon id="close" /> Nicht ganz
                    </>
                  )}
                </strong>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>{verdict.erklaerung}</p>
                {!verdict.korrekt && !aktuelle.optionen?.length && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" }}>Lösung: {aktuelle.antwort}</p>
                )}
              </div>
              <button className="btn" onClick={naechste}>
                {index + 1 < aufgaben.length ? "Weiter zur nächsten Aufgabe" : "Fertig"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <p style={{ fontSize: 18, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon id="party" /> Geschafft!
          </p>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 16px" }}>
            {richtigGeloest.filter(Boolean).length} von {richtigGeloest.length} auf Anhieb richtig.
          </p>
          <button className="btn" onClick={onSchliessen}>
            Fertig
          </button>
        </div>
      )}
    </div>
  );
}

// Fix-Batch 64 (Florians KI-Vorschlag "KI-Lernhilfe für Kinder"): Erklärmodus und Übungsmodus
// sind bewusst separat auswählbar (nicht kombiniert) und beide fotobasiert — Sicherheitsgrenze
// (nie die Lösung der abgebildeten Aufgabe nennen/vorrechnen) sitzt in den Prompts, siehe
// src/lib/lernhilfe.ts.
export default function LernHilfe() {
  const [modus, setModus] = useState<Modus | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnisText, setErgebnisText] = useState<string | null>(null);
  const [spickzettelThema, setSpickzettelThema] = useState("");
  const [uebungsaufgaben, setUebungsaufgaben] = useState<Uebungsaufgabe[] | null>(null);

  async function fotoVerarbeiten(base64: string) {
    setLaeuft(true);
    setErgebnisText(null);
    try {
      if (modus === "SPICKZETTEL") {
        const ergebnis = await erstelleSpickzettelVorschau(base64, spickzettelThema || undefined);
        if (!ergebnis.ok) return alert(ergebnis.fehler);
        setErgebnisText(ergebnis.text);
      } else if (modus === "ERKLAEREN") {
        const ergebnis = await erklaereAufgabeVorschau(base64);
        if (!ergebnis.ok) return alert(ergebnis.fehler);
        setErgebnisText(ergebnis.text);
      } else if (modus === "UEBEN") {
        const ergebnis = await generiereUebungsaufgabenVorschau(base64);
        if (!ergebnis.ok) return alert(ergebnis.fehler);
        setUebungsaufgaben(ergebnis.aufgaben);
      }
    } finally {
      setLaeuft(false);
    }
  }

  async function themaVerarbeiten(text: string) {
    setLaeuft(true);
    setErgebnisText(null);
    try {
      if (modus === "ERKLAEREN") {
        const ergebnis = await erklaereThemaVorschau(text);
        if (!ergebnis.ok) return alert(ergebnis.fehler);
        setErgebnisText(ergebnis.text);
      } else if (modus === "UEBEN") {
        const ergebnis = await generiereUebungsaufgabenZuThemaVorschau(text);
        if (!ergebnis.ok) return alert(ergebnis.fehler);
        setUebungsaufgaben(ergebnis.aufgaben);
      }
    } finally {
      setLaeuft(false);
    }
  }

  function zurueck() {
    setModus(null);
    setErgebnisText(null);
    setSpickzettelThema("");
  }

  if (uebungsaufgaben) {
    return <UebungsUeberlagerung aufgaben={uebungsaufgaben} onSchliessen={() => { setUebungsaufgaben(null); zurueck(); }} />;
  }

  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon id="brain" /> Lern-Hilfe
      </summary>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {!modus && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Wichtig: Die KI löst deine Hausaufgaben nicht für dich — sie erklärt dir nur, wie es geht, oder lässt dich mit anderen Beispielen üben.
            </p>
            <button className="btn-secondary" onClick={() => setModus("SPICKZETTEL")} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Icon id="note" /> Spickzettel aus meinen Notizen
            </button>
            <button className="btn-secondary" onClick={() => setModus("ERKLAEREN")} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Icon id="lightbulb" /> Erklärmodus (Methode verstehen)
            </button>
            <button className="btn-secondary" onClick={() => setModus("UEBEN")} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Icon id="puzzle" /> Übungsmodus (selbst üben)
            </button>
          </>
        )}

        {modus === "SPICKZETTEL" && !ergebnisText && (
          <>
            <input
              placeholder="Thema (optional, z. B. Bruchrechnen)"
              value={spickzettelThema}
              onChange={(e) => setSpickzettelThema(e.target.value)}
            />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Foto deiner Lernnotizen/Lernzettel:</span>
            <FotoAuswahl disabled={laeuft} onFoto={fotoVerarbeiten} />
          </>
        )}
        {modus === "ERKLAEREN" && !ergebnisText && (
          <>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Foto der Aufgabe, die du nicht verstehst:</span>
            <FotoAuswahl disabled={laeuft} onFoto={fotoVerarbeiten} />
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>— oder —</div>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Thema per Sprache oder Text beschreiben:</span>
            <ThemaEingabe disabled={laeuft} onSenden={themaVerarbeiten} platzhalter="z. B. Erkläre mir Bruchrechnen" />
          </>
        )}
        {modus === "UEBEN" && (
          <>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Foto einer Aufgabe — du bekommst 3 neue, ähnliche Aufgaben zum Selbst-Üben:</span>
            <FotoAuswahl disabled={laeuft} onFoto={fotoVerarbeiten} />
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>— oder —</div>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Thema per Sprache oder Text beschreiben:</span>
            <ThemaEingabe disabled={laeuft} onSenden={themaVerarbeiten} platzhalter="z. B. Übungsaufgaben zu Bruchrechnen" />
          </>
        )}

        {laeuft && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Einen Moment …</p>}

        {ergebnisText && (
          <div style={{ background: "var(--surface-alt)", borderRadius: "var(--radius)", padding: 10 }}>
            <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{ergebnisText}</p>
          </div>
        )}

        {modus && (
          <button className="btn-secondary" style={{ alignSelf: "flex-start" }} onClick={zurueck}>
            ← Zurück
          </button>
        )}
      </div>
    </details>
  );
}
