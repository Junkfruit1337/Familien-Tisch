"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  addArtikel,
  toggleArtikel,
  deleteArtikel,
  submitWunsch,
  updateWunsch,
  deleteWunsch,
  entscheideWunsch,
  updateArtikel,
  verschiebeArtikelKategorie,
  listArtikelQuellen,
  listVorschlaege,
  verwirfVorschlag,
  setzeVorschlaegeZurueck,
  bestaetigeArtikel,
  lehneArtikelAb,
  erkenneArtikelAusText,
  erkenneEinkaufslisteAusFoto,
} from "./actions";
import { pruefeZutatenFuerRezept, uebernehmeZusaetzlicheZutaten } from "../essensplan/actions";
import { erkenneKategorie } from "@/lib/kategorisierung";
import { erkenneArtikelIcon } from "@/lib/artikelIcon";
import HistorieVerlauf from "@/components/HistorieVerlauf";
import FaktorLeiste from "@/components/FaktorLeiste";
import Spracheingabe from "@/components/Spracheingabe";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

type Artikel = {
  id: string;
  name: string;
  menge: string | null;
  notiz: string | null;
  iconOverride: string | null;
  erledigt: boolean;
  kategorieId: string | null;
  kategorieName: string;
};
type Wunsch = { id: string; artikelName: string; menge: string | null; notiz: string | null; status: string; kindName: string; entschiedenAm: string | null };
type Kategorie = { id: string; name: string };
type Quelle = { id: string; beschreibung: string; menge: string | null; zeitpunkt: string };
type Vorschlag = { name: string; menge: string | null };
type Unbestaetigt = { id: string; name: string; menge: string | null; herkunft: { rezeptName: string; tag: string }[] };
type RezeptKurz = { id: string; name: string };
type Zutat = { name: string; menge?: string };

function ArtikelHerkunft({ artikelId }: { artikelId: string }) {
  const [quellen, setQuellen] = useState<Quelle[] | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <details
      style={{ marginLeft: 28 }}
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && quellen === null) {
          startTransition(async () => setQuellen(await listArtikelQuellen(artikelId)));
        }
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Herkunft</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        {pending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Lädt …</span>}
        {quellen?.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Keine Herkunft erfasst.</span>}
        {quellen?.map((q) => (
          <div key={q.id} style={{ fontSize: 12 }}>
            {q.menge ? `${q.menge} · ` : ""}
            {q.beschreibung}
          </div>
        ))}
      </div>
    </details>
  );
}

// Kachel-Ansicht statt Checkbox-Zeilen (Fix-Batch 25, Florians Referenz-Screenshot) —
// Antippen der Kachel selbst löst die Hauptaktion aus (abhaken bzw. hinzufügen), eine
// kleine Ecken-Schaltfläche (nur Eltern) öffnet bei Bedarf die Detail-/Bearbeiten-Ansicht.
function ArtikelKachel({
  name,
  menge,
  notiz,
  iconOverride,
  hintergrund,
  textfarbe,
  durchgestrichen,
  deaktiviert,
  onTap,
  eckeAktion,
}: {
  name: string;
  menge?: string | null;
  notiz?: string | null;
  iconOverride?: string | null;
  hintergrund: string;
  textfarbe: string;
  durchgestrichen?: boolean;
  deaktiviert?: boolean;
  onTap?: () => void;
  eckeAktion?: ReactNode;
}) {
  // Fix-Batch 35 Nachtrag (Ticket "Icon-Größe..."): Kacheln bewusst kompakt gehalten (auch im
  // Einkaufsmodus NICHT vergrößert, im Gegenteil das war vorher der Fehler) — Florian will beim
  // Einkaufen möglichst viele Artikel auf einen Blick sehen, nicht wenige große.
  return (
    <div
      onClick={deaktiviert ? undefined : onTap}
      style={{
        position: "relative",
        background: hintergrund,
        color: textfarbe,
        borderRadius: 10,
        padding: "6px 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        textAlign: "center",
        aspectRatio: "1",
        cursor: deaktiviert || !onTap ? "default" : "pointer",
      }}
    >
      {eckeAktion && (
        <div style={{ position: "absolute", top: 1, right: 1 }} onClick={(e) => e.stopPropagation()}>
          {eckeAktion}
        </div>
      )}
      <span style={{ fontSize: 17, lineHeight: 1 }}>{iconOverride || erkenneArtikelIcon(name)}</span>
      <span style={{ fontWeight: 600, fontSize: 10, textDecoration: durchgestrichen ? "line-through" : "none", lineHeight: 1.15 }}>{name}</span>
      {menge && <span style={{ fontSize: 8, opacity: 0.85 }}>{menge}</span>}
      {notiz && <span style={{ fontSize: 8, opacity: 0.75, fontStyle: "italic" }}>{notiz}</span>}
    </div>
  );
}

// Für den Foto-Massenimport (Fix-Batch 35 Nachtrag) — analog dem Resize bei Rezept-/Noten-/
// Ticket-Fotos.
function listenFotoAufBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const bild = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      bild.onerror = reject;
      bild.onload = () => {
        const maxBreite = 1500;
        const skalierung = Math.min(1, maxBreite / bild.width);
        const canvas = document.createElement("canvas");
        canvas.width = bild.width * skalierung;
        canvas.height = bild.height * skalierung;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas nicht verfügbar"));
        ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      bild.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type ListenVorschauZeile = { name: string; menge: string; ausgewaehlt: boolean };

export default function EinkaufslisteClient({
  istEltern,
  artikel,
  wuensche,
  kategorien,
  vorschlaege,
  unbestaetigt: initialUnbestaetigt,
  rezepte,
}: {
  istEltern: boolean;
  artikel: Artikel[];
  wuensche: Wunsch[];
  kategorien: Kategorie[];
  vorschlaege: Vorschlag[];
  unbestaetigt: Unbestaetigt[];
  rezepte: RezeptKurz[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [menge, setMenge] = useState("");
  const [notiz, setNotiz] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bearbeiteName, setBearbeiteName] = useState("");
  const [bearbeiteMenge, setBearbeiteMenge] = useState("");
  const [bearbeiteNotiz, setBearbeiteNotiz] = useState("");
  const [bearbeiteIcon, setBearbeiteIcon] = useState("");
  const [wunschKategorie, setWunschKategorie] = useState<Record<string, string>>({});
  const [wunschBearbeitenId, setWunschBearbeitenId] = useState<string | null>(null);
  const [wunschBearbeitenName, setWunschBearbeitenName] = useState("");
  const [wunschBearbeitenMenge, setWunschBearbeitenMenge] = useState("");
  const [wunschBearbeitenNotiz, setWunschBearbeitenNotiz] = useState("");

  const [unbestaetigt, setUnbestaetigt] = useState(initialUnbestaetigt);
  const [unbestaetigtMengen, setUnbestaetigtMengen] = useState<Record<string, string>>({});
  const [unbestaetigtNamen, setUnbestaetigtNamen] = useState<Record<string, string>>({});

  const [extraRezeptId, setExtraRezeptId] = useState("");
  const [extraFaktor, setExtraFaktor] = useState(1);
  const [extraZeilen, setExtraZeilen] = useState<Zutat[]>([]);
  const [extraAusgewaehlt, setExtraAusgewaehlt] = useState<boolean[]>([]);
  const [extraGeprueft, setExtraGeprueft] = useState(false);
  const [spracheVerarbeitung, setSpracheVerarbeitung] = useState(false);
  const [einkaufsmodus, setEinkaufsmodus] = useState(false);
  const [zeigeListenImport, setZeigeListenImport] = useState(false);
  const [listenImportLaeuft, setListenImportLaeuft] = useState(false);
  const [listenVorschau, setListenVorschau] = useState<ListenVorschauZeile[] | null>(null);
  // Eltern-Bearbeitung eines Kind-Wunsches vor dem Genehmigen (Fix-Batch 49) — Name/Menge
  // sind hier direkt korrigierbar, statt nur pauschal genehmigen/ablehnen zu können.
  const [wunschBearbeitung, setWunschBearbeitung] = useState<Record<string, { name: string; menge: string }>>({});
  // Deep-Link vom Dashboard aus (Fix-Batch 49): "?highlight=<id>" springt direkt zum
  // passenden Wunsch und lässt ihn kurz blinken.
  const [highlightWunschId, setHighlightWunschId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("highlight");
    if (!id) return;
    setHighlightWunschId(id);
    const timer = setTimeout(() => {
      document.getElementById(`wunsch-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Einkaufsmodus (Fix-Batch 35, Florians Wunsch): hält den Bildschirm wach, solange man mit
  // der Liste im Laden unterwegs ist (Wake Lock API) — verhindert, dass das Display beim
  // Schieben des Einkaufswagens ständig ausgeht. Kein Fehler, wenn der Browser das nicht
  // unterstützt (z.B. iOS Safari älter) — dann bleibt es einfach beim Standardverhalten.
  useEffect(() => {
    if (!einkaufsmodus || !("wakeLock" in navigator)) return;
    let sentinel: any = null;
    let abgebrochen = false;
    async function anfordern() {
      try {
        sentinel = await (navigator as any).wakeLock.request("screen");
      } catch {}
    }
    anfordern();
    function beiSichtbarkeitswechsel() {
      if (document.visibilityState === "visible" && !abgebrochen) anfordern();
    }
    document.addEventListener("visibilitychange", beiSichtbarkeitswechsel);
    return () => {
      abgebrochen = true;
      document.removeEventListener("visibilitychange", beiSichtbarkeitswechsel);
      sentinel?.release?.().catch(() => {});
    };
  }, [einkaufsmodus]);

  async function spracheErkannt(text: string) {
    setSpracheVerarbeitung(true);
    try {
      const ergebnis = await erkenneArtikelAusText(text);
      if (!ergebnis.ok) {
        alert(ergebnis.fehler);
        return;
      }
      setName(ergebnis.artikel.name);
      setMenge(ergebnis.artikel.menge ?? "");
    } finally {
      setSpracheVerarbeitung(false);
    }
  }

  async function aendereExtraFaktor(faktor: number) {
    setExtraFaktor(faktor);
    if (extraGeprueft && extraRezeptId) {
      const zeilen = await pruefeZutatenFuerRezept(extraRezeptId, faktor);
      setExtraZeilen(zeilen);
      setExtraAusgewaehlt(zeilen.map(() => true));
    }
  }

  async function starteExtraPruefung() {
    if (!extraRezeptId) return;
    const zeilen = await pruefeZutatenFuerRezept(extraRezeptId, extraFaktor);
    setExtraZeilen(zeilen);
    setExtraAusgewaehlt(zeilen.map(() => true));
    setExtraGeprueft(true);
  }

  const kategorieNachName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of kategorien) m[k.name] = k.id;
    return m;
  }, [kategorien]);

  // Live-Vorschau: welche Kategorie würde "Automatisch" für den aktuell getippten Namen erkennen?
  const erkannteKategorieName = useMemo(() => erkenneKategorie(name), [name]);

  function erkannteKategorieFuer(artikelName: string): string | null {
    if (!artikelName) return null;
    return erkenneKategorie(artikelName);
  }

  const nachKategorie = useMemo(() => {
    const offene = artikel.filter((a) => !a.erledigt);
    const gruppen: Record<string, Artikel[]> = {};
    for (const a of offene) {
      gruppen[a.kategorieName] = gruppen[a.kategorieName] || [];
      gruppen[a.kategorieName].push(a);
    }
    return gruppen;
  }, [artikel]);

  const erledigt = artikel.filter((a) => a.erledigt);
  const offeneWuensche = wuensche.filter((w) => w.status === "OFFEN");
  const entschiedeneWuensche = wuensche.filter((w) => w.status !== "OFFEN");

  function beginneBearbeiten(a: Artikel) {
    setBearbeiteId(a.id);
    setBearbeiteName(a.name);
    setBearbeiteMenge(a.menge ?? "");
    setBearbeiteNotiz(a.notiz ?? "");
    setBearbeiteIcon(a.iconOverride ?? "");
  }

  function speichereBearbeiten() {
    if (!bearbeiteId) return;
    startTransition(async () => {
      await updateArtikel(bearbeiteId, {
        name: bearbeiteName,
        menge: bearbeiteMenge || undefined,
        notiz: bearbeiteNotiz || undefined,
        iconOverride: bearbeiteIcon,
      });
      setBearbeiteId(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <SeitenTitel icon="🛒" farbe={BEREICH_FARBEN.einkaufsliste}>Einkaufsliste</SeitenTitel>
        {istEltern && (
          <button
            className={einkaufsmodus ? "btn" : "btn-secondary"}
            style={{ fontSize: 13, padding: "8px 12px", flexShrink: 0 }}
            onClick={() => setEinkaufsmodus((v) => !v)}
          >
            {einkaufsmodus ? "✕ Fertig" : "🛍️ Einkaufsmodus"}
          </button>
        )}
      </div>
      {einkaufsmodus && (
        <p style={{ margin: "-8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          {erledigt.length} von {artikel.length} erledigt — Bildschirm bleibt an, solange der Einkaufsmodus läuft.
        </p>
      )}

      {!einkaufsmodus && istEltern && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn-secondary" onClick={() => setZeigeListenImport((v) => !v)}>
            📷 Liste aus Foto/Screenshot importieren
          </button>
          {zeigeListenImport && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                Foto einer handgeschriebenen Liste oder Screenshot einer anderen App — die erkannten Artikel kannst du danach noch prüfen, bevor sie wirklich hinzugefügt werden.
              </p>
              <input
                type="file"
                accept="image/*"
                disabled={listenImportLaeuft}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setListenImportLaeuft(true);
                  setListenVorschau(null);
                  try {
                    const foto = await listenFotoAufBase64(file);
                    const ergebnis = await erkenneEinkaufslisteAusFoto(foto);
                    if (!ergebnis.ok) {
                      alert(ergebnis.fehler);
                      return;
                    }
                    if (ergebnis.artikel.length === 0) {
                      alert("Es konnten keine Artikel auf dem Foto erkannt werden.");
                      return;
                    }
                    setListenVorschau(
                      ergebnis.artikel.map((a) => ({ name: a.name, menge: a.menge ?? "", ausgewaehlt: true }))
                    );
                  } finally {
                    setListenImportLaeuft(false);
                  }
                }}
              />
              {listenImportLaeuft && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Foto wird analysiert …</p>}
              {listenVorschau && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>Erkannte Artikel — bitte prüfen:</strong>
                  {listenVorschau.map((zeile, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={zeile.ausgewaehlt}
                        onChange={(e) =>
                          setListenVorschau((prev) => prev!.map((z, idx) => (idx === i ? { ...z, ausgewaehlt: e.target.checked } : z)))
                        }
                      />
                      <input
                        value={zeile.name}
                        onChange={(e) => setListenVorschau((prev) => prev!.map((z, idx) => (idx === i ? { ...z, name: e.target.value } : z)))}
                        style={{ flex: 2, fontSize: 13 }}
                      />
                      <input
                        placeholder="Menge"
                        value={zeile.menge}
                        onChange={(e) => setListenVorschau((prev) => prev!.map((z, idx) => (idx === i ? { ...z, menge: e.target.value } : z)))}
                        style={{ flex: 1, fontSize: 13 }}
                      />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const ausgewaehlte = listenVorschau.filter((z) => z.ausgewaehlt && z.name.trim());
                          for (const z of ausgewaehlte) {
                            await addArtikel({ name: z.name.trim(), menge: z.menge.trim() || undefined });
                          }
                          setListenVorschau(null);
                          setZeigeListenImport(false);
                        })
                      }
                    >
                      Ausgewählte hinzufügen ({listenVorschau.filter((z) => z.ausgewaehlt).length})
                    </button>
                    <button className="btn-secondary" onClick={() => setListenVorschau(null)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {einkaufsmodus ? null : istEltern ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
          <input placeholder="Artikel" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Menge (optional)" value={menge} onChange={(e) => setMenge(e.target.value)} />
          <input placeholder="Notizen (optional, z. B. Körnerbrot)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <select value={kategorieId} onChange={(e) => setKategorieId(e.target.value)}>
            <option value="">Automatisch{erkannteKategorieName ? ` (erkannt: ${erkannteKategorieName})` : ""}</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          {!kategorieId && name && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              {erkannteKategorieName
                ? `→ wird automatisch als ${erkannteKategorieName} einsortiert`
                : `→ keine Kategorie erkannt, landet in Sonstiges (oben manuell wählbar)`}
            </p>
          )}
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await addArtikel({ name, menge: menge || undefined, notiz: notiz || undefined, kategorieId: kategorieId || undefined });
                setName("");
                setMenge("");
                setNotiz("");
                setKategorieId("");
              })
            }
          >
            Hinzufügen
          </button>
        </div>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Du kannst die Liste nicht direkt ändern — reiche stattdessen einen Wunsch ein, den die Eltern genehmigen.
          </p>
          <Spracheingabe onErgebnis={spracheErkannt} disabled={spracheVerarbeitung} />
          {spracheVerarbeitung && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Spracheingabe wird verarbeitet …</p>}
          <input placeholder="Was wünschst du dir?" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Menge (optional)" value={menge} onChange={(e) => setMenge(e.target.value)} />
          <input placeholder="Notizen (optional, z. B. Körnerbrot)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!name) return;
                await submitWunsch({ artikelName: name, menge: menge || undefined, notiz: notiz || undefined });
                setName("");
                setMenge("");
                setNotiz("");
              })
            }
          >
            Wunsch einreichen
          </button>
          {offeneWuensche.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <strong style={{ fontSize: 13 }}>Meine offenen Wünsche</strong>
              {offeneWuensche.map((w) =>
                wunschBearbeitenId === w.id ? (
                  <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input value={wunschBearbeitenName} onChange={(e) => setWunschBearbeitenName(e.target.value)} autoFocus />
                    <input placeholder="Menge (optional)" value={wunschBearbeitenMenge} onChange={(e) => setWunschBearbeitenMenge(e.target.value)} />
                    <input placeholder="Notizen (optional)" value={wunschBearbeitenNotiz} onChange={(e) => setWunschBearbeitenNotiz(e.target.value)} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() =>
                          startTransition(async () => {
                            if (!wunschBearbeitenName.trim()) return;
                            try {
                              await updateWunsch(w.id, {
                                artikelName: wunschBearbeitenName.trim(),
                                menge: wunschBearbeitenMenge || undefined,
                                notiz: wunschBearbeitenNotiz || undefined,
                              });
                              setWunschBearbeitenId(null);
                            } catch (e: any) {
                              alert(e.message);
                            }
                          })
                        }
                      >
                        Speichern
                      </button>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setWunschBearbeitenId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <span>
                      {w.artikelName}
                      {w.menge ? ` (${w.menge})` : ""}
                      {w.notiz ? ` · ${w.notiz}` : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "3px 8px" }}
                        onClick={() => {
                          setWunschBearbeitenId(w.id);
                          setWunschBearbeitenName(w.artikelName);
                          setWunschBearbeitenMenge(w.menge ?? "");
                          setWunschBearbeitenNotiz(w.notiz ?? "");
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "3px 8px" }}
                        onClick={() => {
                          if (confirm(`Wunsch „${w.artikelName}" wirklich zurückziehen?`)) startTransition(() => deleteWunsch(w.id));
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {!einkaufsmodus && istEltern && unbestaetigt.length > 0 && (
        <details open>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>🕓 Noch nicht zugesagt ({unbestaetigt.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Aus dem Essensplan übertragen — bitte prüfen, ob wirklich noch eingekauft werden muss (oder schon (teilweise) zu Hause vorrätig ist).
            </p>
            {unbestaetigt.map((a) => (
              <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  value={unbestaetigtNamen[a.id] ?? a.name}
                  onChange={(e) => setUnbestaetigtNamen((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  style={{ fontSize: 14, fontWeight: 600 }}
                />
                {a.herkunft.length > 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    Für:{" "}
                    {a.herkunft
                      .map((h) => `${h.rezeptName} (${new Date(h.tag).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })})`)
                      .join(", ")}
                  </p>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    placeholder="Menge anpassen"
                    value={unbestaetigtMengen[a.id] ?? a.menge ?? ""}
                    onChange={(e) => setUnbestaetigtMengen((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    style={{ flex: "1 1 120px" }}
                  />
                  <button
                    className="btn"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await bestaetigeArtikel(a.id, {
                          menge: unbestaetigtMengen[a.id] ?? a.menge ?? undefined,
                          name: unbestaetigtNamen[a.id] ?? a.name,
                        });
                        setUnbestaetigt((prev) => prev.filter((x) => x.id !== a.id));
                      })
                    }
                  >
                    ✓ Übernehmen
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await lehneArtikelAb(a.id);
                        setUnbestaetigt((prev) => prev.filter((x) => x.id !== a.id));
                      })
                    }
                  >
                    ✕ Brauchen wir nicht
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {!einkaufsmodus && istEltern && rezepte.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>➕ Extra-Gericht zur Einkaufsliste hinzufügen</summary>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Für Anlässe außerhalb des Essensplans — z. B. ein Dip fürs Grillen zusätzlich einkaufen.
            </p>
            <select
              value={extraRezeptId}
              onChange={(e) => {
                setExtraRezeptId(e.target.value);
                setExtraGeprueft(false);
                setExtraZeilen([]);
              }}
            >
              <option value="">– Rezept wählen –</option>
              {rezepte.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <FaktorLeiste faktor={extraFaktor} onChange={aendereExtraFaktor} />
            {!extraGeprueft && (
              <button className="btn-secondary" style={{ alignSelf: "flex-start" }} disabled={!extraRezeptId} onClick={() => startTransition(starteExtraPruefung)}>
                Zutaten anzeigen
              </button>
            )}
            {extraGeprueft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {extraZeilen.map((z, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={extraAusgewaehlt[i]}
                      onChange={() => setExtraAusgewaehlt((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                    />
                    <span style={{ textDecoration: extraAusgewaehlt[i] ? "none" : "line-through", color: extraAusgewaehlt[i] ? undefined : "var(--text-muted)" }}>
                      {z.menge ? `${z.menge} ${z.name}` : z.name}
                    </span>
                  </label>
                ))}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const ausgewaehlt = extraZeilen.filter((_, i) => extraAusgewaehlt[i]);
                        const faktorLabel = `${extraFaktor}×`.replace(".", ",");
                        await uebernehmeZusaetzlicheZutaten(extraRezeptId, ausgewaehlt, faktorLabel);
                        setExtraRezeptId("");
                        setExtraFaktor(1);
                        setExtraZeilen([]);
                        setExtraGeprueft(false);
                      })
                    }
                  >
                    Zur Einkaufsliste hinzufügen ({extraAusgewaehlt.filter(Boolean).length})
                  </button>
                  <button className="btn-secondary" onClick={() => setExtraGeprueft(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {!einkaufsmodus && istEltern && vorschlaege.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Vorschläge — zuletzt verwendet ({vorschlaege.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Häufig gekaufte Artikel, die gerade nicht auf der Liste stehen — antippen zum Hinzufügen.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(66px, 1fr))", gap: 10 }}>
              {vorschlaege.map((v) => (
                <ArtikelKachel
                  key={v.name}
                  name={v.name}
                  menge={v.menge}
                  hintergrund="var(--success)"
                  textfarbe="#fff"
                  onTap={() => startTransition(async () => { await addArtikel({ name: v.name, menge: v.menge || undefined }); })}
                  eckeAktion={
                    <button
                      title="Seltener vorschlagen"
                      onClick={() => startTransition(() => verwirfVorschlag(v.name))}
                      style={{ background: "rgba(0,0,0,0.25)", color: "#fff", border: "none", borderRadius: 999, width: 22, height: 22, fontSize: 12, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  }
                />
              ))}
            </div>
            <button className="btn-secondary" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={() => startTransition(() => setzeVorschlaegeZurueck())}>
              Zurücksetzen
            </button>
          </div>
        </details>
      )}

      {!einkaufsmodus && istEltern && offeneWuensche.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>Wünsche der Kinder</strong>
          {offeneWuensche.map((w) => {
            const erkannt = erkannteKategorieFuer(w.artikelName);
            const gewaehlt = wunschKategorie[w.id] ?? "";
            const entwurf = wunschBearbeitung[w.id] ?? { name: w.artikelName, menge: w.menge ?? "" };
            return (
              <div
                key={w.id}
                id={`wunsch-${w.id}`}
                className={w.id === highlightWunschId ? "highlight-blink" : undefined}
                style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={entwurf.name}
                        onChange={(e) => setWunschBearbeitung((prev) => ({ ...prev, [w.id]: { ...entwurf, name: e.target.value } }))}
                        style={{ flex: 1, fontSize: 14 }}
                      />
                      <input
                        placeholder="Menge"
                        value={entwurf.menge}
                        onChange={(e) => setWunschBearbeitung((prev) => ({ ...prev, [w.id]: { ...entwurf, menge: e.target.value } }))}
                        style={{ width: 90, fontSize: 14 }}
                      />
                    </div>
                    <em style={{ fontSize: 12, color: "var(--text-muted)" }}>Wunsch von {w.kindName}</em>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn"
                      style={{ padding: "6px 10px" }}
                      onClick={() =>
                        startTransition(async () => {
                          const name = entwurf.name.trim();
                          if (name && (name !== w.artikelName || entwurf.menge !== (w.menge ?? ""))) {
                            await updateWunsch(w.id, { artikelName: name, menge: entwurf.menge || undefined });
                          }
                          await entscheideWunsch(w.id, true, gewaehlt || (erkannt ? kategorieNachName[erkannt] : undefined));
                        })
                      }
                    >
                      ✓
                    </button>
                    <button className="btn-danger" style={{ padding: "6px 10px", borderRadius: 10, border: "none" }} onClick={() => startTransition(() => entscheideWunsch(w.id, false))}>
                      ✕
                    </button>
                  </div>
                </div>
                <select
                  value={gewaehlt}
                  onChange={(e) => setWunschKategorie((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  style={{ fontSize: 13 }}
                >
                  <option value="">Automatisch{erkannt ? ` (erkannt: ${erkannt})` : ""}</option>
                  {kategorien.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <HistorieVerlauf entityTyp="EINKAUFS_WUNSCH" entityId={w.id} />
              </div>
            );
          })}
        </div>
      )}

      {!einkaufsmodus && entschiedeneWuensche.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Wunsch-Verlauf ({entschiedeneWuensche.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {entschiedeneWuensche.map((w) => (
              <div key={w.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>
                  {w.artikelName} {w.menge ? `(${w.menge})` : ""}
                  {istEltern && <span style={{ color: "var(--text-muted)" }}> — {w.kindName}</span>}
                  {w.entschiedenAm && <span style={{ color: "var(--text-muted)" }}> · {new Date(w.entschiedenAm).toLocaleDateString("de-DE")}</span>}
                </span>
                <span className={`pill pill-${w.status.toLowerCase()}`}>{w.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {Object.entries(nachKategorie).map(([kat, items]) => (
        <div key={kat} className="card">
          <strong>{kat}</strong>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(66px, 1fr))",
              gap: 8,
              marginTop: 8,
            }}
          >
            {items.map((a) => (
              <ArtikelKachel
                key={a.id}
                name={a.name}
                menge={a.menge}
                notiz={a.notiz}
                iconOverride={a.iconOverride}
                hintergrund="var(--accent)"
                textfarbe="var(--accent-contrast)"
                deaktiviert={!istEltern}
                onTap={() => startTransition(() => toggleArtikel(a.id))}
                eckeAktion={
                  istEltern && !einkaufsmodus ? (
                    <button
                      title="Bearbeiten"
                      onClick={() => beginneBearbeiten(a)}
                      style={{ background: "rgba(0,0,0,0.25)", color: "#fff", border: "none", borderRadius: 999, width: 22, height: 22, fontSize: 12, cursor: "pointer" }}
                    >
                      ⋯
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}

      {erledigt.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Bereits eingekauft ({erledigt.length})</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(66px, 1fr))", gap: 10, marginTop: 8 }}>
            {erledigt.map((a) => (
              <ArtikelKachel
                key={a.id}
                name={a.name}
                notiz={a.notiz}
                iconOverride={a.iconOverride}
                hintergrund="var(--border)"
                textfarbe="var(--text-muted)"
                durchgestrichen
                deaktiviert={!istEltern}
                onTap={() => startTransition(() => toggleArtikel(a.id))}
              />
            ))}
          </div>
        </details>
      )}

      {bearbeiteId &&
        (() => {
          const a = artikel.find((x) => x.id === bearbeiteId);
          if (!a) return null;
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
              <div className="card" style={{ maxWidth: 380, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                <strong>Artikel bearbeiten</strong>
                <input value={bearbeiteName} onChange={(e) => setBearbeiteName(e.target.value)} placeholder="Name" />
                <input value={bearbeiteMenge} onChange={(e) => setBearbeiteMenge(e.target.value)} placeholder="Menge" />
                <input value={bearbeiteNotiz} onChange={(e) => setBearbeiteNotiz(e.target.value)} placeholder="Notizen (optional)" />
                <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>
                  Icon (aktuell: {bearbeiteIcon || erkenneArtikelIcon(bearbeiteName)}) — nicht zufrieden? Eigenes Emoji eintragen
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={bearbeiteIcon}
                    onChange={(e) => setBearbeiteIcon(e.target.value)}
                    placeholder="z. B. 🥕"
                    style={{ flex: 1 }}
                  />
                  {bearbeiteIcon && (
                    <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setBearbeiteIcon("")}>
                      Automatisch
                    </button>
                  )}
                </div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: -6 }}>Kategorie</label>
                <select
                  value={a.kategorieId ?? ""}
                  onChange={(e) => startTransition(() => verschiebeArtikelKategorie(a.id, e.target.value))}
                >
                  <option value="">Sonstiges</option>
                  {kategorien.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <ArtikelHerkunft artikelId={a.id} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={pending} onClick={speichereBearbeiten}>
                    Speichern
                  </button>
                  <button className="btn-secondary" onClick={() => setBearbeiteId(null)}>
                    Abbrechen
                  </button>
                  <button
                    className="btn-danger"
                    style={{ marginLeft: "auto", borderRadius: 10, border: "none", padding: "10px 16px" }}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteArtikel(a.id);
                        setBearbeiteId(null);
                      })
                    }
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {!einkaufsmodus && istEltern && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Kategorien verwalten (hinzufügen, Reihenfolge ändern) geht jetzt zentral in den Einstellungen.
        </p>
      )}
    </div>
  );
}
