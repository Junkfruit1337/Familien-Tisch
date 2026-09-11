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
  toggleLock,
  setEsser,
  pruefeZutaten,
  uebernehmeAusgewaehlteZutaten,
  pruefeGelocktenTagWechsel,
  setTagTrotzSperre,
  erkenneRezeptAusFoto,
} from "./actions";

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
};
type Tag = { tag: string; vergangen: boolean; eintrag: TagEintrag | null };
type Plan = { wocheStart: string; wocheEnde: string; tage: Tag[] };
type RezeptDetail = { id: string; name: string; zutaten: string; zubereitung: string | null };
type RezeptKurz = { id: string; name: string };
type Familienmitglied = { id: string; name: string; farbe: string };
type Zutat = { name: string; menge?: string };
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

  const [pruefTagId, setPruefTagId] = useState<string | null>(null);
  const [pruefZeilen, setPruefZeilen] = useState<Zutat[]>([]);
  const [pruefAusgewaehlt, setPruefAusgewaehlt] = useState<boolean[]>([]);

  const [sperrDialog, setSperrDialog] = useState<{ eintragId: string; neuesRezeptId: string; herkuenfte: Herkunft[] } | null>(null);
  const [sperrEntscheidungen, setSperrEntscheidungen] = useState<Record<string, "entfernen" | "behalten">>({});

  const [neuName, setNeuName] = useState("");
  const [neuZutaten, setNeuZutaten] = useState("");
  const [neuZubereitung, setNeuZubereitung] = useState("");
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

  async function starteZutatenPruefung(eintragId: string) {
    const zeilen = await pruefeZutaten(eintragId);
    setPruefTagId(eintragId);
    setPruefZeilen(zeilen);
    setPruefAusgewaehlt(zeilen.map(() => true));
  }

  async function versucheTagAendern(t: Tag, neuesRezeptId: string) {
    if (!t.eintrag) return;
    if (!t.eintrag.gelockt) {
      startTransition(() => setTag(plan.wocheStart, t.tag, neuesRezeptId).then(() => ladeWoche(offset)));
      return;
    }
    const herkuenfte = await pruefeGelocktenTagWechsel(t.eintrag.id);
    if (herkuenfte.length === 0) {
      startTransition(() => setTagTrotzSperre(t.eintrag!.id, neuesRezeptId, []).then(() => ladeWoche(offset)));
      return;
    }
    setSperrDialog({ eintragId: t.eintrag.id, neuesRezeptId, herkuenfte });
    setSperrEntscheidungen(Object.fromEntries(herkuenfte.map((h) => [h.artikelId, "behalten" as const])));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Essensplan</h1>

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {new Date(t.tag).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  {t.vergangen && " · ✓ erledigt"}
                </div>
                {istEltern ? (
                  <select value={t.eintrag?.rezeptId ?? ""} onChange={(e) => e.target.value && versucheTagAendern(t, e.target.value)}>
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
                ) : (
                  <div>{t.eintrag?.rezeptName ?? "– kein Gericht –"}</div>
                )}
              </div>
              {istEltern && t.eintrag && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startTransition(() => toggleLock(t.eintrag!.id).then(() => ladeWoche(offset)))}>
                    {t.eintrag.gelockt ? "🔒" : "🔓"}
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => starteZutatenPruefung(t.eintrag!.id)}>
                    Zutaten prüfen
                  </button>
                </div>
              )}
            </div>

            {istEltern && t.eintrag && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                  Wer isst mit? (Faktor {t.eintrag.esserFaktor.toFixed(2)})
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {familie.map((f) => {
                    const aktiv = t.eintrag!.esserIds.length === 0 || t.eintrag!.esserIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        className="btn-secondary"
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
              </div>
            )}

            {pruefTagId === t.eintrag?.id && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ fontSize: 13 }}>Zutaten prüfen — schon zu Hause?</strong>
                {pruefZeilen.map((z, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={pruefAusgewaehlt[i]}
                      onChange={() => setPruefAusgewaehlt((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                    />
                    <span style={{ textDecoration: pruefAusgewaehlt[i] ? "none" : "line-through", color: pruefAusgewaehlt[i] ? undefined : "var(--text-muted)" }}>
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
                        const ausgewaehlt = pruefZeilen.filter((_, i) => pruefAusgewaehlt[i]);
                        await uebernehmeAusgewaehlteZutaten(pruefTagId!, ausgewaehlt);
                        setPruefTagId(null);
                      })
                    }
                  >
                    Übernehmen ({pruefAusgewaehlt.filter(Boolean).length})
                  </button>
                  <button className="btn-secondary" onClick={() => setPruefTagId(null)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sperrDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <strong>Gericht ändern trotz Sperre</strong>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Für das bisherige Gericht wurden schon Zutaten auf die Einkaufsliste übernommen. Was soll mit den einzelnen Mengen-Anteilen passieren?
            </p>
            {sperrDialog.herkuenfte.map((h) => (
              <div key={h.artikelId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>
                  {h.menge ? `${h.menge} ` : ""}
                  {h.artikelName}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "4px 8px", background: sperrEntscheidungen[h.artikelId] === "behalten" ? "var(--accent)" : undefined, color: sperrEntscheidungen[h.artikelId] === "behalten" ? "var(--accent-contrast)" : undefined }}
                    onClick={() => setSperrEntscheidungen((prev) => ({ ...prev, [h.artikelId]: "behalten" }))}
                  >
                    Behalten
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "4px 8px", background: sperrEntscheidungen[h.artikelId] === "entfernen" ? "var(--danger)" : undefined, color: sperrEntscheidungen[h.artikelId] === "entfernen" ? "#fff" : undefined }}
                    onClick={() => setSperrEntscheidungen((prev) => ({ ...prev, [h.artikelId]: "entfernen" }))}
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const entscheidungen = Object.entries(sperrEntscheidungen).map(([artikelId, aktion]) => ({ artikelId, aktion }));
                    await setTagTrotzSperre(sperrDialog.eintragId, sperrDialog.neuesRezeptId, entscheidungen);
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
                capture="environment"
                disabled={erkennungLaeuft}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setErkennungLaeuft(true);
                  try {
                    const base64 = await rezeptfotoAufBase64(file);
                    const erkannt = await erkenneRezeptAusFoto(base64);
                    setNeuName(erkannt.name);
                    setNeuZutaten(erkannt.zutaten);
                    setNeuZubereitung(erkannt.zubereitung);
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
            <button
              className="btn"
              disabled={pending || erkennungLaeuft}
              onClick={() =>
                startTransition(async () => {
                  if (!neuName) return;
                  await addRezept(neuName, neuZutaten, neuZubereitung || undefined);
                  setNeuName("");
                  setNeuZutaten("");
                  setNeuZubereitung("");
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
