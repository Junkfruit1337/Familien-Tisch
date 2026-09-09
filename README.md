# Familientisch — Grundgerüst

Die technische Basis der echten Familientisch-App (Next.js 14 + PostgreSQL + Prisma), gebaut nach den Entscheidungen in `fahrplan_v2.md` / `fragenkatalog.md`: PIN-Login mit Rollen (Eltern / Kind / Kind ohne Zugang), Änderungshistorie für die vereinbarten Bereiche, und die Kernmodule Kalender, Aufgaben, Einkaufsliste, Schule & Taschengeld, Dienstplan, Essensplan sowie ein Tages-Dashboard.

Das ist bewusst **Phase 4 „Technisches Grundgerüst"** — funktionsfähig und deploybar, aber noch nicht mit jedem der ~15 Feinschliff-Batches des ursprünglichen Prototyps (Claude Artifact) nachgezogen. Die nächsten Ausbaustufen laufen wie beim Prototyp: Feedback sammeln, Stück für Stück ergänzen.

## In Coolify einrichten

1. **Application-Ressource anlegen**: Im Projekt "My first project" → "+ New Resource" → "Application" → als Quelle das GitHub-Repo `Junkfruit1337/Familien-Tisch` auswählen (ggf. GitHub-Verbindung in Coolify unter "Sources" einmalig herstellen). Build Pack: **Dockerfile** (wird automatisch erkannt).
2. **Environment Variable setzen**: `DATABASE_URL` mit den Zugangsdaten der bereits angelegten Postgres-Ressource "Familien-Tisch" (Coolify → diese Ressource → "Credentials"/"Database details"). Format:
   ```
   postgresql://USER:PASSWORT@INTERNER_HOSTNAME:5432/DBNAME
   ```
   Den internen Hostnamen zeigt Coolify bei der Datenbank-Ressource an (meist der Container-/Service-Name). `.env.example` in diesem Repo zeigt das Format.
3. **Domain hinterlegen**: Bei der Application-Ressource unter "Domains" `familien-tisch.de` (und optional `www.familien-tisch.de`) eintragen — Coolify kümmert sich automatisch um das HTTPS-Zertifikat (Let's Encrypt).
4. **Deploy** klicken. Der erste Start dauert etwas länger, weil dabei automatisch das Datenbankschema angelegt und Startdaten eingespielt werden (Familie, Dienst-Katalog, Einkaufs-Kategorien).

## Erster Login

Nach dem ersten erfolgreichen Deploy sind alle sechs Familienmitglieder bereits angelegt (Flo, Tugce, Lina, Emil, Emma als Eltern/Kinder mit Login, Ayla als „Kind ohne Zugang"). **Der Start-PIN für alle ist `0000`** — bitte für jede Person sofort unter „Mehr" → „Einstellungen" einen echten PIN setzen.

## Was im Grundgerüst schon funktioniert

- PIN-Login pro Person, Rollen Eltern/Kind/Kind-ohne-Zugang, Sessions in der Datenbank
- Kalender: Termine anlegen/löschen, Personen-Filter, Kinder sehen nur eigene + familienweite Termine und legen nur für sich selbst an
- Aufgaben: analog zum Kalender, mit Erledigt-Liste
- Einkaufsliste: Kategorien, Eltern pflegen direkt, Kinder reichen Wünsche ein, die genehmigt/abgelehnt werden
- Schule & Taschengeld: Fächer pro Kind, Noten eintragen (Kind → Genehmigung durch Eltern, Eltern-Eintrag sofort gültig), automatische Gutschrift (1 = 10 €, 2 = 5 €), Auszahlung mit Kontostand-Prüfung, Sparziel, „Als Nächstes steht an" mit Lerntipp
- Dienstplan: 3-Schichten-Rotation rechnerisch verankert (wie im Prototyp), **echter** Dienst-Tausch (ändert die tatsächliche Zuweisung, nicht nur eine Anzeige), einzeln aufhebbar
- Essensplan: Rezepte anlegen, Wochenplan (Samstag–Samstag) mit Sperren, einfache Zutaten-Übernahme auf die Einkaufsliste
- Tages-Dashboard: heutiges Essen, heutige Termine, anstehende Klassenarbeiten/Kontrollen mit Countdown und Lerntipp
- Änderungshistorie (Datenmodell `AenderungsLog`) wird bereits für Termine, Aufgaben, Noten, Taschengeld, Dienst-Tausch und Einkaufs-Wünsche mitgeschrieben — eine Anzeige dieser Historie in der Oberfläche („aufklappbarer Bereich je Eintrag") ist als nächster Ausbauschritt vorgesehen.

## Bewusst noch nicht enthalten (nächste Ausbaustufen)

- Anzeige der Änderungshistorie in der Oberfläche (Daten werden schon gesammelt)
- Bad-Reihenfolge morgens/abends (Datenmodell steht, UI fehlt noch)
- Wunsch-Historie sichtbar machen (Status wird gespeichert, aber noch keine eigene Verlaufsansicht)
- Feinheiten aus den ~15 Prototyp-Batches (Mengen-Zusammenführung in der Einkaufsliste, Portionsrechner im Essensplan, Wochen-/Tagesansicht im Kalender, Notengewichtung pro Fach, Serientermine, u. v. m.)
- Spracheingabe, Rezept-Erfassung per Foto (brauchen KI im Hintergrund, wie im Fahrplan vermerkt)
- Push-Benachrichtigungen (PWA-Grundgerüst mit `manifest.json` ist vorbereitet; Icons unter `public/icon-192.png` und `public/icon-512.png` müssen noch ergänzt werden)

## Lokale Entwicklung (optional, für Claude/technische Weiterentwicklung)

```bash
npm install
cp .env.example .env   # DATABASE_URL anpassen
npm run db:push        # Schema in die DB übertragen
npm run db:seed        # Startdaten einspielen
npm run dev
```
