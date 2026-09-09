import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Person } from "@prisma/client";

const COOKIE_NAME = "familientisch_session";
const SESSION_DAYS = 30;

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

export async function getCurrentPerson(): Promise<Person | null> {
  const sessionId = cookies().get(COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { person: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.person;
}

export async function requireParent(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person || person.rolle !== "ELTERN") {
    throw new Error("Nur Eltern dürfen das.");
  }
  return person;
}

export async function requirePerson(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) throw new Error("Nicht eingeloggt.");
  return person;
}
