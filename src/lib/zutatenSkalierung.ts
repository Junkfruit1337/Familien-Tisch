// Geteilte Zutaten-Zeilen-Logik (ursprünglich nur in essensplan/actions.ts) — Fix-Batch 84
// (Florians Wunsch, Rezept mit geplanter Menge auch im Dashboard "Heute" anzeigen können):
// ausgelagert, damit dashboard/actions.ts dieselbe Skalierung nutzen kann, ohne sie zu
// duplizieren. Bewusst KEINE "use server"-Datei (nur reine Hilfsfunktionen, keine
// Server-Action) — sonst müssten die Exporte async sein, was hier nur unnötig verkomplizieren
// würde, da sie überall synchron in .map()-Aufrufen verwendet werden.

// Fix-Batch 28: erkennt jetzt auch Zeilen ohne eigenes Einheiten-Wort (z.B. "1 Knoblauchzehe(n)"
// statt "500 g Spaghetti") — vorher fiel so eine Zeile komplett durch die erste Regel (die
// verlangt Menge UND Einheit UND Name als drei Teile) und landete unsplittet als kompletter
// Name ohne separate Menge auf der Einkaufsliste.
export function parseZutatZeile(zeile: string): { name: string; menge?: string } {
  const mitEinheit = zeile.match(/^([\d.,]+\s*\S+)\s+(.+)$/);
  if (mitEinheit) return { menge: mitEinheit[1], name: mitEinheit[2] };
  const nurZahl = zeile.match(/^([\d.,]+)\s+(.+)$/);
  if (nurZahl) return { menge: nurZahl[1], name: nurZahl[2] };
  return { name: zeile };
}

// Skaliert eine Zutatenzeile mit dem Esser-/Mengen-Faktor (z. B. 3 von 6 Essern → Faktor 0,5).
export function skaliereZeile(zeile: { name: string; menge?: string }, faktor: number): { name: string; menge?: string } {
  if (!zeile.menge || faktor === 1) return zeile;
  const m = zeile.menge.match(/^([\d]+(?:[.,]\d+)?)(.*)$/);
  if (!m) return zeile;
  const zahl = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(zahl)) return zeile;
  const skaliert = Math.round(zahl * faktor * 100) / 100;
  const zahlText = Number.isInteger(skaliert) ? String(skaliert) : skaliert.toFixed(2).replace(/0$/, "").replace(".", ",");
  return { ...zeile, menge: `${zahlText}${m[2]}` };
}
