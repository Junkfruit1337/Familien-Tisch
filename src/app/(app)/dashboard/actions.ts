"use server";

import { requirePerson } from "@/lib/auth";
import { getWochenplan } from "../essensplan/actions";
import { listAnstehendeSchulEintraege } from "../schule/actions";
import { prisma } from "@/lib/prisma";
import { sendePushAnEltern, sendePushAnPerson } from "@/lib/push";

function lerntipp(tageBis: number): string {
  if (tageBis <= 0) return "Heute ist es so weit — nochmal kurz die Zusammenfassung durchlesen!";
  if (tageBis === 1) return "Morgen schon! Heute Abend nochmal in Ruhe wiederholen.";
  if (tageBis <= 3) return "Noch ein paar Tage — jeden Tag 15–20 Minuten üben bringt mehr als alles auf einmal.";
  return "Ist noch etwas hin — schon mal die Übersicht/Zusammenfassung anlegen.";
}

// Fix-Batch 62 (Florians Wunsch nach Push-Erinnerungen): es gibt keinen echten Cron-Job im
// Hintergrund, deshalb wird hier bei JEDEM Dashboard-Aufruf (durch egal welche Person)
// geprüft, ob eine der beiden zeitgesteuerten Erinnerungen fällig ist — dank der Gesendet-
// Markierungen (geburtstagErinnerungJahr/lerntippGesendet) passiert das trotzdem nur einmal.
// Reicht in der Praxis, da die Startseite ohnehin mehrmals täglich von irgendjemandem
// geöffnet wird.
async function pruefeUndSendeErinnerungen() {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Geburtstags-Vorlauf-Erinnerung: 7 Tage vorher einmal pro Jahr an die Eltern, damit noch
  // Zeit fürs Geschenk bleibt.
  const in7Tagen = new Date(heute);
  in7Tagen.setDate(in7Tagen.getDate() + 7);
  const zielJahr = in7Tagen.getFullYear();
  const personenMitGeburtstag = await prisma.person.findMany({ where: { aktiv: true, geburtsdatum: { not: null } } });
  for (const p of personenMitGeburtstag) {
    if (!p.geburtsdatum) continue;
    const passt = p.geburtsdatum.getMonth() === in7Tagen.getMonth() && p.geburtsdatum.getDate() === in7Tagen.getDate();
    if (passt && p.geburtstagErinnerungJahr !== zielJahr) {
      await sendePushAnEltern({
        title: "Geburtstag in einer Woche 🎂",
        body: `${p.name} hat in 7 Tagen Geburtstag — noch Zeit, ein Geschenk zu besorgen.`,
        url: "/kalender",
      });
      await prisma.person.update({ where: { id: p.id }, data: { geburtstagErinnerungJahr: zielJahr } });
    }
  }

  // Lerntipp-Push: einmalig pro Klassenarbeit/HÜ-Kontrolle, sobald sie höchstens 2 Tage
  // entfernt ist — dieselbe Empfehlung, die im Dashboard steht, geht dann zusätzlich als
  // Push direkt ans betroffene Kind raus.
  const in3Tagen = new Date(heute);
  in3Tagen.setDate(in3Tagen.getDate() + 3);
  const baldigeEintraege = await prisma.schulEintrag.findMany({
    where: { datum: { gte: heute, lt: in3Tagen }, lerntippGesendet: false },
  });
  for (const s of baldigeEintraege) {
    const tageBis = Math.ceil((s.datum.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
    await sendePushAnPerson(s.personId, {
      title: "Lerntipp 💡",
      body: `${s.titel} (${tageBis <= 0 ? "heute" : tageBis === 1 ? "morgen" : `noch ${tageBis} Tage`}): ${lerntipp(tageBis)}`,
      url: "/dashboard",
    });
    await prisma.schulEintrag.update({ where: { id: s.id }, data: { lerntippGesendet: true } });
  }
}

export async function getDashboardDaten() {
  const person = await requirePerson();
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const morgenFrueh = new Date(heute);
  morgenFrueh.setDate(morgenFrueh.getDate() + 1);

  await pruefeUndSendeErinnerungen();

  const plan = await getWochenplan(0);
  const heutigesEssen = plan.tage.find((t) => new Date(t.tag).toDateString() === heute.toDateString());

  const schulEintraege = await listAnstehendeSchulEintraege();

  const terminWhere =
    person.rolle === "ELTERN"
      ? { start: { gte: heute, lt: morgenFrueh } }
      : { start: { gte: heute, lt: morgenFrueh }, OR: [{ personId: person.id }, { personId: null }] };
  const termineHeute = await prisma.termin.findMany({ where: terminWhere as any, include: { person: true }, orderBy: { start: "asc" } });

  const aufgabenWhere =
    person.rolle === "ELTERN" ? { erledigt: false } : { erledigt: false, OR: [{ personId: person.id }, { personId: null }] };
  const offeneAufgaben = await prisma.aufgabe.count({ where: aufgabenWhere as any });

  // Fix-Batch 30: Eltern sehen auf dem Dashboard alle offenen Kinder-Anfragen gesammelt
  // (Noten-Einreichungen + Einkaufs-Wünsche), um direkt von dort zu genehmigen/ablehnen.
  const offeneNoten =
    person.rolle === "ELTERN"
      ? await prisma.note.findMany({ where: { status: "OFFEN" }, include: { fach: true, kind: true }, orderBy: { datum: "desc" } })
      : [];
  const offeneWuensche =
    person.rolle === "ELTERN"
      ? await prisma.einkaufsWunsch.findMany({ where: { status: "OFFEN" }, include: { kind: true }, orderBy: { createdAt: "desc" } })
      : [];

  // Fix-Batch 49: eigene noch nicht abgeschlossene Tickets auf dem Dashboard anzeigen
  // (für alle, nicht nur Eltern) — Klick führt zum Ticket-Bereich in den Einstellungen.
  const meineOffenenTickets = await prisma.ticket.findMany({
    where: { erstelltVonId: person.id, status: { in: ["EINGEREICHT", "GENEHMIGT", "IN_UMSETZUNG"] } },
    orderBy: { createdAt: "desc" },
  });

  return {
    person: { name: person.name, rolle: person.rolle },
    heutigesEssen: heutigesEssen?.eintrag?.rezeptName ?? null,
    schulEintraege: schulEintraege.map((s) => {
      const tageBis = Math.ceil((s.datum.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: s.id,
        titel: s.titel,
        fachName: s.fachName,
        datum: s.datum.toISOString(),
        personName: s.person.name,
        tageBis,
        lerntipp: person.rolle === "KIND" ? lerntipp(tageBis) : null,
      };
    }),
    termineHeute: termineHeute.map((t) => ({ id: t.id, titel: t.titel, start: t.start.toISOString(), personName: t.person?.name ?? "Familie" })),
    offeneAufgaben,
    offeneNoten: offeneNoten.map((n) => ({
      id: n.id,
      kindName: n.kind.name,
      fachName: n.fach.name,
      art: n.art,
      note: n.note,
      datum: n.datum.toISOString(),
      notiz: n.notiz,
      fotoBase64: n.fotoBase64,
    })),
    offeneWuensche: offeneWuensche.map((w) => ({
      id: w.id,
      kindName: w.kind.name,
      artikelName: w.artikelName,
      menge: w.menge,
      createdAt: w.createdAt.toISOString(),
    })),
    meineOffenenTickets: meineOffenenTickets.map((t) => ({ id: t.id, titel: t.titel, status: t.status })),
  };
}

// ---------- Änderungshistorie (nur für Eltern sichtbar) ----------

const TYP_LABEL: Record<string, string> = {
  TERMIN: "Termin",
  AUFGABE: "Aufgabe",
  NOTE: "Note",
  TASCHENGELD: "Taschengeld",
  DIENST_TAUSCH: "Dienst/Bad-Tausch",
  EINKAUFS_WUNSCH: "Einkaufs-Wunsch",
};

export async function getAenderungshistorie(limit = 25) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN") return [];
  const eintraege = await prisma.aenderungsLog.findMany({
    orderBy: { zeitpunkt: "desc" },
    take: limit,
    include: { geaendertVon: true },
  });
  return eintraege.map((e) => ({
    id: e.id,
    zeitpunkt: e.zeitpunkt.toISOString(),
    personName: e.geaendertVon.name,
    typLabel: TYP_LABEL[e.entityTyp] ?? e.entityTyp,
    aktion: e.aktion.replace("geloescht", "gelöscht"),
    bezug: e.neuerWert ?? e.alterWert ?? null,
  }));
}
