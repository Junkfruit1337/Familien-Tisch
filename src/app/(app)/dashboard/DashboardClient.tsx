"use client";

import Link from "next/link";
import { useState } from "react";
import SeitenTitel from "@/components/SeitenTitel";
import { Icon } from "@/lib/uiIcons";
import { BereichIcon } from "@/lib/bereichIcons";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";
import PersonChip from "@/components/PersonChip";

const ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Arbeit",
  HAUSAUFGABEN_KONTROLLE: "HÜ",
  EPOCHALNOTE: "Epo",
};

// Fix-Batch 120 (Florians Wunsch): manche Noten stehen "zwischen" zwei ganzen Noten (z. B.
// mündlich) — Tendenz wird rein informativ als "+"/"−" angehängt, ändert aber nie die Zahl
// selbst (fließt bewusst nicht in Notenschnitt/Taschengeld ein, siehe schule/actions.ts).
function formatNote(note: number, tendenz?: "PLUS" | "MINUS" | null): string {
  return `${note}${tendenz === "PLUS" ? "+" : tendenz === "MINUS" ? "−" : ""}`;
}

const TICKET_STATUS_LABEL: Record<string, string> = {
  EINGEREICHT: "Eingereicht",
  GENEHMIGT: "Genehmigt",
  IN_UMSETZUNG: "Genehmigt und in Umsetzung",
};

type HeutigesGericht = { bezeichnung: string; rezeptName: string; zutaten: string[]; zubereitung: string | null; zutatenUebernommen: boolean };

type Daten = {
  person: { name: string; rolle: string };
  heutigeGerichte: HeutigesGericht[];
  schulEintraege: { id: string; titel: string; fachName: string | null; datum: string; personName: string; personFarbe: string; tageBis: number; lerntipp: string | null }[];
  termineHeute: { id: string; titel: string; start: string; personName: string }[];
  offeneAufgaben: number;
  offeneNoten: { id: string; kindName: string; fachName: string; art: string; note: number; tendenz: "PLUS" | "MINUS" | null; datum: string; notiz: string | null; fotoBase64: string | null }[];
  offeneWuensche: { id: string; kindName: string; artikelName: string; menge: string | null; createdAt: string }[];
  meineOffenenTickets: { id: string; titel: string; status: string }[];
};

export default function DashboardClient({ daten, istEltern }: { daten: Daten; istEltern: boolean }) {
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  // Fix-Batch 84 (Florians Wunsch): Rezept mit den tatsächlich geplanten Mengen direkt aus
  // "Heute" heraus öffnen können, ohne erst in den Essensplan wechseln zu müssen.
  const [offenesGericht, setOffenesGericht] = useState<HeutigesGericht | null>(null);
  const anfragenGesamt = daten.offeneNoten.length + daten.offeneWuensche.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SeitenTitel bereich="dashboard">Hallo, {daten.person.name}!</SeitenTitel>

      {grossesBild && (
        <div
          onClick={() => setGrossesBild(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grossesBild} alt="Notenzettel groß" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}

      {istEltern && anfragenGesamt > 0 && (
        <div className="card card-action">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon id="import" /> Anfragen von den Kindern ({anfragenGesamt})
          </strong>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Antippen führt zum jeweiligen Bereich, wo ihr die Details seht und entscheiden könnt.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {daten.offeneNoten.map((n) => (
              <Link
                key={`note-${n.id}`}
                href={`/schule?highlight=${n.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8, color: "inherit", textDecoration: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {n.fotoBase64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.fotoBase64}
                      alt="Notenzettel"
                      style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                    />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>
                      {n.kindName} — {n.fachName}: Note {formatNote(n.note, n.tendenz)}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {ART_LABEL[n.art] ?? n.art} · {new Date(n.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                    {n.notiz && <span style={{ fontSize: 13 }}>Thema: „{n.notiz}"</span>}
                  </div>
                </div>
                <span style={{ color: "var(--accent)", fontSize: 18, flexShrink: 0 }}>→</span>
              </Link>
            ))}
            {daten.offeneWuensche.map((w) => (
              <Link
                key={`wunsch-${w.id}`}
                href={`/einkaufsliste?highlight=${w.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8, color: "inherit", textDecoration: "none" }}
              >
                <span>
                  {w.kindName} wünscht sich: {w.artikelName}
                  {w.menge ? ` (${w.menge})` : ""}
                </span>
                <span style={{ color: "var(--accent)", fontSize: 18, flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {daten.meineOffenenTickets.length > 0 && (
        <div className="card card-action">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon id="ticket" /> Meine offenen Tickets ({daten.meineOffenenTickets.length})
          </strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {daten.meineOffenenTickets.map((t) => (
              <Link
                key={t.id}
                href={`/einstellungen?highlight=${t.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8, color: "inherit", textDecoration: "none" }}
              >
                <span>{t.titel}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span className={`pill pill-${t.status === "EINGEREICHT" ? "offen" : "genehmigt"}`}>{TICKET_STATUS_LABEL[t.status] ?? t.status}</span>
                  <span style={{ color: "var(--accent)", fontSize: 18 }}>→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BereichIcon bereich="essensplan" size={18} /> Heute gibt's
        </strong>
        {daten.heutigeGerichte.length === 0 && (
          <div className="empty-state" style={{ padding: "var(--space-3) 0 0" }}>
            <span>Noch nicht geplant</span>
          </div>
        )}
        {daten.heutigeGerichte.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {daten.heutigeGerichte.map((g, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOffenesGericht(g)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <span>
                    <strong style={{ fontSize: 13 }}>{g.bezeichnung}:</strong> {g.rezeptName}
                  </span>
                  {!g.zutatenUebernommen && (
                    <span className="pill pill-offen" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon id="warning" size={11} /> Noch nicht eingekauft
                    </span>
                  )}
                </span>
                <span style={{ color: "var(--accent)", fontSize: 16, flexShrink: 0 }}>→</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {offenesGericht && (
        <div
          onClick={() => setOffenesGericht(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{offenesGericht.bezeichnung}</div>
                <strong style={{ fontSize: "var(--font-md)" }}>{offenesGericht.rezeptName}</strong>
              </div>
              <button className="btn-icon" onClick={() => setOffenesGericht(null)} aria-label="Schließen">
                <Icon id="close" />
              </button>
            </div>
            <div>
              <strong style={{ fontSize: 13 }}>Zutaten (wie geplant)</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {offenesGericht.zutaten.map((z, i) => (
                  <li key={i} style={{ fontSize: 14 }}>
                    {z}
                  </li>
                ))}
              </ul>
            </div>
            {offenesGericht.zubereitung && (
              <div>
                <strong style={{ fontSize: 13 }}>Zubereitung</strong>
                <p style={{ margin: "4px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{offenesGericht.zubereitung}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BereichIcon bereich="kalender" size={18} /> Heute
        </strong>
        {daten.termineHeute.length === 0 && (
          <div className="empty-state" style={{ padding: "var(--space-3) 0 0" }}>
            <span>Keine Termine heute.</span>
          </div>
        )}
        {daten.termineHeute.map((t) => (
          <div key={t.id} style={{ marginTop: 6, fontSize: 14 }}>
            {new Date(t.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} — {t.titel} ({t.personName})
          </div>
        ))}
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--text-muted)" }}>{daten.offeneAufgaben} offene Aufgabe(n)</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BereichIcon bereich="schule" size={18} /> Als Nächstes steht an
          </strong>
          <Link href="/schule" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
            Verwalten →
          </Link>
        </div>

        {daten.schulEintraege.length === 0 && (
          <div className="empty-state" style={{ padding: "var(--space-3) 0 0" }}>
            <span>Nichts Anstehendes.</span>
          </div>
        )}
        {/* Fix-Batch 118 (Florians Wunsch: "wie in Schule aufbauen" — Fach ist wichtiger als
            Thema): Fach steht jetzt als Überschrift, Kind-Name prominent mit Farb-Chip;
            Thema (und ggf. Lerntipp) stehen erst nach dem Antippen, für mehr Fokus wie beim
            entsprechenden Bereich auf der Schule-Seite (Fix-Batch 117). */}
        {daten.schulEintraege.map((s) => (
          <details key={s.id} style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <summary style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {istEltern && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PersonChip name={s.personName} farbe={s.personFarbe} size={18} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: s.personFarbe }}>{s.personName}</span>
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: "var(--font-md)" }}>{s.fachName ?? s.titel}</div>
                <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
                  {new Date(s.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })} · noch {s.tageBis} Tag(e)
                </div>
              </div>
            </summary>
            <div style={{ fontSize: "var(--font-sm)" }}>
              {s.fachName ? s.titel : null}
              {s.lerntipp && (
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon id="lightbulb" size={13} /> {s.lerntipp}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

    </div>
  );
}
