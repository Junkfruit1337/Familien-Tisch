"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addRezept,
  deleteRezept,
  getWochenplan,
  listRezepteFuerWoche,
  listAusgeblendeteFuerWoche,
  blendeRezeptAus,
  zeigeRezeptWiederAn,
  setTag,
  sperren,
  entsperren,
  setEsser,
  setExtraPortionen,
  fuegeZutatenDesTagsHinzu,
  fuegeZutatenDerWocheHinzu,
  pruefeGelocktenTagWechsel,
  entferneTag,
  erkenneRezeptAusFoto,
  erkenneRezeptAusText,
  updateRezeptPortionenBasis,
  updateRezept,
  schlageSaisonaleIdeeVor,
  verdichteZubereitungVorschau,
  schreibeRezeptUmVorschau,
  pruefeAusgewogenheitDerWoche,
  findeRezeptImInternetVorschau,
  schlageRezeptZuBeschreibungVorschau,
} from "./actions";
import SeitenTitel from "@/components/SeitenTitel";
import Spracheingabe from "@/components/Spracheingabe";
import { pruefeZutatenVollstaendig } from "@/lib/rezeptValidierung";
import PersonChip from "@/components/PersonChip";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

// Für die Foto-Erkennung etwas größer/hochwertiger als bei Notenfotos (Batch 3),
// damit auch kleinere Kochbuch-/Handschrift-Texte für die Bilderkennung lesbar bleiben.
function rezeptfotoAufBase64(file: File): Promise<string> {
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
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      bild.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type TagEintrag = {
  id: string;
  rezeptName: string;
  rezeptId: string;
  gelockt: boolean;
  esserIds: string[];
  esserFaktor: number;
  extraPortionen: number;
};
type Tag = { tag: string; vergangen: boolean; eintrag: TagEintrag | null };
type Plan = { wocheStart: string; wocheEnde: string; tage: Tag[] };
type RezeptDetail = { id: string; name: string; zutaten: string; zubereitung: string | null; portionenBasis: number };
type RezeptKurz = { id: string; name: string; zuletztGeplant: string | null };

// Fix-Batch 62 (Florians Wunsch): Rezepte, die lange nicht (oder noch nie) auf dem Plan
// standen, im Auswahl-Dropdown markieren, damit nicht immer dieselben paar Gerichte laufen.
const LANGE_NICHT_GEKOCHT_TAGE = 21;
function istLangeNichtGekocht(zuletztGeplant: string | null): boolean {
  if (!zuletztGeplant) return true;
  const tageHer = (Date.now() - new Date(zuletztGeplant).getTime()) / (1000 * 60 * 60 * 24);
  return tageHer >= LANGE_NICHT_GEKOCHT_TAGE;
}
type Familienmitglied = { id: string; name: string; farbe: string; portionsGewicht: number };
type Herkunft = { artikelId: string; artikelName: string; menge: string | null };

const WOCHEN_LABEL = ["Diese Woche", "Nächste Woche", "Übernächste Woche"];

type Ausgewogenheit = { fleischGerichte: number; gesamtGerichte: number; hinweis: string | null };
type ErkanntesRezeptClient = { name: string; zutaten: string; zubereitung: string; portionen: number | null };

export default function EssensplanClient({
  istEltern,
  plan: initialPlan,
  rezepteAlle,
  rezepteVorschlaege: initialVorschlaege,
  ausgeblendete: initialAusgeblendete,
  familie,
  ausgewogenheitInitial,
}: {
  istEltern: boolean;
  plan: Plan;
  rezepteAlle: RezeptDetail[];
  rezepteVorschlaege: RezeptKurz[];
  ausgeblendete: { rezeptId: string; name: string }[];
  familie: Familienmitglied[];
  ausgewogenheitInitial: Ausgewogenheit | null;
}) {
  const [pending, startTransition] = useTransition();
  const [offset, setOffset] = useState(0);
  const [plan, setPlan] = useState(initialPlan);
  const [vorschlaege, setVorschlaege] = useState(initialVorschlaege);
  const [ausgeblendete, setAusgeblendete] = useState(initialAusgeblendete);
  const [ausgewogenheit, setAusgewogenheit] = useState(ausgewogenheitInitial);

  const [umschreibeRezeptId, setUmschreibeRezeptId] = useState<string | null>(null);
  const [umschreibeAnweisung, setUmschreibeAnweisung] = useState("");
  const [umschreibeVorschau, setUmschreibeVorschau] = useState<ErkanntesRezeptClient | null>(null);
  const [umschreibenLaeuft, setUmschreibenLaeuft] = useState(false);
  const [verdichtenLaeuft, setVerdichtenLaeuft] = useState(false);
  const [saisonLaeuft, setSaisonLaeuft] = useState(false);

  const [rezeptFinderText, setRezeptFinderText] = useState("");
  const [rezeptFinderLaeuft, setRezeptFinderLaeuft] = useState(false);
  const [rezeptFinderQuelle, setRezeptFinderQuelle] = useState<string | null>(null);

  const [portionenEntwuerfe, setPortionenEntwuerfe] = useState<Record<string, string>>({});
  const [bearbeiteRezeptId, setBearbeiteRezeptId] = useState<string | null>(null);
  const [rezeptZutatenEntwurf, setRezeptZutatenEntwurf] = useState("");
  const [rezeptZubereitungEntwurf, setRezeptZubereitungEntwurf] = useState("");
  const [extraEntwuerfe, setExtraEntwuerfe] = useState<Record<string, string>>({});

  const [sperrDialog, setSperrDialog] = useState<{ eintragId: string; herkuenfte: Herkunft[] } | null>(null);
  const [sperrEntscheidungen, setSperrEntscheidungen] = useState<Record<string, "entfernen" | "behalten">>({});

  const [neuName, setNeuName] = useState("");
  const [neuZutaten, setNeuZutaten] = useState("");
  const [neuZubereitung, setNeuZubereitung] = useState("");
  const [neuPortionenBasis, setNeuPortionenBasis] = useState("6");
  const [erkennungLaeuft, setErkennungLaeuft] = useState(false);
  const [zeigeZutatenWarnungNeu, setZeigeZutatenWarnungNeu] = useState(false);
  const [zeigeZutatenWarnungEdit, setZeigeZutatenWarnungEdit] = useState(false);

  // Fix-Batch 71 (Florians Wunsch): egal woher die Zutatenliste kommt (manuell, Sprache,
  // Foto, KI-Umschreibung/-Vorschlag) — jede Zeile braucht eine Menge, mit der später
  // gerechnet werden kann (g/kg/ml/l/Stück/EL/TL/...), einzige Ausnahme "Prise".
  const neuZutatenPruefung = useMemo(() => pruefeZutatenVollstaendig(neuZutaten), [neuZutaten]);
  const rezeptZutatenEntwurfPruefung = useMemo(() => pruefeZutatenVollstaendig(rezeptZutatenEntwurf), [rezeptZutatenEntwurf]);

  async function ladeWoche(neuerOffset: number) {
    const neuerPlan = await getWochenplan(neuerOffset);
    const [neueVorschlaege, neueAusgeblendete, neueAusgewogenheit] = await Promise.all([
      listRezepteFuerWoche(neuerPlan.wocheStart),
      istEltern ? listAusgeblendeteFuerWoche(neuerPlan.wocheStart) : Promise.resolve([]),
      istEltern ? pruefeAusgewogenheitDerWoche(neuerPlan.wocheStart) : Promise.resolve(null),
    ]);
    setPlan(neuerPlan);
    setVorschlaege(neueVorschlaege);
    setAusgeblendete(neueAusgeblendete);
    setAusgewogenheit(neueAusgewogenheit);
  }

  function wechsleWoche(neuerOffset: number) {
    if (neuerOffset < 0 || neuerOffset > 2) return;
    setOffset(neuerOffset);
    startTransition(() => ladeWoche(neuerOffset));
  }

  function zutatenHinzufuegen(eintragId: string) {
    startTransition(() => fuegeZutatenDesTagsHinzu(eintragId).then(() => ladeWoche(offset)));
  }

  function zutatenDerWocheHinzufuegen() {
    startTransition(() => fuegeZutatenDerWocheHinzu(plan.wocheStart).then(() => ladeWoche(offset)));
  }

  // Gericht ändern geht nur bei entsperrtem Tag (Dropdown ist sonst deaktiviert, siehe unten) —
  // kein Lock-Check hier mehr nötig, das vereinfacht den vorherigen Doppelweg (Fix-Batch 29).
  function tagAendern(t: Tag, neuesRezeptId: string) {
    startTransition(() => setTag(plan.wocheStart, t.tag, neuesRezeptId).then(() => ladeWoche(offset)));
  }

  // Fix-Batch 74 (Florians Bug-Meldung): "– kein Gericht –" auswählen setzte bisher gar nichts
  // in Bewegung, das Dropdown sprang optisch sofort auf das weiterhin bestehende Gericht
  // zurück ("bleibt durchgehend geöffnet"). Nur relevant, wenn überhaupt ein Eintrag da ist.
  function tagEntfernen(t: Tag) {
    if (!t.eintrag) return;
    startTransition(() => entferneTag(plan.wocheStart, t.tag).then(() => ladeWoche(offset)));
  }

  async function klickSchloss(t: Tag) {
    if (!t.eintrag) return;
    if (!t.eintrag.gelockt) {
      startTransition(() => sperren(t.eintrag!.id).then(() => ladeWoche(offset)));
      return;
    }
    const herkuenfte = await pruefeGelocktenTagWechsel(t.eintrag.id);
    if (herkuenfte.length === 0) {
      startTransition(() => entsperren(t.eintrag!.id, []).then(() => ladeWoche(offset)));
      return;
    }
    setSperrDialog({ eintragId: t.eintrag.id, herkuenfte });
    setSperrEntscheidungen(Object.fromEntries(herkuenfte.map((h) => [h.artikelId, "entfernen" as const])));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SeitenTitel icon="🍽️" farbe={BEREICH_FARBEN.essensplan}>Essensplan</SeitenTitel>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button className="btn-secondary" style={{ padding: "6px 12px" }} disabled={offset === 0} onClick={() => wechsleWoche(offset - 1)}>
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>{WOCHEN_LABEL[offset]}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {new Date(plan.wocheStart).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – {new Date(plan.wocheEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          </div>
        </div>
        <button className="btn-secondary" style={{ padding: "6px 12px" }} disabled={offset === 2} onClick={() => wechsleWoche(offset + 1)}>
          ›
        </button>
      </div>

      {istEltern && ausgewogenheit?.hinweis && (
        <div className="card" style={{ background: "var(--info-soft)", fontSize: 13 }}>
          ⚖️ {ausgewogenheit.hinweis}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.tage.map((t) => (
          <div key={t.tag} className="card" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: t.vergangen ? 0.6 : 1 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {new Date(t.tag).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
              {t.vergangen && " · ✓ erledigt"}
            </div>
            {istEltern ? (
              <>
                <select
                  value={t.eintrag?.rezeptId ?? ""}
                  disabled={!!t.eintrag?.gelockt}
                  onChange={(e) => (e.target.value ? tagAendern(t, e.target.value) : tagEntfernen(t))}
                >
                  <option value="">– kein Gericht –</option>
                  {vorschlaege.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {istLangeNichtGekocht(r.zuletztGeplant) ? " · schon länger nicht mehr" : ""}
                    </option>
                  ))}
                  {t.eintrag && !vorschlaege.some((r) => r.id === t.eintrag!.rezeptId) && (
                    <option value={t.eintrag.rezeptId}>{t.eintrag.rezeptName}</option>
                  )}
                </select>
                {t.eintrag?.gelockt && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    🔒 Erst entsperren, um das Gericht zu ändern.
                  </p>
                )}
              </>
            ) : (
              <div>{t.eintrag?.rezeptName ?? "– kein Gericht –"}</div>
            )}
            {istEltern && t.eintrag && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <button className="btn-secondary" style={{ fontSize: "var(--font-xs)" }} onClick={() => klickSchloss(t)}>
                  {t.eintrag.gelockt ? "🔓 Entsperren" : "🔒 Sperren"}
                </button>
                {t.eintrag.gelockt && <span className="pill pill-neutral">Gesperrt</span>}
                {!t.eintrag.gelockt && (
                  <button className="btn-secondary" style={{ fontSize: "var(--font-xs)" }} onClick={() => zutatenHinzufuegen(t.eintrag!.id)} disabled={pending}>
                    🛒 Zutaten zur Einkaufsliste hinzufügen
                  </button>
                )}
              </div>
            )}

            {istEltern && t.eintrag && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                {(() => {
                  const aktiveIds = t.eintrag!.esserIds.length === 0 ? familie.map((f) => f.id) : t.eintrag!.esserIds;
                  const esserSumme = familie.filter((f) => aktiveIds.includes(f.id)).reduce((s, f) => s + f.portionsGewicht, 0);
                  const gesamtPortionen = esserSumme + t.eintrag!.extraPortionen;
                  const portionenBasis = rezepteAlle.find((r) => r.id === t.eintrag!.rezeptId)?.portionenBasis ?? 6;
                  const diffProzent = Math.round((t.eintrag!.esserFaktor - 1) * 100);
                  const mengenHinweis =
                    Math.abs(diffProzent) < 3
                      ? "passt genau zur Rezeptmenge"
                      : diffProzent > 0
                      ? `+${diffProzent}% mehr Zutaten als im Rezept`
                      : `${diffProzent}% weniger Zutaten als im Rezept`;
                  return (
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginBottom: 4 }}>
                      👪 Wer isst mit? ({gesamtPortionen.toFixed(1)} von {portionenBasis} Portionen · {mengenHinweis})
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {familie.map((f) => {
                    const aktiv = t.eintrag!.esserIds.length === 0 || t.eintrag!.esserIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        className="btn-secondary"
                        disabled={t.eintrag!.gelockt}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "var(--font-xs)",
                          padding: "4px 10px",
                          background: aktiv ? f.farbe : undefined,
                          color: aktiv ? "#fff" : undefined,
                          borderColor: aktiv ? f.farbe : undefined,
                        }}
                        onClick={() => {
                          const aktuelle = t.eintrag!.esserIds.length === 0 ? familie.map((x) => x.id) : t.eintrag!.esserIds;
                          const neu = aktuelle.includes(f.id) ? aktuelle.filter((id) => id !== f.id) : [...aktuelle, f.id];
                          startTransition(() => setEsser(t.eintrag!.id, neu).then(() => ladeWoche(offset)));
                        }}
                      >
                        {!aktiv && <PersonChip name={f.name} farbe={f.farbe} size={16} />}
                        {f.name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>+ Gäste-Portionen (z. B. Besuch):</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    disabled={t.eintrag.gelockt}
                    style={{ width: 70 }}
                    value={extraEntwuerfe[t.eintrag.id] ?? (t.eintrag.extraPortionen || "")}
                    onChange={(e) => setExtraEntwuerfe((prev) => ({ ...prev, [t.eintrag!.id]: e.target.value }))}
                    onBlur={(e) => {
                      const wert = parseFloat(e.target.value) || 0;
                      startTransition(() => setExtraPortionen(t.eintrag!.id, wert).then(() => ladeWoche(offset)));
                    }}
                  />
                </div>
              </div>
            )}

          </div>
        ))}
      </div>

      {istEltern && plan.tage.some((t) => t.eintrag && !t.eintrag.gelockt) && (
        <button className="btn-secondary" disabled={pending} onClick={zutatenDerWocheHinzufuegen}>
          Ganze Woche: Zutaten zur Einkaufsliste hinzufügen
        </button>
      )}

      {sperrDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <strong>Tag entsperren</strong>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Für dieses Gericht wurden schon Zutaten auf die Einkaufsliste übernommen. Die folgenden Artikel werden entfernt
              (bzw. um ihren Anteil verringert) — antippen, um einen Artikel stattdessen zu behalten.
            </p>
            {sperrDialog.herkuenfte.map((h) => {
              const behalten = sperrEntscheidungen[h.artikelId] === "behalten";
              return (
                <button
                  key={h.artikelId}
                  type="button"
                  onClick={() =>
                    setSperrEntscheidungen((prev) => ({ ...prev, [h.artikelId]: behalten ? "entfernen" : "behalten" }))
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "inherit",
                  }}
                >
                  <span style={{ fontSize: 14, textDecoration: behalten ? "none" : "line-through", color: behalten ? undefined : "var(--text-muted)" }}>
                    {h.menge ? `${h.menge} ` : ""}
                    {h.artikelName}
                  </span>
                  <span style={{ fontSize: 16 }}>{behalten ? "✅" : "❌"}</span>
                </button>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const entscheidungen = Object.entries(sperrEntscheidungen).map(([artikelId, aktion]) => ({ artikelId, aktion }));
                    await entsperren(sperrDialog.eintragId, entscheidungen);
                    setSperrDialog(null);
                    await ladeWoche(offset);
                  })
                }
              >
                Speichern
              </button>
              <button className="btn-secondary" onClick={() => setSperrDialog(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {istEltern && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>
            Rezepte für diese Woche ausblenden ({ausgeblendete.length} ausgeblendet)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Ausgeblendete Gerichte tauchen diese Woche nicht in den Vorschlägen auf, ab der nächsten Woche wieder.
            </p>
            {rezepteAlle.map((r) => {
              const istAusgeblendet = ausgeblendete.some((a) => a.rezeptId === r.id);
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: istAusgeblendet ? "var(--text-muted)" : undefined }}>{r.name}</span>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                    onClick={() =>
                      startTransition(async () => {
                        if (istAusgeblendet) await zeigeRezeptWiederAn(r.id, plan.wocheStart);
                        else await blendeRezeptAus(r.id, plan.wocheStart);
                        await ladeWoche(offset);
                      })
                    }
                  >
                    {istAusgeblendet ? "Wieder anzeigen" : "Ausblenden"}
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <details>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Alle Rezepte ({rezepteAlle.length})</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {rezepteAlle.map((r) => (
            <details key={r.id} className="card">
              <summary style={{ cursor: "pointer" }}>{r.name}</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bearbeiteRezeptId === r.id ? (
                  <>
                    <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                      Zutaten (eine Zeile je Zutat, z. B. "200 g Mehl")
                      <textarea
                        rows={Math.max(4, r.zutaten.split("\n").length)}
                        value={rezeptZutatenEntwurf}
                        onChange={(e) => {
                          setRezeptZutatenEntwurf(e.target.value);
                          setZeigeZutatenWarnungEdit(false);
                        }}
                        style={{ fontFamily: "inherit" }}
                      />
                    </label>
                    {/* Fix-Batch 71 (Florians Wunsch): jede Zutatenzeile braucht eine Menge
                        (außer "Prise") — sonst kann die Einkaufslisten-Zusammenführung später
                        nicht sauber rechnen. Egal woher die Zeilen kommen (hier: manuell
                        editiert, oder per Umschreiben/Verdichten vorbefüllt). */}
                    {zeigeZutatenWarnungEdit && rezeptZutatenEntwurfPruefung.some((z) => !z.vollstaendig) && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
                        ⚠️ Bitte bei diesen Zutaten eine Menge angeben (außer bei „Prise"):{" "}
                        <strong>
                          {rezeptZutatenEntwurfPruefung
                            .filter((z) => !z.vollstaendig)
                            .map((z) => z.zeile)
                            .join(" · ")}
                        </strong>
                      </p>
                    )}
                    <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                      Zubereitung
                      <textarea rows={5} value={rezeptZubereitungEntwurf} onChange={(e) => setRezeptZubereitungEntwurf(e.target.value)} />
                    </label>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: "4px 10px", alignSelf: "flex-start" }}
                      disabled={verdichtenLaeuft || !rezeptZubereitungEntwurf.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          setVerdichtenLaeuft(true);
                          try {
                            const ergebnis = await verdichteZubereitungVorschau(rezeptZubereitungEntwurf);
                            if (!ergebnis.ok) {
                              alert(ergebnis.fehler);
                              return;
                            }
                            setRezeptZubereitungEntwurf(ergebnis.zubereitung);
                          } finally {
                            setVerdichtenLaeuft(false);
                          }
                        })
                      }
                    >
                      {verdichtenLaeuft ? "Wird verdichtet …" : "🪄 Anleitung kürzer fassen"}
                    </button>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => {
                          if (rezeptZutatenEntwurfPruefung.some((z) => !z.vollstaendig)) {
                            setZeigeZutatenWarnungEdit(true);
                            return;
                          }
                          startTransition(async () => {
                            await updateRezept(r.id, { zutaten: rezeptZutatenEntwurf, zubereitung: rezeptZubereitungEntwurf || undefined });
                            setBearbeiteRezeptId(null);
                          });
                        }}
                      >
                        Speichern
                      </button>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setBearbeiteRezeptId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong style={{ fontSize: 13 }}>Zutaten</strong>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, margin: "4px 0" }}>{r.zutaten}</pre>
                    </div>
                    {r.zubereitung && (
                      <div>
                        <strong style={{ fontSize: 13 }}>Zubereitung</strong>
                        <p style={{ fontSize: 14, margin: "4px 0", whiteSpace: "pre-wrap" }}>{r.zubereitung}</p>
                      </div>
                    )}
                    {istEltern && (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, alignSelf: "flex-start" }}
                        onClick={() => {
                          setBearbeiteRezeptId(r.id);
                          setRezeptZutatenEntwurf(r.zutaten);
                          setRezeptZubereitungEntwurf(r.zubereitung ?? "");
                        }}
                      >
                        ✎ Zutaten/Zubereitung bearbeiten
                      </button>
                    )}
                  </>
                )}
                {istEltern && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)" }}>Rezept ist geschrieben für</span>
                    <input
                      type="number"
                      min={1}
                      value={portionenEntwuerfe[r.id] ?? String(r.portionenBasis)}
                      onChange={(e) => setPortionenEntwuerfe((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      style={{ width: 60 }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>Portion(en)</span>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: "3px 8px" }}
                      onClick={() => {
                        const wert = parseInt(portionenEntwuerfe[r.id] ?? String(r.portionenBasis), 10);
                        if (!wert || wert < 1) return;
                        startTransition(async () => {
                          await updateRezeptPortionenBasis(r.id, wert);
                          setPortionenEntwuerfe((prev) => {
                            const rest = { ...prev };
                            delete rest[r.id];
                            return rest;
                          });
                        });
                      }}
                    >
                      Speichern
                    </button>
                  </div>
                )}
                {istEltern && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    {umschreibeRezeptId !== r.id ? (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          setUmschreibeRezeptId(r.id);
                          setUmschreibeAnweisung("");
                          setUmschreibeVorschau(null);
                        }}
                      >
                        🔄 Rezept umschreiben lassen (z. B. „vegetarisch")
                      </button>
                    ) : !umschreibeVorschau ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          placeholder='Anweisung, z. B. "vegetarisch machen" oder "ohne Nüsse"'
                          value={umschreibeAnweisung}
                          onChange={(e) => setUmschreibeAnweisung(e.target.value)}
                          style={{ fontSize: 13 }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            disabled={umschreibenLaeuft || !umschreibeAnweisung.trim()}
                            onClick={() =>
                              startTransition(async () => {
                                setUmschreibenLaeuft(true);
                                try {
                                  const ergebnis = await schreibeRezeptUmVorschau(r.id, umschreibeAnweisung);
                                  if (!ergebnis.ok) {
                                    alert(ergebnis.fehler);
                                    return;
                                  }
                                  setUmschreibeVorschau(ergebnis.rezept);
                                } finally {
                                  setUmschreibenLaeuft(false);
                                }
                              })
                            }
                          >
                            {umschreibenLaeuft ? "Wird umgeschrieben …" : "Umschreiben"}
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setUmschreibeRezeptId(null)}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface-alt)", borderRadius: "var(--radius)", padding: 10 }}>
                        <strong style={{ fontSize: 13 }}>Vorschlag: {umschreibeVorschau.name}</strong>
                        <div>
                          <strong style={{ fontSize: 12 }}>Zutaten</strong>
                          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: "4px 0" }}>{umschreibeVorschau.zutaten}</pre>
                        </div>
                        {umschreibeVorschau.zubereitung && (
                          <div>
                            <strong style={{ fontSize: 12 }}>Zubereitung</strong>
                            <p style={{ fontSize: 13, margin: "4px 0", whiteSpace: "pre-wrap" }}>{umschreibeVorschau.zubereitung}</p>
                          </div>
                        )}
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Bitte prüfen und bei Bedarf korrigieren, bevor du speicherst.</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            onClick={() =>
                              startTransition(async () => {
                                await addRezept(
                                  umschreibeVorschau.name,
                                  umschreibeVorschau.zutaten,
                                  umschreibeVorschau.zubereitung || undefined,
                                  umschreibeVorschau.portionen || r.portionenBasis
                                );
                                setUmschreibeRezeptId(null);
                                setUmschreibeVorschau(null);
                              })
                            }
                          >
                            Als neues Rezept speichern
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            onClick={() =>
                              startTransition(async () => {
                                await updateRezept(r.id, {
                                  name: umschreibeVorschau.name,
                                  zutaten: umschreibeVorschau.zutaten,
                                  zubereitung: umschreibeVorschau.zubereitung || undefined,
                                });
                                setUmschreibeRezeptId(null);
                                setUmschreibeVorschau(null);
                              })
                            }
                          >
                            Dieses Rezept überschreiben
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setUmschreibeRezeptId(null)}>
                            Verwerfen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {istEltern && (
                  <button
                    className="btn-icon btn-icon-danger"
                    title="Rezept löschen"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => {
                      if (!confirm(`Rezept „${r.name}" wirklich löschen?`)) return;
                      startTransition(async () => {
                        try {
                          await deleteRezept(r.id);
                        } catch (e: any) {
                          alert(e.message);
                        }
                      });
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            </details>
          ))}
        </div>
      </details>

      {istEltern && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>➕ Neues Rezept hinzufügen (Elternbereich)</summary>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <Spracheingabe
              disabled={erkennungLaeuft}
              onErgebnis={(text) =>
                startTransition(async () => {
                  setErkennungLaeuft(true);
                  try {
                    const ergebnis = await erkenneRezeptAusText(text);
                    if (!ergebnis.ok) {
                      alert(ergebnis.fehler);
                      return;
                    }
                    setNeuName(ergebnis.rezept.name);
                    setNeuZutaten(ergebnis.rezept.zutaten);
                    setNeuZubereitung(ergebnis.rezept.zubereitung);
                    if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                  } finally {
                    setErkennungLaeuft(false);
                  }
                })
              }
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Rezept aus Foto erkennen (Kochbuch, Zeitschrift oder handschriftlich)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  📷 Foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={erkennungLaeuft}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setErkennungLaeuft(true);
                      try {
                        const base64 = await rezeptfotoAufBase64(file);
                        const ergebnis = await erkenneRezeptAusFoto(base64);
                        if (!ergebnis.ok) {
                          alert(ergebnis.fehler);
                          return;
                        }
                        setNeuName(ergebnis.rezept.name);
                        setNeuZutaten(ergebnis.rezept.zutaten);
                        setNeuZubereitung(ergebnis.rezept.zubereitung);
                        if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                      } catch (err: any) {
                        alert(err.message ?? "Foto konnte nicht erkannt werden.");
                      } finally {
                        setErkennungLaeuft(false);
                      }
                    }}
                  />
                </label>
                <label className="btn-secondary" style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  📁 Aus Galerie
                  <input
                    type="file"
                    accept="image/*"
                    disabled={erkennungLaeuft}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setErkennungLaeuft(true);
                      try {
                        const base64 = await rezeptfotoAufBase64(file);
                        const ergebnis = await erkenneRezeptAusFoto(base64);
                        if (!ergebnis.ok) {
                          alert(ergebnis.fehler);
                          return;
                        }
                        setNeuName(ergebnis.rezept.name);
                        setNeuZutaten(ergebnis.rezept.zutaten);
                        setNeuZubereitung(ergebnis.rezept.zubereitung);
                        if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                      } catch (err: any) {
                        alert(err.message ?? "Foto konnte nicht erkannt werden.");
                      } finally {
                        setErkennungLaeuft(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            {erkennungLaeuft && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Foto wird erkannt …</p>}
            <button
              className="btn-secondary"
              style={{ fontSize: 13, alignSelf: "flex-start" }}
              disabled={saisonLaeuft}
              onClick={() =>
                startTransition(async () => {
                  setSaisonLaeuft(true);
                  try {
                    const ergebnis = await schlageSaisonaleIdeeVor();
                    if (!ergebnis.ok) {
                      alert(ergebnis.fehler);
                      return;
                    }
                    setNeuName(ergebnis.rezept.name);
                    setNeuZutaten(ergebnis.rezept.zutaten);
                    setNeuZubereitung(ergebnis.rezept.zubereitung);
                    if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                  } finally {
                    setSaisonLaeuft(false);
                  }
                })
              }
            >
              {saisonLaeuft ? "Idee wird gesucht …" : "🍂 Saisonale Idee vorschlagen"}
            </button>

            {/* Fix-Batch 73/74 (Florians Wunsch, Kosten-Rückfrage): Rezept-Finder per freier
                Beschreibung (Typ, z.B. "Suppe", oder was gerade zuhause ist). Standard ist
                die günstige KI-Variante (nur normale Token-Kosten); die Websuche-Variante
                (echtes, geprüft gut bewertetes Rezept, aber zusätzliche Kosten pro Suche) steht
                als klar gekennzeichnete Zusatz-Option daneben. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                🍳 Rezept vorschlagen lassen — Art des Gerichts oder was gerade da ist beschreiben:
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Suppe", "Mit Fleisch", "Vegetarisch", "Nudeln", "Auflauf"].map((vorschlag) => (
                  <button
                    key={vorschlag}
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => setRezeptFinderText((prev) => (prev ? `${prev}, ${vorschlag}` : vorschlag))}
                  >
                    {vorschlag}
                  </button>
                ))}
              </div>
              <Spracheingabe disabled={rezeptFinderLaeuft} onErgebnis={setRezeptFinderText} />
              <textarea
                placeholder='z. B. "eine Suppe", "was mit Hähnchen" oder "ich hab Zucchini und Reis da"'
                rows={2}
                value={rezeptFinderText}
                onChange={(e) => setRezeptFinderText(e.target.value)}
              />
              <button
                className="btn-secondary"
                style={{ fontSize: 13, alignSelf: "flex-start" }}
                disabled={rezeptFinderLaeuft || !rezeptFinderText.trim()}
                onClick={() =>
                  startTransition(async () => {
                    setRezeptFinderLaeuft(true);
                    setRezeptFinderQuelle(null);
                    try {
                      const ergebnis = await schlageRezeptZuBeschreibungVorschau(rezeptFinderText);
                      if (!ergebnis.ok) {
                        alert(ergebnis.fehler);
                        return;
                      }
                      setNeuName(ergebnis.rezept.name);
                      setNeuZutaten(ergebnis.rezept.zutaten);
                      setNeuZubereitung(ergebnis.rezept.zubereitung);
                      if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                    } finally {
                      setRezeptFinderLaeuft(false);
                    }
                  })
                }
              >
                {rezeptFinderLaeuft ? "Wird vorgeschlagen …" : "Rezept vorschlagen"}
              </button>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, alignSelf: "flex-start", color: "var(--text-muted)" }}
                disabled={rezeptFinderLaeuft || !rezeptFinderText.trim()}
                onClick={() =>
                  startTransition(async () => {
                    setRezeptFinderLaeuft(true);
                    setRezeptFinderQuelle(null);
                    try {
                      const ergebnis = await findeRezeptImInternetVorschau(rezeptFinderText);
                      if (!ergebnis.ok) {
                        alert(ergebnis.fehler);
                        return;
                      }
                      setNeuName(ergebnis.rezept.name);
                      setNeuZutaten(ergebnis.rezept.zutaten);
                      setNeuZubereitung(ergebnis.rezept.zubereitung);
                      if (ergebnis.rezept.portionen) setNeuPortionenBasis(String(ergebnis.rezept.portionen));
                      setRezeptFinderQuelle(ergebnis.rezept.quelle ?? null);
                    } finally {
                      setRezeptFinderLaeuft(false);
                    }
                  })
                }
              >
                {rezeptFinderLaeuft ? "Suche läuft …" : "🌐 Stattdessen echtes, gut bewertetes Rezept aus dem Internet suchen (zusätzliche Kosten, ca. 2–5 Cent)"}
              </button>
              {rezeptFinderQuelle && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Gefunden auf: {rezeptFinderQuelle}</p>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Ergebnis bitte immer prüfen und bei Bedarf korrigieren, bevor du speicherst.
            </p>
            <input placeholder="Name" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
            <textarea
              placeholder={"Zutaten, eine pro Zeile, z.B.\n500 g Spaghetti\n2 Zwiebeln"}
              rows={5}
              value={neuZutaten}
              onChange={(e) => {
                setNeuZutaten(e.target.value);
                setZeigeZutatenWarnungNeu(false);
              }}
            />
            {/* Fix-Batch 71 (Florians Wunsch): jede Zutatenzeile braucht eine Menge (außer
                "Prise") — egal ob manuell getippt, per Sprache/Foto erkannt oder von der
                saisonalen KI-Idee vorbefüllt. */}
            {zeigeZutatenWarnungNeu && neuZutatenPruefung.some((z) => !z.vollstaendig) && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
                ⚠️ Bitte bei diesen Zutaten eine Menge angeben (außer bei „Prise"):{" "}
                <strong>{neuZutatenPruefung.filter((z) => !z.vollstaendig).map((z) => z.zeile).join(" · ")}</strong>
              </p>
            )}
            <textarea placeholder="Zubereitung (optional)" rows={4} value={neuZubereitung} onChange={(e) => setNeuZubereitung(e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              Rezept ist geschrieben für
              <input
                type="number"
                min={1}
                value={neuPortionenBasis}
                onChange={(e) => setNeuPortionenBasis(e.target.value)}
                style={{ width: 60 }}
              />
              Portion(en)
            </label>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Steht z. B. im Rezept als „Für 1 Portion" oder „für 4 Personen" — Grundlage für die
              automatische Mengen-Anpassung, wenn ihr als Familie alle 6 esst.
            </p>
            <button
              className="btn"
              disabled={pending || erkennungLaeuft}
              onClick={() => {
                if (!neuName) return;
                if (neuZutatenPruefung.some((z) => !z.vollstaendig)) {
                  setZeigeZutatenWarnungNeu(true);
                  return;
                }
                startTransition(async () => {
                  const portionenBasis = parseInt(neuPortionenBasis, 10) || 6;
                  await addRezept(neuName, neuZutaten, neuZubereitung || undefined, portionenBasis);
                  setNeuName("");
                  setNeuZutaten("");
                  setNeuZubereitung("");
                  setNeuPortionenBasis("6");
                  setZeigeZutatenWarnungNeu(false);
                });
              }}
            >
              Rezept speichern
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
