# Familientisch — Production Dockerfile für Coolify
# Einfacher Single-Stage-Build (bewusst nicht auf minimale Image-Größe optimiert,
# damit Prisma-CLI und Seed-Skript zur Laufzeit verfügbar bleiben).

FROM node:20-bookworm-slim

# Prisma braucht OpenSSL zur Laufzeit, das schlanke "slim"-Image bringt es nicht mit.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
