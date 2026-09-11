"use client";

import Link from "next/link";

type Daten = {
  person: { name: string; rolle: string };
  heutigesEssen: string | null;
  schulEintraege: { id: string; titel: string; fachName: string | null; datum: string; personName: string; tageBis: number; lerntipp: string | null }[];
  termineHeute: { id: string; titel: string; start: string; personName: string }[];
  offeneAufgaben: number;
};
type HistorieEintrag = { id: string; zeitpunkt: string; personName: string; typLabel: string; aktion: string; bezug: string | null };

export default function DashboardClient({
  daten,
  istEltern,
  historie,
}: {
  daten: Daten;
  istEltern: boolean;
  historie: HistorieEintrag[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Hallo, {daten.person.name}!</h1>

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

      {istEltern && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>🕘 Änderungshistorie ({historie.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {historie.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)" }}>Noch keine Änderungen erfasst.</p>}
            {historie.map((h) => (
              <div key={h.id} style={{ fontSize: 13, borderBottom: "1px solid rgba(128,128,128,0.15)", paddingBottom: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(h.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                — <strong>{h.personName}</strong>: {h.typLabel} {h.aktion}
                {h.bezug ? ` „${h.bezug}"` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
