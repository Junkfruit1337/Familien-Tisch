"use client";

// Wiederverwendbarer Mengen-Hebel (Fix-Batch 22) — z. B. "wir brauchen für alle 6 das
// Doppelte" oder eine beliebige eigene Menge. Wird sowohl beim Essensplan-Tag-Zutaten-
// prüfen als auch beim eigenständigen Extra-Rezept-Hinzufügen in der Einkaufsliste genutzt.
export default function FaktorLeiste({ faktor, onChange }: { faktor: number; onChange: (f: number) => void }) {
  const optionen = [1, 1.5, 2, 3];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Menge:</span>
      {optionen.map((f) => (
        <button
          key={f}
          type="button"
          className="btn-secondary"
          style={{
            fontSize: 12,
            padding: "3px 10px",
            background: faktor === f ? "var(--accent)" : undefined,
            color: faktor === f ? "var(--accent-contrast)" : undefined,
          }}
          onClick={() => onChange(f)}
        >
          {`${f}×`.replace(".", ",")}
        </button>
      ))}
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
        eigener Faktor:
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={faktor}
          onChange={(e) => {
            const wert = parseFloat(e.target.value.replace(",", "."));
            if (!Number.isNaN(wert) && wert > 0) onChange(wert);
          }}
          style={{ width: 64, padding: "2px 6px" }}
        />
      </label>
    </div>
  );
}
