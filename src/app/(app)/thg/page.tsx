import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";
import ThgVollbild from "@/components/ThgVollbild";

// Fix-Batch 97 (Florians Wunsch): eigener Reiter für die THG-App (Theodor-Heuss-Gymnasium,
// Stundenplan/Vertretungsplan) — technisch geprüft, dass sich https://app.thg-lu.de/ in einem
// iframe einbetten lässt (kein X-Frame-Options/CSP, kein JS-Frame-Busting). Der Login läuft
// direkt auf der Seite der Schule ab — Familientisch bekommt das Passwort nie zu Gesicht.
// Fix-Batch 99: Eltern haben keinen eigenen Reiter mehr (siehe stattdessen "Schule"), dieser
// Reiter ist jetzt praktisch nur noch für Kinder erreichbar.
// Fix-Batch 103 (Florians Bug-Meldung: Fenster war abgeschnitten): jetzt ein Vollbild-Overlay
// (ThgVollbild) statt eines eingebetteten Fensters, damit die App genauso groß angezeigt wird
// wie im eigenen Browser-Tab.
export default async function ThgPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SeitenTitel icon="🏫" farbe={BEREICH_FARBEN.thg}>
        THG
      </SeitenTitel>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Stundenplan, Vertretungsplan & Co. der Schule — Anmeldung läuft direkt auf der Seite der Schule, nicht über
        Familientisch.
      </p>
      <ThgVollbild hinweis="Auf einem gemeinsam genutzten Gerät bleibt die Anmeldung bestehen, bis sich jemand abmeldet. Falls schlecht lesbar: oben ☀️ hellen Modus wählen (wirkt nur, wenn nicht das Gerät selbst im Dunkelmodus ist)." />
    </div>
  );
}
