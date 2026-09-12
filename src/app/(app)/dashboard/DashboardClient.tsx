"use client";

import Link from "next/link";
import { useState } from "react";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

const ART_LABEL: Record<string, string> = {
  KLASSENARBEIT: "Klassenarbeit",
  HAUSAUFGABEN_KONTROLLE: "Hausaufgaben-Kontrolle",
  EPOCHALNOTE: "Epochalnote",
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  EINGEREICHT: "Eingereicht",
  GENEHMIGT: "Genehmigt",
  IN_UMSETZUNG: "Genehmigt und in Umsetzung",
};

type Daten = {
  person: { name: string; rolle: string };
  heutigesEssen: string | null;
  schulEintraege: { id: string; titel: string; fachName: string | null; datum: string; personName: string; tageBis: number; lerntipp: string | null }[];
  termineHeute: { id: string; titel: string; start: string; personName: string }[];
  offeneAufgaben: number;
  offeneNoten: { id: string; kindName: string; fachName: string; art: string; note: number; datum: string; notiz: string | null; fotoBase64: string | null }[];
  offeneWuensche: { id: string; kindName: string; artikelName: string; menge: string | null; createdAt: string }[];
  meineOffenenTickets: { id: string; titel: string; status: string }[];
};

export default function DashboardClient({ daten, istEltern }: { daten: Daten; istEltern: boolean }) {
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  const anfragenGesamt = daten.offeneNoten.length + daten.offeneWuensche.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SeitenTitel icon="🏠" farbe={BEREICH_FARBEN.dashboard}>Hallo, {daten.person.name}!</SeitenTitel>

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
        <div className="card">
          <strong>📥 Anfragen von den Kindern ({anfragenGesamt})</strong>
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
                      {n.kindName} — {n.fachName}: Note {n.note}
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
        <div className="card">
          <strong>🎫 Meine offenen Tickets ({daten.meineOffenenTickets.length})</strong>
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
        <strong>🍽️ Heute gibt's</strong>
        <p style={{ margin: "4px 0 0" }}>{daten.heutigesEssen ?? "Noch nicht geplant"}</p>
      </div>

      <div className="card">
        <strong>📅 Heute</strong>
        {daten.termineHeute.length === 0 && <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>Keine Termine heute.</p>}
        {daten.termineHeute.map((t) => (
          <div key={t.id} style={{ marginTop: 6, fontSize: 14 }}>
            {new Date(t.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} — {t.titel} ({t.personName})
          </div>
        ))}
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--text-muted)" }}>{daten.offeneAufgaben} offene Aufgabe(n)</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>🎓 Als Nächstes steht an</strong>
          <Link href="/schule" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
            Verwalten →
          </Link>
        </div>

        {daten.schulEintraege.length === 0 && <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>Nichts Anstehendes.</p>}
        {daten.schulEintraege.map((s) => (
          <div key={s.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {new Date(s.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
            </div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>
              {s.titel} {istEltern && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {s.personName}</span>}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>noch {s.tageBis} Tag(e)</div>
            {s.lerntipp && <div style={{ fontSize: 13, marginTop: 4 }}>💡 {s.lerntipp}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
