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
  await requirePerson();
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function hatAktivesPushAufDiesemGeraet(endpoint: string) {
  const person = await requirePerson();
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  return !!sub && sub.personId === person.id;
}
