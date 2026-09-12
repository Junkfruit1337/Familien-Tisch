"use client";

import { useMemo, useState } from "react";

// Fix-Batch 82 (Florians Wunsch): für Extra-/Zusatzgerichte (Essensplan-Tag, Einkaufsliste)
// soll das Rezept genauso wie beim Tagesgericht per Suche gefunden werden — hier aber bewusst
// OHNE Standard-Liste beim Öffnen (anders als bei RezeptTagAuswahl in EssensplanClient, die
// standardmäßig Hauptgänge zeigt): Extra-Gerichte sind nicht auf eine Kategorie festgelegt,
// daher wird schlicht nichts angezeigt, bis man etwas eintippt.
export type RezeptSuchOption = { id: string; name: string; zutaten: string };

export default function RezeptSucheFeld({
  alle,
  platzhalter,
  onWaehlen,
}: {
  alle: RezeptSuchOption[];
  platzhalter?: string;
  onWaehlen: (rezept: RezeptSuchOption) => void;
}) {
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState(false);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return alle.filter((r) => r.name.toLowerCase().includes(q) || r.zutaten.toLowerCase().includes(q)).slice(0, 30);
  }, [suche, alle]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={suche}
        placeholder={platzhalter ?? "Rezeptname oder Zutat eingeben …"}
        onFocus={() => setOffen(true)}
        onBlur={() => setTimeout(() => setOffen(false), 150)}
        onChange={(e) => {
          setSuche(e.target.value);
          setOffen(true);
        }}
      />
      {offen && suche.trim() && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {treffer.map((r) => (
            <div
              key={r.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onWaehlen(r);
                setSuche("");
                setOffen(false);
              }}
              style={{ padding: "8px 10px", cursor: "pointer", fontSize: 14, borderTop: "1px solid var(--border)" }}
            >
              {r.name}
            </div>
          ))}
          {treffer.length === 0 && <div style={{ padding: "8px 10px", fontSize: 13, color: "var(--text-muted)" }}>Keine Treffer.</div>}
        </div>
      )}
    </div>
  );
}
