/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Aktiviert instrumentation.ts (Termin-Erinnerungs-Hintergrund-Timer, Batch 8).
  // bodySizeLimit erhöht, da Server Actions standardmäßig nur 1 MB Anfragedaten erlauben —
  // ein als Base64 codiertes Rezept-Foto (1500px, JPEG-Qualität 0.88) überschreitet das leicht
  // und wurde deshalb von Next.js selbst abgelehnt, bevor der eigene Code überhaupt lief.
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
