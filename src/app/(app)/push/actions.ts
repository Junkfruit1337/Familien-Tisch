"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson } from "@/lib/auth";

export async function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function istPushAktiv() {
  return !!process.env.VAPID_PUBLIC_KEY;
}

type SubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function registrierePushSubscription(subscription: SubscriptionJson) {
  const person = await requirePerson();
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { personId: person.id, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    create: {
      personId: person.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function entfernePushSubscription(endpoint: string) {
  const person = await requirePerson();
  // Fix-Batch 150 (Audit-Fund): prüfte bisher nur, dass IRGENDWER eingeloggt ist, nicht ob der
  // Endpoint überhaupt der aufrufenden Person gehört (im Gegensatz zu
  // `hatAktivesPushAufDiesemGeraet`, das die Zugehörigkeit korrekt vergleicht) — jede
  // eingeloggte Person konnte mit einem bekannten Endpoint-String die Push-Subscription einer
  // ANDEREN Person löschen und damit deren Benachrichtigungen unbemerkt deaktivieren.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, personId: person.id } });
}

export async function hatAktivesPushAufDiesemGeraet(endpoint: string) {
  const person = await requirePerson();
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  return !!sub && sub.personId === person.id;
}
