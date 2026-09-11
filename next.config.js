/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Aktiviert instrumentation.ts (Termin-Erinnerungs-Hintergrund-Timer, Batch 8).
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
