// Wird von Next.js einmalig beim Serverstart ausgeführt (nicht bei jedem Request) —
// idealer Ort, um den Termin-Erinnerungs-Hintergrund-Timer zu registrieren.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { starteTerminErinnerungen } = await import("./lib/terminErinnerungen");
    starteTerminErinnerungen();
  }
}
