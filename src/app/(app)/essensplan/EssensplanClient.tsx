"use client";

import { useState, useTransition } from "react";
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
  erkenneRezeptAusFoto,
  updateRezeptPortionenBasis,
} from "./actions";
import SeitenTitel from "@/components/SeitenTitel";
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
type RezeptKurz = { id: string; name: string };
type Familienmitglied = { id: string; name: string; farbe: string; portionsGewicht: number };
type Herkunft = { artikelId: string; artikelName: string; menge: string | null };

const WOCHEN_LABEL = ["Diese Woche", "Nächste Woche", "Übernächste Woche"];

export default function EssensplanClient({
  istEltern,
  plan: initialPlan,
  rezepteAlle,
  rezepteVorschlaege: initialVorschlaege,
  ausgeblendete: initialAusgeblendete,
  familie,
}: {
  istEltern: boolean;
  plan: Plan;
  rezepteAlle: RezeptDetail[];
  rezepteVorschlaege: RezeptKurz[];
  ausgeblendete: { rezeptId: string; name: string }[];
  familie: Familienmitglied[];
}) {
  const [pending, startTransition] = useTransition();
  const [offset, setOffset] = useState(0);
  const [plan, setPlan] = useState(initialPlan);
  const [vorschlaege, setVorschlaege] = useState(initialVorschlaege);
  const [ausgeblendete, setAusgeblendete] = useState(initialAusgeblendete);

  const [portionenEntwuerfe, setPortionenEntwuerfe] = useState<Record<string, string>>({});
  const [extraEntwuerfe, setExtraEntwuerfe] = useState<Record<string, string>>({});

  const [sperrDialog, setSperrDialog] = useState<{ eintragId: string; herkuenfte: Herkunft[] } | null>(null);
  const [sperrEntscheidungen, setSperrEntscheidungen] = useState<Record<string, "entfernen" | "behalten">>({});

  const [neuName, setNeuName] = useState("");
  const [neuZutaten, setNeuZutaten] = useState("");
  const [neuZubereitung, setNeuZubereitung] = useState("");
  const [neuPortionenBasis, setNeuPortionenBasis] = useState("6");
  const [erkennungLaeuft, setErkennungLaeuft] = useState(false);

  async function ladeWoche(neuerOffset: number) {
    const neuerPlan = await getWochenplan(neuerOffset);
    const [neueVorschlaege, neueAusgeblendete] = await Promise.all([
      listRezepteFuerWoche(neuerPlan.wocheStart),
      istEltern ? listAusgeblendeteFuerWoche(neuerPlan.wocheStart) : Promise.resolve([]),
    ]);
    setPlan(neuerPlan);
    setVorschlaege(neueVorschlaege);
    setAusgeblendete(neueAusgeblendete);
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
                  onChange={(e) => e.target.value && tagAendern(t, e.target.value)}
                >
                  <option value="">– kein Gericht –</option>
                  {vorschlaege.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => klickSchloss(t)}>
                  {t.eintrag.gelockt ? "🔒 Gesperrt" : "🔓 Entsperrt"}
                </button>
                {!t.eintrag.gelockt && (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => zutatenHinzufuegen(t.eintrag!.id)} disabled={pending}>
                    Zutaten zur Einkaufsliste hinzufügen
                  </button>
                )}
              </div>
            )}

            {istEltern && t.eintrag && (
              <div>
                {(() => {
                  const aktiveIds = t.eintrag!.esserIds.length === 0 ? familie.map((f) => f.id) : t.eintrag!.esserIds;
                  const esserSumme = familie.filter((f) => aktiveIds.includes(f.id)).reduce((s, f) => s + f.portionsGewicht, 0);
                  const gesamtPortionen = esserSumme + t.eintrag!.extraPortionen;
                  const portionenBasis = rezepteAlle.find((r) => r.id === t.eintrag!.rezeptId)?.portionenBasis ?? 6;
                  return (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      Wer isst mit? ({gesamtPortionen.toFixed(1)} von {portionenBasis} Portionen · Faktor {t.eintrag!.esserFaktor.toFixed(2)})
                      {t.eintrag!.gelockt && " · 🔒 gesperrt"}
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
                        style={{ fontSize: 12, padding: "4px 10px", background: aktiv ? f.farbe : undefined, color: aktiv ? "#fff" : undefined }}
                        onClick={() => {
                          const aktuelle = t.eintrag!.esserIds.length === 0 ? familie.map((x) => x.id) : t.eintrag!.esserIds;
                          const neu = aktuelle.includes(f.id) ? aktuelle.filter((id) => id !== f.id) : [...aktuelle, f.id];
                          startTransition(() => setEsser(t.eintrag!.id, neu).then(() => ladeWoche(offset)));
                        }}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>+ Gäste-Portionen (z. B. Besuch):</span>
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
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, alignSelf: "flex-start" }}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deleteRezept(r.id);
                        } catch (e: any) {
                          alert(e.message);
                        }
                      })
                    }
                  >
                    Löschen
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
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              📷 Rezept aus Foto erkennen (Kochbuch, Zeitschrift oder handschriftlich)
              <input
                type="file"
                accept="image/*"
                disabled={erkennungLaeuft}
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
            {erkennungLaeuft && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Foto wird erkannt …</p>}
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Ergebnis bitte immer prüfen und bei Bedarf korrigieren, bevor du speicherst.
            </p>
            <input placeholder="Name" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
            <textarea
              placeholder={"Zutaten, eine pro Zeile, z.B.\n500 g Spaghetti\n2 Zwiebeln"}
              rows={5}
              value={neuZutaten}
              onChange={(e) => setNeuZutaten(e.target.value)}
            />
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
              onClick={() =>
                startTransition(async () => {
                  if (!neuName) return;
                  const portionenBasis = parseInt(neuPortionenBasis, 10) || 6;
                  await addRezept(neuName, neuZutaten, neuZubereitung || undefined, portionenBasis);
                  setNeuName("");
                  setNeuZutaten("");
                  setNeuZubereitung("");
                  setNeuPortionenBasis("6");
                })
              }
            >
              Rezept speichern
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
