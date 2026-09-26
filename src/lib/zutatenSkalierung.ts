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
//
// Fix-Batch 145 (Ticket #6, Florians Bug-Meldung "Zutaten-Übernahme in Einkaufsliste
// fehlerhaft"): beide Regexe oben verlangen, dass die Zeile direkt mit einer Ziffer beginnt.
// Manuell eingetippte oder aus anderen Quellen kopierte Rezept-Zutaten fangen aber oft mit
// einem Aufzählungszeichen ("- ", "• ", "1) "), einer echten Listennummer ODER einem
// Näherungswort ("ca.", "etwa") an — dadurch schlug die Mengenerkennung bisher komplett fehl
// und die gesamte Zeile inkl. Präfix landete unsplittet als "Name" auf der Liste. Solche
// Präfixe werden jetzt vor der eigentlichen Mengen-Erkennung entfernt (in beliebiger
// Kombination/Reihenfolge, z. B. "- ca. 200g Mehl").
function entferneZutatenPraefixe(zeile: string): string {
  let bereinigt = zeile.trim();
  for (let i = 0; i < 5; i++) {
    const ohneAufzaehlung = bereinigt.replace(/^[-•*–]\s*/, "");
    const ohneListennummer = ohneAufzaehlung.replace(/^\d+[.)]\s+/, "");
    const ohneNaeherung = ohneListennummer.replace(/^(circa|zirka|ungefähr|etwa|ca\.?)\s+/i, "");
    if (ohneNaeherung === bereinigt) break;
    bereinigt = ohneNaeherung;
  }
  return bereinigt;
}

export function parseZutatZeile(zeile: string): { name: string; menge?: string } {
  const bereinigt = entferneZutatenPraefixe(zeile);
  const mitEinheit = bereinigt.match(/^([\d.,]+\s*\S+)\s+(.+)$/);
  if (mitEinheit) return { menge: mitEinheit[1], name: mitEinheit[2] };
  const nurZahl = bereinigt.match(/^([\d.,]+)\s+(.+)$/);
  if (nurZahl) return { menge: nurZahl[1], name: nurZahl[2] };
  return { name: bereinigt };
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
