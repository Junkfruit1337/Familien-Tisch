import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";

// Web-Push-Versand (Fragenkatalog Frage 33, Batch 8). Ohne laufende Kosten, da über den
// Standard-Web-Push-Mechanismus der Browser (kein Drittanbieter-Dienst nötig).
// Ohne hinterlegte VAPID-Schlüssel (Coolify-Umgebungsvariablen) sendet die App einfach
// nichts, statt Fehler zu werfen — Push ist ein optionales Extra, kein Pflichtfeature.

function istKonfiguriert(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidGesetzt = false;
function stelleVapidSicher() {
  if (vapidGesetzt) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:familie@familien-tisch.de",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidGesetzt = true;
}

export type PushPayload = { title: string; body: string; url?: string };

export async function sendePushAnPerson(personId: string, payload: PushPayload) {
  if (!istKonfiguriert()) return;
  stelleVapidSicher();
  const subs = await prisma.pushSubscription.findMany({ where: { personId } });
  await Promise.all(subs.map((sub) => sendeAnSubscription(sub, payload)));
}

export async function sendePushAnEltern(payload: PushPayload) {
  if (!istKonfiguriert()) return;
  const eltern = await prisma.person.findMany({ where: { rolle: "ELTERN", aktiv: true } });
  await Promise.all(eltern.map((p) => sendePushAnPerson(p.id, payload)));
}

export async function sendePushAnAlle(payload: PushPayload) {
  if (!istKonfiguriert()) return;
  stelleVapidSicher();
  const subs = await prisma.pushSubscription.findMany();
  await Promise.all(subs.map((sub) => sendeAnSubscription(sub, payload)));
}

async function sendeAnSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err: any) {
    // 404/410 = Subscription ist beim Browser abgelaufen/widerrufen -> aufräumen.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error("Push-Versand fehlgeschlagen:", err?.message ?? err);
    }
  }
}
