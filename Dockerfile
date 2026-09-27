# Familientisch — Production Dockerfile für Coolify
# Einfacher Single-Stage-Build (bewusst nicht auf minimale Image-Größe optimiert,
# damit Prisma-CLI und Seed-Skript zur Laufzeit verfügbar bleiben).

FROM node:20-bookworm-slim

# Prisma braucht OpenSSL zur Laufzeit, das schlanke "slim"-Image bringt es nicht mit.
# Fix-Batch 149 (Audit-Fund, mehrfach unabhängig gefunden): ohne gesetzte TZ läuft der
# Container in UTC, während die Familie in Deutschland lebt (UTC+1/+2) — das ließ z. B. die
# Essensplan-Wochengrenze ("Samstag") jede Woche zwischen Mitternacht und 1–2 Uhr deutscher
# Zeit noch auf der alten Woche stehen, und ließ eine im Kalender eingetragene Uhrzeit wie
# "14:00" serverseitig als 14:00 UTC statt 14:00 deutscher Zeit interpretieren (2 Std. Versatz,
# u.a. bei Termin-Erinnerungen). `tzdata` liefert die dafür nötige Zeitzonendatenbank.
RUN apt-get update -y && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*
ENV TZ=Europe/Berlin

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

COPY . .

# DATABASE_URL wird zur Laufzeit von Coolify gesetzt; für den Build-Schritt
# (prisma generate + next build) reicht ein Platzhalter, da hier keine
# echte DB-Verbindung nötig ist.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Beim Start: Datenbankschema anlegen/aktualisieren, einmalig Startdaten
# einspielen (Personen, Dienst-Katalog, Kategorien — idempotent), dann die
# eigentliche App starten.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && npx tsx prisma/seed.ts && npm run start"]
