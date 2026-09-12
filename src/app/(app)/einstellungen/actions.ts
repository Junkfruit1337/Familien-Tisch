"use server";

import { prisma } from "@/lib/prisma";
import { requireParent, requirePerson, hashPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { erkenneTicketAusSprache, type ErkanntesTicket } from "@/lib/spracheErkennung";

export async function listPersonen() {
  await requirePerson();
  return prisma.person.findMany({ orderBy: { reihenfolge: "asc" } });
}

export async function createPerson(data: { name: string; rolle: string; pin?: string; farbe: string }) {
  await requireParent();
  const anzahl = await prisma.person.count();
  await prisma.person.create({
    data: {
      name: data.name,
      rolle: data.rolle as any,
      farbe: data.farbe,
      pinHash: data.pin ? await hashPin(data.pin) : null,
      reihenfolge: anzahl,
    },
  });
  revalidatePath("/einstellungen");
}

export async function setPin(personId: string, pin: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { pinHash: await hashPin(pin) } });
  revalidatePath("/einstellungen");
}

export async function setFarbe(personId: string, farbe: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { farbe } });
  revalidatePath("/einstellungen");
}

export async function setAktiv(personId: string, aktiv: boolean) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { aktiv } });
  revalidatePath("/einstellungen");
}

// Portionsgröße für den Essensplan-Skalierungsrechner (Fix-Batch 23) — vorher fest im Code
// (Flo 1.5, Ayla 0.5, Rest 1), jetzt von den Eltern hier pro Person editierbar.
export async function setPortionsGewicht(personId: string, portionsGewicht: number) {
  await requireParent();
  if (!(portionsGewicht > 0)) return;
  await prisma.person.update({ where: { id: personId }, data: { portionsGewicht } });
  revalidatePath("/einstellungen");
  revalidatePath("/essensplan");
}

// Geburtstag (Fix-Batch 30) — jede Person trägt ihr eigenes Geburtsdatum ein (auch Kinder
// ohne Eltern-Rechte), damit es automatisch jedes Jahr im Kalender der ganzen Familie erscheint.
// Fix-Batch 35 Nachtrag (Florians korrigiertes Ticket "Lösung für Geburtstage"): NICHT mehr
// selbst durch die Person einstellbar — nur noch Eltern, und für jede Person (nicht nur sich
// selbst). Grund: Geburtstage sollen zentral von den Erwachsenen gepflegt werden.
export async function setGeburtsdatum(personId: string, datum: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { geburtsdatum: new Date(datum) } });
  revalidatePath("/einstellungen");
  revalidatePath("/kalender");
}

// ---------- Ticketsystem: Fehlermeldungen/Verbesserungsvorschläge (Fix-Batch 26) ----------

// Spracheingabe → Titel/Beschreibung-Entwurf, wird erst nach Prüfung durch den Nutzer
// eingereicht (analog Rezept-Foto/Termine/Aufgaben/Noten). Ergebnis-Objekt statt Wurf,
// damit Next.js' Fehler-Redaction in Server Actions die echte Meldung nicht verschluckt.
export async function erkenneTicketAusText(text: string): Promise<{ ok: true; ticket: ErkanntesTicket } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const ticket = await erkenneTicketAusSprache(text);
    return { ok: true, ticket };
  } catch (err) {
    console.error("Spracheingabe (Ticket) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// fotos erlaubt mehrere Screenshots pro Ticket (Fix-Batch 35 Nachtrag, Florians Wunsch).
export async function erstelleTicket(titel: string, beschreibung: string, fotos?: string[]) {
  const person = await requirePerson();
  if (!titel.trim() || !beschreibung.trim()) throw new Error("Titel und Beschreibung dürfen nicht leer sein.");
  await prisma.ticket.create({
    data: { titel: titel.trim(), beschreibung: beschreibung.trim(), fotos: fotos ?? [], erstelltVonId: person.id },
  });
  revalidatePath("/einstellungen");
}

// Jede Person sieht nur ihre eigenen eingereichten Tickets mit Status (Fragenkatalog-
// Anforderung: "Ticketersteller kann immer den Status seines Tickets anschauen").
export async function listMeineTickets() {
  const person = await requirePerson();
  return prisma.ticket.findMany({ where: { erstelltVonId: person.id }, orderBy: { createdAt: "desc" } });
}

// Eltern sehen und bearbeiten alle Tickets — die App kennt keine Sonderrechte zwischen
// einzelnen Elternteilen (Fragenkatalog), daher hier bewusst nicht auf Florian beschränkt.
export async function listAlleTickets() {
  await requireParent();
  return prisma.ticket.findMany({ include: { erstelltVon: true }, orderBy: { createdAt: "desc" } });
}

export async function setzeTicketStatus(id: string, status: string, begruendung?: string) {
  await requireParent();
  await prisma.ticket.update({ where: { id }, data: { status: status as any, begruendung: begruendung || undefined } });
  revalidatePath("/einstellungen");
}

// ---------- Hausreparaturen/Vermieterkommunikation (Fix-Batch 35 Nachtrag) ----------
// Jede Person darf melden/mitlesen (nicht nur Eltern) — wer ein Problem im Haus entdeckt,
// soll es unkompliziert eintragen können. Status/Zuständigkeit ändern und die Umwandlung
// in eine Aufgabe bleibt Eltern vorbehalten (analog anderen Verwaltungsaktionen).

export async function listHausprobleme() {
  await requirePerson();
  return prisma.hausproblem.findMany({ include: { erstelltVon: true }, orderBy: { createdAt: "desc" } });
}

export async function erstelleHausproblem(data: {
  titel: string;
  beschreibung: string;
  zustaendigkeit: "VERMIETER" | "FAMILIE";
  fotos?: string[];
}) {
  const person = await requirePerson();
  if (!data.titel.trim() || !data.beschreibung.trim()) throw new Error("Titel und Beschreibung dürfen nicht leer sein.");
  await prisma.hausproblem.create({
    data: {
      titel: data.titel.trim(),
      beschreibung: data.beschreibung.trim(),
      zustaendigkeit: data.zustaendigkeit,
      fotos: data.fotos ?? [],
      erstelltVonId: person.id,
    },
  });
  revalidatePath("/einstellungen");
}

// Spracheingabe fürs Hausreparatur-Formular — nutzt bewusst dieselbe Erkennungsfunktion wie
// Tickets (identisches {titel, beschreibung}-Format), keine eigene Funktion nötig.
export async function erkenneHausproblemAusText(text: string): Promise<{ ok: true; titel: string; beschreibung: string } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const ergebnis = await erkenneTicketAusSprache(text);
    return { ok: true, titel: ergebnis.titel, beschreibung: ergebnis.beschreibung };
  } catch (err) {
    console.error("Spracheingabe (Hausproblem) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

export async function updateHausproblem(
  id: string,
  data: { status?: "GEMELDET" | "IN_BEARBEITUNG" | "ERLEDIGT"; zustaendigkeit?: "VERMIETER" | "FAMILIE"; notizen?: string }
) {
  await requireParent();
  await prisma.hausproblem.update({
    where: { id },
    data: {
      status: data.status,
      zustaendigkeit: data.zustaendigkeit,
      notizen: data.notizen !== undefined ? data.notizen || null : undefined,
    },
  });
  revalidatePath("/einstellungen");
}

export async function loescheHausproblem(id: string) {
  await requireParent();
  await prisma.hausproblem.delete({ where: { id } });
  revalidatePath("/einstellungen");
}

// Wandelt ein selbst zu erledigendes Hausproblem in eine normale Aufgabe für ein
// Familienmitglied um — landet danach in der regulären Aufgabenliste, das Hausproblem
// merkt sich per aufgabeId, dass/wofür schon eine Aufgabe angelegt wurde.
export async function wandleHausproblemInAufgabeUm(id: string, personId: string) {
  const person = await requireParent();
  const problem = await prisma.hausproblem.findUnique({ where: { id } });
  if (!problem) throw new Error("Hausproblem nicht gefunden.");
  const aufgabe = await prisma.aufgabe.create({
    data: { titel: problem.titel, personId, erstelltVonId: person.id },
  });
  await prisma.hausproblem.update({ where: { id }, data: { aufgabeId: aufgabe.id } });
  revalidatePath("/einstellungen");
  revalidatePath("/aufgaben");
}
