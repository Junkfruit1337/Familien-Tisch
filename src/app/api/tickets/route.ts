import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Automatisierter Ticket-Zugriff für Claude Code (Fix-Batch 34, Florians Wunsch) — diese
// Dev-Umgebung hat keinen direkten Zugriff auf die Live-Datenbank, Florian musste bisher
// jedes Mal Screenshots der genehmigten Tickets schicken. Dieser Endpunkt erlaubt stattdessen
// einen authentifizierten Abruf/Abgleich per HTTPS, unabhängig von einer Browser-Session.
// Auth über ein einzelnes geteiltes Token (TICKET_API_TOKEN, in Coolify als Umgebungsvariable
// hinterlegt — analog den VAPID-Keys für Push), NICHT über Cookies/Login.

// Fix-Batch 150 (Audit-Fund): RUECKFRAGE fehlte hier — derselbe Fehler wie schon mehrfach in
// diesem Projekt gefunden, ein neuer TicketStatus-Wert (Fix-Batch 143) wurde an dieser
// unabhängig hartkodierten Stelle vergessen. Ohne das hier hätte dieser API-Endpunkt ein
// Ticket nie auf Rückfrage setzen können.
const GUELTIGE_STATUS = ["EINGEREICHT", "GENEHMIGT", "ABGELEHNT", "IN_UMSETZUNG", "UMGESETZT", "RUECKFRAGE"];

function autorisiert(req: NextRequest): boolean {
  const token = process.env.TICKET_API_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const erwartet = `Bearer ${token}`;
  // Fix-Batch 150 (Audit-Fund): ein normaler `===`-Vergleich bricht beim ersten abweichenden
  // Byte ab — ein klassisches Timing-Angriffsmuster gegen ein Secret mit direktem
  // Datenbank-Schreibzugriff. `timingSafeEqual` braucht gleich lange Buffer, deshalb erst die
  // Länge vergleichen (das verrät nur die Länge, nicht den Inhalt).
  const headerBuf = Buffer.from(header);
  const erwartetBuf = Buffer.from(erwartet);
  if (headerBuf.length !== erwartetBuf.length) return false;
  return timingSafeEqual(headerBuf, erwartetBuf);
}

// GET /api/tickets            -> nur offene Arbeit: GENEHMIGT (Standardfall zum Abholen)
// GET /api/tickets?alle=1     -> wirklich alle Tickets, jeden Status (zur Übersicht/Debug)
export async function GET(req: NextRequest) {
  if (!autorisiert(req)) {
    return NextResponse.json({ fehler: "Nicht autorisiert." }, { status: 401 });
  }
  const alle = req.nextUrl.searchParams.get("alle") === "1";
  const tickets = await prisma.ticket.findMany({
    where: alle ? {} : { status: "GENEHMIGT" },
    include: { erstelltVon: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      titel: t.titel,
      beschreibung: t.beschreibung,
      status: t.status,
      begruendung: t.begruendung,
      erstellerName: t.erstelltVon.name,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

// PATCH /api/tickets  { id, status, begruendung? }  -> Status setzen (z.B. nach Umsetzung "UMGESETZT")
export async function PATCH(req: NextRequest) {
  if (!autorisiert(req)) {
    return NextResponse.json({ fehler: "Nicht autorisiert." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.id || typeof body.id !== "string" || !body?.status || typeof body.status !== "string") {
    return NextResponse.json({ fehler: "Felder 'id' und 'status' sind erforderlich." }, { status: 400 });
  }
  if (!GUELTIGE_STATUS.includes(body.status)) {
    return NextResponse.json({ fehler: `Ungültiger Status. Erlaubt: ${GUELTIGE_STATUS.join(", ")}` }, { status: 400 });
  }
  const ticket = await prisma.ticket.update({
    where: { id: body.id },
    data: { status: body.status, begruendung: typeof body.begruendung === "string" ? body.begruendung : undefined },
  }).catch(() => null);
  if (!ticket) {
    return NextResponse.json({ fehler: "Ticket nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
