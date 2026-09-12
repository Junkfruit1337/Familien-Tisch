"use client";

import { useState } from "react";
import {
  erstelleSpickzettelVorschau,
  erklaereAufgabeVorschau,
  generiereUebungsaufgabenVorschau,
} from "@/app/(app)/schule/actions";

type Uebungsaufgabe = { frage: string; antwort: string };
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
        📷 Foto
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
        📁 Aus Galerie
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

// Übungsmodus bewusst als eigene Vollbild-Überlagerung (Florians ausdrücklicher Wunsch:
// "lässt alles andere verschwinden, dass man nicht abgelenkt wird") — kein normaler Card-
// Abschnitt zwischen den restigen Schule-Inhalten.
function UebungsUeberlagerung({ aufgaben, onSchliessen }: { aufgaben: Uebungsaufgabe[]; onSchliessen: () => void }) {
  const [index, setIndex] = useState(0);
  const [eigeneAntwort, setEigeneAntwort] = useState("");
  const [aufgedeckt, setAufgedeckt] = useState(false);
  const [richtigGeloest, setRichtigGeloest] = useState<boolean[]>([]);
  const aktuelle = aufgaben[index];

  function naechste(warRichtig: boolean) {
    setRichtigGeloest((prev) => [...prev, warRichtig]);
    setEigeneAntwort("");
    setAufgedeckt(false);
    setIndex((i) => i + 1);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 1000, display: "flex", flexDirection: "column", padding: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <strong>🧩 Übungsmodus</strong>
        <button className="btn-icon" title="Beenden" onClick={onSchliessen}>
          ✕
        </button>
      </div>
      {index < aufgaben.length ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Aufgabe {index + 1} von {aufgaben.length}
          </span>
          <p style={{ fontSize: 16, margin: 0 }}>{aktuelle.frage}</p>
          <textarea
            rows={3}
            placeholder="Deine Antwort …"
            value={eigeneAntwort}
            onChange={(e) => setEigeneAntwort(e.target.value)}
            disabled={aufgedeckt}
          />
          {!aufgedeckt ? (
            <button className="btn" disabled={!eigeneAntwort.trim()} onClick={() => setAufgedeckt(true)}>
              Antwort prüfen
            </button>
          ) : (
            <>
              <div style={{ background: "var(--surface-alt)", borderRadius: "var(--radius)", padding: 10 }}>
                <strong style={{ fontSize: 13 }}>Lösung</strong>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>{aktuelle.antwort}</p>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Hast du es richtig gelöst?</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => naechste(true)}>
                  ✅ Richtig
                </button>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => naechste(false)}>
                  ❌ Nochmal üben
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <p style={{ fontSize: 18, margin: "0 0 8px" }}>🎉 Geschafft!</p>
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
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>🧠 Lern-Hilfe</summary>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {!modus && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Wichtig: Die KI löst deine Hausaufgaben nicht für dich — sie erklärt dir nur, wie es geht, oder lässt dich mit anderen Beispielen üben.
            </p>
            <button className="btn-secondary" onClick={() => setModus("SPICKZETTEL")}>
              📝 Spickzettel aus meinen Notizen
            </button>
            <button className="btn-secondary" onClick={() => setModus("ERKLAEREN")}>
              💡 Erklärmodus (Methode verstehen)
            </button>
            <button className="btn-secondary" onClick={() => setModus("UEBEN")}>
              🧩 Übungsmodus (selbst üben)
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
          </>
        )}
        {modus === "UEBEN" && (
          <>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Foto einer Aufgabe — du bekommst 3 neue, ähnliche Aufgaben zum Selbst-Üben:</span>
            <FotoAuswahl disabled={laeuft} onFoto={fotoVerarbeiten} />
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
