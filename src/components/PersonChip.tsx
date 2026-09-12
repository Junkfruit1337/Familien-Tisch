// Redesign (Fix-Batch 56): vereinheitlicht 4 verschiedene Ad-hoc-Darstellungen, die im Code
// verstreut "das hier gehört zu Person X" ausgedrückt haben — farbiger Punkt (Dienstplan),
// farbige Umrandung (Dienstplan), farbige Volltonfläche (AppShell-Kopfzeile), reiner
// Farbtext (Kalender/Schule) — auf eine einzige, konsistente runde Initialen-Kachel.
export default function PersonChip({
  name,
  farbe,
  size = 24,
}: {
  name: string;
  farbe: string;
  size?: number;
}) {
  return (
    <span
      className="person-chip"
      style={{
        width: size,
        height: size,
        background: farbe,
        fontSize: Math.max(9, Math.round(size * 0.42)),
      }}
      title={name}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
