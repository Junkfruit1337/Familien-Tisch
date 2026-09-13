import { getCurrentPerson } from "@/lib/auth";
import SeitenTitel from "@/components/SeitenTitel";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

// Fix-Batch 97 (Florians Wunsch): eigener Reiter für die THG-App (Theodor-Heuss-Gymnasium,
// Stundenplan/Vertretungsplan) — technisch geprüft, dass sich https://app.thg-lu.de/ in einem
// iframe einbetten lässt (kein X-Frame-Options/CSP, kein JS-Frame-Busting). Der Login läuft
// direkt auf der Seite der Schule ab — Familientisch bekommt das Passwort nie zu Gesicht.
const THG_URL = "https://app.thg-lu.de/";

export default async function ThgPage() {
  const person = await getCurrentPerson();
  const istEltern = person?.rolle === "ELTERN";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SeitenTitel icon="🏫" farbe={BEREICH_FARBEN.thg}>
        THG
      </SeitenTitel>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Stundenplan, Vertretungsplan & Co. der Schule — Anmeldung läuft direkt auf der Seite der Schule, nicht über
        Familientisch.
        {istEltern && (
          <>
            {" "}
            Achtung: Meldet sich hier ein anderes Kind an, bleibt diese Anmeldung so lange bestehen, bis sich jemand
            wieder abmeldet — auf einem gemeinsam genutzten Gerät ggf. vor dem Wechsel abmelden.
          </>
        )}
      </p>
      <iframe
        src={THG_URL}
        title="THG-App"
        style={{ width: "100%", height: "80vh", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
      />
    </div>
  );
}
