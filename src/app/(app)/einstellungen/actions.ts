"use server";

import { prisma } from "@/lib/prisma";
import { requireParent, requirePerson, requireAdmin, hashPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { erkenneTicketAusSprache, verbessereFormulierung, type ErkanntesTicket } from "@/lib/spracheErkennung";
import { sendePushAnPerson } from "@/lib/push";
import { getWeekStart } from "@/lib/dienstplan";

// Fix-Batch 149 (Audit-Fund): `findMany` ohne `select` gab bisher das komplette Person-Objekt
// zurück, inklusive `pinHash` (bcrypt-Hash der 4-stelligen PIN) und der Lockout-Felder
// `pinFehlversuche`/`pinGesperrtBis` — nur mit `requirePerson()` geschützt, also für JEDE
// eingeloggte Person (auch ein Kind) abrufbar. Eine nur 4-stellige, rein numerische PIN
// (10.000 Kombinationen) lässt sich mit dem Hash offline in Sekunden brute-forcen, was den
// eigens dafür gebauten Lockout-Schutz (Fix-Batch 131) komplett aushebeln würde. `page.tsx`
// filterte diese Felder zwar schon vor der Weitergabe an die Client-Komponente heraus, aber
// die Server Action selbst ist unabhängig davon direkt aufrufbar.
export async function listPersonen() {
  await requirePerson();
  const personen = await prisma.person.findMany({
    orderBy: { reihenfolge: "asc" },
    select: {
      id: true,
      name: true,
      rolle: true,
      farbe: true,
      aktiv: true,
      istAdmin: true,
      reihenfolge: true,
      portionsGewicht: true,
      geburtsdatum: true,
      bundesland: true,
      klassenstufe: true,
      klasse: true,
      pinHash: true,
    },
  });
  // `pinHash` selbst verlässt diese Funktion nie — nur das abgeleitete Boolean, das
  // `page.tsx` für die Anzeige braucht (siehe Kommentar oben).
  return personen.map(({ pinHash, ...p }) => ({ ...p, hatPin: !!pinHash }));
}

// Fix-Batch 149 (Audit-Fund): ohne diese Prüfung konnte eine PIN mit falscher Länge/Zeichen
// gespeichert werden — der Login (reines Ziffern-Pad, sendet erst bei genau 4 Tastendrücken
// automatisch ab) lässt eine solche Person danach NIE mehr einloggen, ohne erkennbaren Grund,
// bis ein Admin die PIN manuell zurücksetzt.
function pruefePinFormat(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "Die PIN muss aus genau 4 Ziffern bestehen.";
  return null;
}

export async function createPerson(data: { name: string; rolle: string; pin?: string; farbe: string }): Promise<{ ok: true } | { ok: false; fehler: string }> {
  await requireAdmin();
  if (data.pin) {
    const fehler = pruefePinFormat(data.pin);
    if (fehler) return { ok: false, fehler };
  }
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
  return { ok: true };
}

export async function setPin(personId: string, pin: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  await requireAdmin();
  const fehler = pruefePinFormat(pin);
  if (fehler) return { ok: false, fehler };
  await prisma.person.update({ where: { id: personId }, data: { pinHash: await hashPin(pin) } });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function setFarbe(personId: string, farbe: string) {
  await requireParent();
  await prisma.person.update({ where: { id: personId }, data: { farbe } });
  revalidatePath("/einstellungen");
}

export async function setAktiv(personId: string, aktiv: boolean): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const admin = await requireAdmin();
  // Fix-Batch 149 (Audit-Fund): ohne diese Sperre konnte sich der einzige Admin selbst
  // deaktivieren (z. B. versehentlicher Klick auf die eigene Zeile) — danach kann sich
  // niemand mehr einloggen, der `setAktiv`/PIN-Reset ausführen dürfte, um das rückgängig zu
  // machen (nur der Admin darf das laut Fix-Batch 140), ohne direkten Datenbankzugriff.
  if (personId === admin.id && !aktiv) {
    return { ok: false, fehler: "Du kannst dich nicht selbst deaktivieren." };
  }
  await prisma.person.update({ where: { id: personId }, data: { aktiv } });
  // Session sofort beenden statt erst beim nächsten Ablauf (bis zu 30 Tage) — ergänzt den
  // Fix in getCurrentPerson(), der eine deaktivierte Person ab jetzt zusätzlich serverseitig
  // bei jeder Anfrage abweist.
  if (!aktiv) await prisma.session.deleteMany({ where: { personId } });
  // Fix-Batch 151 (Audit-Fund, Zweitprüfung): `ensureWeekAssignments`/`ensureBadZuweisungen`
  // (Fix-Batch 150, "die anderen zwei rotieren allein weiter") berechnen die Rotation nur für
  // Wochen NEU, die noch keine Zeilen in der Datenbank haben — eine schon einmal aufgerufene
  // Woche (fast immer: die laufende, da jeder Blick in den Dienstplan sie anlegt) blieb von
  // einer Aktivierungs-Änderung komplett unberührt, obwohl genau das der Zweck der Änderung
  // war. Aktuelle+künftige Dienst-/Bad-Zuweisungen werden deshalb gelöscht und beim nächsten
  // Aufruf lazy mit dem korrekten aktiven-Kinder-Stand neu erzeugt (Tausche/dauerhafte
  // Zuordnungen bleiben unangetastet, sie hängen nicht an diesen Zeilen). Vergangene Wochen
  // (historischer Rückblick, wer tatsächlich was gemacht hat) bleiben bewusst unverändert.
  const dieseWoche = getWeekStart(new Date());
  await prisma.dienstZuweisung.deleteMany({ where: { wocheStart: { gte: dieseWoche } } });
  await prisma.badZuweisung.deleteMany({ where: { wocheStart: { gte: dieseWoche } } });
  revalidatePath("/einstellungen");
  revalidatePath("/dienstplan");
  return { ok: true };
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

// Fix-Batch 146 (Florians Bug-Meldung: "ich hatte auf ein Ticket geantwortet und um
// Rückmeldung gebeten, aber die Kinder sehen es scheinbar in ihrer App gar nicht"): eine
// Rückfrage blieb bisher komplett stumm — kein Push, keine Auffälligkeit im Dashboard (dort
// filterte die Statusliste RUECKFRAGE gar nicht erst mit, siehe dashboard/actions.ts). Ein
// Kind musste von sich aus in die Einstellungen gehen und dort nachschauen, um überhaupt zu
// bemerken, dass eine Antwort erwartet wird — das Ticket hing dadurch "ewig in der Luft".
// Fix-Batch 147 (Florians Nachtrag: "Ja, ich hätte gerne, dass die Kinder eine Push-
// Benachrichtigung bekommen, wenn ihre Tickets entschieden werden. Entweder wenn eine
// Rückfrage gestellt wird, wenn ein Ticket genehmigt wird oder wenn ein Ticket abgelehnt
// wird."): auf alle drei Entscheidungs-Status ausgeweitet, nicht mehr nur Rückfrage.
const TICKET_ENTSCHEIDUNGS_PUSH: Record<string, { titel: string; ohneBegruendung: string }> = {
  RUECKFRAGE: { titel: "Rückfrage zu deinem Ticket", ohneBegruendung: "bitte antworten." },
  GENEHMIGT: { titel: "Dein Ticket wurde genehmigt", ohneBegruendung: "wird umgesetzt." },
  ABGELEHNT: { titel: "Dein Ticket wurde abgelehnt", ohneBegruendung: "" },
};

export async function setzeTicketStatus(id: string, status: string, begruendung?: string) {
  await requireAdmin();
  const ticket = await prisma.ticket.update({ where: { id }, data: { status: status as any, begruendung: begruendung || undefined } });
  const push = TICKET_ENTSCHEIDUNGS_PUSH[status];
  if (push) {
    await sendePushAnPerson(ticket.erstelltVonId, {
      title: push.titel,
      body: begruendung ? `Zu „${ticket.titel}": ${begruendung.slice(0, 100)}` : `„${ticket.titel}" ${push.ohneBegruendung}`.trim(),
      url: "/einstellungen",
    });
  }
  revalidatePath("/einstellungen");
}

// ---------- Ticket-Nachrichten (Fix-Batch 142/143, Florians Wunsch) ----------
// Kinder sollen auf ihre eigenen Tickets noch etwas ergänzen können, und der Admin soll darauf
// antworten können — ein einfacher Nachrichten-Thread je Ticket, zusätzlich zur festen
// Titel/Beschreibung/Begründung. Zugriff bewusst auf genau dieselben zwei Seiten beschränkt,
// die das Ticket überhaupt sehen: der/die Ersteller:in und der Admin.
// Fix-Batch 143 (Florians Bug-Meldung "Man kann nichts abschicken"): beide Funktionen warfen
// bisher rohe Errors — genau das Muster, das laut den KI-Funktionen weiter oben in dieser Datei
// ("...weil Next.js Fehlermeldungen aus Server Actions im Produktions-Build sonst durch eine
// generische Meldung ersetzt...") in Produktion dazu führt, dass beim Absenden schlicht NICHTS
// sichtbar passiert — kein Fehler, keine Bestätigung. Jetzt wie überall sonst in dieser Datei
// als {ok, fehler}-Ergebnis statt als Wurf, damit der Client die echte Meldung anzeigen kann.
async function pruefeTicketZugriff(
  ticketId: string,
  person: { id: string; rolle: string; istAdmin: boolean }
): Promise<{ ok: true; ticket: Awaited<ReturnType<typeof prisma.ticket.findUniqueOrThrow>> } | { ok: false; fehler: string }> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, fehler: "Ticket nicht gefunden." };
  const istEigenes = ticket.erstelltVonId === person.id;
  const istAdmin = person.rolle === "ELTERN" && person.istAdmin;
  if (!istEigenes && !istAdmin) return { ok: false, fehler: "Nicht erlaubt." };
  return { ok: true, ticket };
}

export async function listTicketNachrichten(
  ticketId: string
): Promise<{ ok: true; nachrichten: { id: string; text: string; erstellerName: string; istEigene: boolean; createdAt: string }[] } | { ok: false; fehler: string }> {
  const person = await requirePerson();
  const zugriff = await pruefeTicketZugriff(ticketId, person);
  if (!zugriff.ok) return zugriff;
  const nachrichten = await prisma.ticketNachricht.findMany({
    where: { ticketId },
    include: { erstelltVon: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    ok: true,
    nachrichten: nachrichten.map((n) => ({
      id: n.id,
      text: n.text,
      erstellerName: n.erstelltVon.name,
      istEigene: n.erstelltVonId === person.id,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export async function erstelleTicketNachricht(ticketId: string, text: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requirePerson();
  const zugriff = await pruefeTicketZugriff(ticketId, person);
  if (!zugriff.ok) return zugriff;
  const ticket = zugriff.ticket;
  if (!text.trim()) return { ok: false, fehler: "Nachricht darf nicht leer sein." };
  await prisma.ticketNachricht.create({ data: { ticketId, text: text.trim(), erstelltVonId: person.id } });

  if (person.id === ticket.erstelltVonId) {
    // Fix-Batch 143 (Ticket "Rückfragefunktion für Admin bei Tickets"): antwortet der/die
    // Ersteller:in auf eine offene Rückfrage, springt der Status automatisch zurück auf
    // EINGEREICHT, damit die Antwort nicht in der Rückfrage-Ablage untergeht und der Admin sie
    // wieder in seiner normalen "neu"-Übersicht sieht.
    if (ticket.status === "RUECKFRAGE") {
      await prisma.ticket.update({ where: { id: ticketId }, data: { status: "EINGEREICHT" } });
    }
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
    await sendePushAnPerson(ticket.erstelltVonId, {
      title: "Antwort zu deinem Ticket",
      body: `${person.name} zu „${ticket.titel}": ${text.trim().slice(0, 80)}`,
      url: "/einstellungen",
    });
  }
  revalidatePath("/einstellungen");
  return { ok: true };
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
}): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requireParent();
  // Fix-Batch 149 (Audit-Fund): rohes throw statt {ok,fehler} — dieselbe Konvention, die
  // bereits bei den Ticket-Nachrichten (Fix-Batch 143) als echter Bug erkannt wurde.
  if (!data.titel.trim() || !data.beschreibung.trim()) {
    return { ok: false, fehler: "Titel und Beschreibung dürfen nicht leer sein." };
  }
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
  return { ok: true };
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
export async function wandleHausproblemInAufgabeUm(id: string, personId: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const person = await requireParent();
  const problem = await prisma.hausproblem.findUnique({ where: { id } });
  // Fix-Batch 149 (Audit-Fund): rohes throw statt {ok,fehler} — z. B. erreichbar, wenn ein
  // zweites Eltern-Gerät das Problem zwischenzeitlich schon gelöscht hat.
  if (!problem) return { ok: false, fehler: "Hausproblem nicht gefunden." };
  const aufgabe = await prisma.aufgabe.create({
    data: { titel: problem.titel, personId, erstelltVonId: person.id },
  });
  await prisma.hausproblem.update({ where: { id }, data: { aufgabeId: aufgabe.id } });
  revalidatePath("/einstellungen");
  revalidatePath("/aufgaben");
  return { ok: true };
}
