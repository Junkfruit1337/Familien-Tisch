import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Person, Familie } from "@prisma/client";

const COOKIE_NAME = "familientisch_session";
const SESSION_DAYS = 30;

// Fix-Batch 137: jede eingeloggte Person bringt jetzt die Einstellungen ihrer eigenen Familie
// mit (Bereiche an/aus, THG-URL, KI-Funktionen an/aus) — so muss nicht an jeder einzelnen
// Stelle im Code extra danach gefragt werden.
export type PersonMitFamilie = Person & { familie: Familie | null };

export async function verifyPin(person: Person, pin: string): Promise<boolean> {
  if (!person.pinHash) return false;
  return bcrypt.compare(pin, person.pinHash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function createSession(personId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { personId, expiresAt },
  });
  cookies().set(COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const sessionId = cookies().get(COOKIE_NAME)?.value;
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  cookies().delete(COOKIE_NAME);
}

export async function getCurrentPerson(): Promise<PersonMitFamilie | null> {
  const sessionId = cookies().get(COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { person: { include: { familie: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.person;
}

export async function requireParent(): Promise<PersonMitFamilie> {
  const person = await getCurrentPerson();
  if (!person || person.rolle !== "ELTERN") {
    throw new Error("Nur Eltern dürfen das.");
  }
  return person;
}

export async function requirePerson(): Promise<PersonMitFamilie> {
  const person = await getCurrentPerson();
  if (!person) throw new Error("Nicht eingeloggt.");
  return person;
}

// Fix-Batch 137 (Florians Wunsch: "die andere Familie" soll keine laufenden KI-Kosten
// verursachen): zentrale Prüfung, ob kostenpflichtige KI-Funktionen (Spracheingabe, Foto-
// erkennung, Formulierungshilfe, Rezept-Vorschläge, ...) für die Familie der übergebenen
// Person überhaupt erlaubt sind. Ohne zugeordnete Familie (sollte nach dem Backfill nicht
// vorkommen) wird bewusst nicht blockiert, um niemanden versehentlich auszusperren.
export function kiErlaubt(person: PersonMitFamilie): boolean {
  return person.familie?.kiFunktionenAktiv ?? true;
}

export const KI_DEAKTIVIERT_FEHLER = "KI-Funktionen sind für eure Familie nicht aktiviert.";
