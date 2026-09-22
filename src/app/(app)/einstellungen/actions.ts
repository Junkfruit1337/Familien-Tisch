"use server";

import { prisma } from "@/lib/prisma";
import { requireParent, requirePerson, requireAdmin, hashPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { erkenneTicketAusSprache, verbessereFormulierung, type ErkanntesTicket } from "@/lib/spracheErkennung";
import { sendePushAnPerson } from "@/lib/push";

export async function listPersonen() {
  await requirePerson();
  return prisma.person.findMany({ orderBy: { reihenfolge: "asc" } });
}

export async function createPerson(data: { name: string; rolle: string; pin?: string; farbe: string }) {
  await requireAdmin();
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
  await requireAdmin();
  await prisma.person.update({ where: { id: personId }, data: { pinHash: await hashPin(pin) } });
  revalidatePath("/einstellungen");
}

export async function setFarbe(personId: string, farbe: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { farbe } });
  revalidatePath("/einstellungen");
}

export async function setAktiv(personId: string, aktiv: boolean) {
  await requireAdmin();
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

// Fix-Batch 64 (Florians KI-Vorschlag "KI hilft beim Formulieren"): verbessert einen bereits
// getippten Entwurf, unabhängig von der Spracheingabe — für Ticket UND Hausproblem-Formular
// nutzbar (identisches Titel/Beschreibung-Format).
export async function verbessereEntwurf(
  titel: string,
  beschreibung: string
): Promise<{ ok: true; titel: string; beschreibung: string } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const ergebnis = await verbessereFormulierung(titel, beschreibung);
    return { ok: true, titel: ergebnis.titel, beschreibung: ergebnis.beschreibung };
  } catch (err) {
    console.error("Formulierungshilfe fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Formulierungshilfe.";
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

// Fix-Batch 140 (Florians Wunsch): Tickets triagieren/entscheiden ist jetzt Admin-Sache
// (vorher bewusst nicht auf Florian beschränkt, siehe alter Kommentar — das hat sich mit der
// neuen Admin/Erwachsene-Unterscheidung geändert).
export async function listAlleTickets() {
  await requireAdmin();
  return prisma.ticket.findMany({ include: { erstelltVon: true }, orderBy: { createdAt: "desc" } });
}

export async function setzeTicketStatus(id: string, status: string, begruendung?: string) {
  await requireAdmin();
  await prisma.ticket.update({ where: { id }, data: { status: status as any, begruendung: begruendung || undefined } });
  revalidatePath("/einstellungen");
}

// ---------- Ticket-Nachrichten (Fix-Batch 142, Florians Wunsch) ----------
// Kinder sollen auf ihre eigenen Tickets noch etwas ergänzen können, und der Admin soll darauf
// antworten können — ein einfacher Nachrichten-Thread je Ticket, zusätzlich zur festen
// Titel/Beschreibung/Begründung. Zugriff bewusst auf genau dieselben zwei Seiten beschränkt,
// die das Ticket überhaupt sehen: der/die Ersteller:in und der Admin.
async function pruefeTicketZugriff(ticketId: string, person: { id: string; rolle: string; istAdmin: boolean }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket nicht gefunden.");
  const istEigenes = ticket.erstelltVonId === person.id;
  const istAdmin = person.rolle === "ELTERN" && person.istAdmin;
  if (!istEigenes && !istAdmin) throw new Error("Nicht erlaubt.");
  return ticket;
}

export async function listTicketNachrichten(ticketId: string) {
  const person = await requirePerson();
  await pruefeTicketZugriff(ticketId, person);
  const nachrichten = await prisma.ticketNachricht.findMany({
    where: { ticketId },
    include: { erstelltVon: true },
    orderBy: { createdAt: "asc" },
  });
  return nachrichten.map((n) => ({
    id: n.id,
    text: n.text,
    erstellerName: n.erstelltVon.name,
    istEigene: n.erstelltVonId === person.id,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function erstelleTicketNachricht(ticketId: string, text: string) {
  const person = await requirePerson();
  const ticket = await pruefeTicketZugriff(ticketId, person);
  if (!text.trim()) throw new Error("Nachricht darf nicht leer sein.");
  await prisma.ticketNachricht.create({ data: { ticketId, text: text.trim(), erstelltVonId: person.id } });

  if (person.id === ticket.erstelltVonId) {
    // Ersteller:in hat geschrieben -> alle Admins benachrichtigen.
    const admins = await prisma.person.findMany({ where: { rolle: "ELTERN", istAdmin: true, aktiv: true } });
    await Promise.all(
      admins.map((a) =>
        sendePushAnPerson(a.id, {
          title: "Neue Nachricht zu einem Ticket",
          body: `${person.name} zu „${ticket.titel}": ${text.trim().slice(0, 80)}`,
          url: "/einstellungen",
        })
      )
    );
  } else {
    // Admin hat geantwortet -> Ersteller:in benachrichtigen.
    await sendePushAnPerson(ticket.erstelltVonId, {
      title: "Antwort zu deinem Ticket",
      body: `${person.name} zu „${ticket.titel}": ${text.trim().slice(0, 80)}`,
      url: "/einstellungen",
    });
  }
  revalidatePath("/einstellungen");
}

// ---------- Hausreparaturen/Vermieterkommunikation (Fix-Batch 35 Nachtrag) ----------
// Fix-Batch 50 Korrektur: ausschließlich Eltern-Sache — Kinder sollen nur Fehler/Verbesserungs-
// vorschläge zur App melden (Tickets), nicht Hausmängel/Vermieterkommunikation.

export async function listHausprobleme() {
  await requireParent();
  return prisma.hausproblem.findMany({ include: { erstelltVon: true }, orderBy: { createdAt: "desc" } });
}

export async function erstelleHausproblem(data: {
  titel: string;
  beschreibung: string;
  zustaendigkeit: "VERMIETER" | "FAMILIE";
  fotos?: string[];
}) {
  const person = await requireParent();
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
  await requireParent();
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
