// Fix-Batch 77 (Florians Wunsch): "wer hat wann was gemacht"-Angaben (Tickets, Hausprobleme,
// Wünsche, Noten, ...) sollen übersichtlich UND mit Uhrzeit versehen sein, nicht nur dem Datum.
export function formatiereDatumUhrzeit(datum: Date | string): string {
  return (
    new Date(datum).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " Uhr"
  );
}
