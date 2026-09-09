"use client";

import { useState, useTransition } from "react";
import { addRezept, setTag, toggleLock, zutatenUebernehmen } from "./actions";

type Rezept = { id: string; name: string; zutaten: string };
type Tag = { tag: string; eintrag: { id: string; rezeptName: string; rezeptId: string; gelockt: boolean } | null };

export default function EssensplanClient({
  istEltern,
  rezepte,
  plan,
}: {
  istEltern: boolean;
  rezepte: Rezept[];
  plan: { wocheStart: string; tage: Tag[] };
}) {
  const [pending, startTransition] = useTransition();
  const [neuName, setNeuName] = useState("");
  const [neuZutaten, setNeuZutaten] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Essensplan</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        Woche ab {new Date(plan.wocheStart).toLocaleDateString("de-DE")} (Samstag–Samstag)
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.tage.map((t) => (
          <div key={t.tag} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {new Date(t.tag).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
              </div>
              {istEltern ? (
                <select
                  value={t.eintrag?.rezeptId ?? ""}
                  disabled={t.eintrag?.gelockt}
                  onChange={(e) => startTransition(() => setTag(plan.wocheStart, t.tag, e.target.value))}
                >
                  <option value="">– kein Gericht –</option>
                  {rezepte.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div>{t.eintrag?.rezeptName ?? "– kein Gericht –"}</div>
              )}
            </div>
            {istEltern && t.eintrag && (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startTransition(() => toggleLock(t.eintrag!.id))}>
                  {t.eintrag.gelockt ? "🔒" : "🔓"}
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startTransition(() => zutatenUebernehmen(t.eintrag!.id))}>
                  Zutaten → Liste
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {istEltern && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Neues Rezept ({rezepte.length} vorhanden)</summary>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <input placeholder="Name" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
            <textarea
              placeholder={"Zutaten, eine pro Zeile, z.B.\n500 g Spaghetti\n2 Zwiebeln"}
              rows={5}
              value={neuZutaten}
              onChange={(e) => setNeuZutaten(e.target.value)}
            />
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!neuName) return;
                  await addRezept(neuName, neuZutaten);
                  setNeuName("");
                  setNeuZutaten("");
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
