# Familientisch — Projektkontext für Claude Code

Dieses Projekt wurde bisher über eine Cowork-Session entwickelt (Cloud-Sandbox ohne
direkten Git-Zugriff auf dieses Repo — jede Änderung musste als Datei rübergeschickt,
von Florian committed/gepusht und in Coolify redeployt werden). Ab jetzt läuft die
Entwicklung direkt hier in Claude Code weiter, mit vollem Git- und Terminal-Zugriff.

**Lies zuerst diese beiden Dateien komplett, bevor du irgendetwas am Code änderst:**

1. `FAHRPLAN.md` — die komplette Projektdokumentation: Vision, Datenmodell-Entscheidungen,
   Anforderungs-Log (chronologisch, jede Änderung/jeder Bugfix mit Begründung),
   und Abschnitt 6 "Nächste Schritte" mit dem aktuellen Stand und offenen Punkten.
2. `FRAGENKATALOG.md` — alle 52 beantworteten Grundsatz- und Detailfragen zu jedem
   Bereich der App (Kalender, Einkaufsliste, Dienstplan, Schule/Noten, Essensplan, etc.).
   Jede Antwort dort ist eine verbindliche Produktentscheidung von Florian.

## Wichtigste technische Eckpunkte

- Next.js 14 App Router, Server Actions (`"use server"`-Dateien), Prisma ORM + PostgreSQL, TypeScript.
- **Kritisch:** Jede exportierte Funktion in einer `"use server"`-Datei MUSS `async` sein —
  ein synchroner Export lässt `next build` fehlschlagen (das ist bereits einmal passiert,
  siehe Anforderungs-Log-Eintrag "Build-Fix" in FAHRPLAN.md).
- Deployment läuft über Coolify; der Dockerfile-Start-Befehl führt bei jedem Deploy
  automatisch `prisma db push --accept-data-loss --skip-generate` aus — Schema-Änderungen
  in `prisma/schema.prisma` erreichen die Live-Datenbank also automatisch beim nächsten
  Deploy, ohne manuelle Migration.
- Alle App-Routen liegen unter `src/app/(app)/<bereich>/` mit je `page.tsx`, `actions.ts`,
  `<Bereich>Client.tsx`.

## Laufender Stand / nächste Schritte

- FAHRPLAN.md Abschnitt 6 "Nächste Schritte" gibt den narrativen Überblick über den aktuellen Stand.
- **FAHRPLAN.md Abschnitt 7 "Backlog-Details: Batches 2–8" ist die vollständige, itemisierte
  Arbeitsliste** — pro Punkt mit Quelle, Ist-/Soll-Zustand, Aufwandsschätzung und Status
  (✅ erledigt / ⏳ offen). Das ist die primäre Grundlage für die weitere Umsetzung.
  Batch 1 (Kalender) ist bereits vollständig erledigt.
- Bei "Braucht Florians Entscheidung" markierte Punkte NICHT selbst entscheiden, sondern
  nachfragen — z. B. Rezept-Foto-Erkennung (Batch 8) braucht noch einen API-Schlüssel
  eines Anbieters, den Florian in Coolify hinterlegen muss, bevor der Punkt gebaut werden kann.

Bitte im Anforderungs-Log (FAHRPLAN.md, Abschnitt 5) weiter dokumentieren, was umgesetzt
wird, damit der Verlauf lückenlos bleibt — Florian legt darauf Wert.
