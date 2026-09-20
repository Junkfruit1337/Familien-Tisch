"use server";

import { requirePerson } from "@/lib/auth";
import { getWochenplan } from "../essensplan/actions";
import { listAnstehendeSchulEintraege } from "../schule/actions";
import { prisma } from "@/lib/prisma";
import { sendePushAnEltern, sendePushAnPerson } from "@/lib/push";
import { parseZutatZeile, skaliereZeile } from "@/lib/zutatenSkalierung";

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
async function pruefeUndSendeErinnerungen(familieId: string | null) {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Geburtstags-Vorlauf-Erinnerung: 7 Tage vorher einmal pro Jahr an die Eltern, damit noch
  // Zeit fürs Geschenk bleibt.
  const in7Tagen = new Date(heute);
  in7Tagen.setDate(in7Tagen.getDate() + 7);
  const zielJahr = in7Tagen.getFullYear();
  const personenMitGeburtstag = await prisma.person.findMany({ where: { aktiv: true, geburtsdatum: { not: null }, familieId } });
  for (const p of personenMitGeburtstag) {
    if (!p.geburtsdatum) continue;
    const passt = p.geburtsdatum.getMonth() === in7Tagen.getMonth() && p.geburtsdatum.getDate() === in7Tagen.getDate();
    if (passt && p.geburtstagErinnerungJahr !== zielJahr) {
      await sendePushAnEltern({
        title: "Geburtstag in einer Woche 🎂",
        body: `${p.name} hat in 7 Tagen Geburtstag — noch Zeit, ein Geschenk zu besorgen.`,
        url: "/kalender",
      }, familieId);
      await prisma.person.update({ where: { id: p.id }, data: { geburtstagErinnerungJahr: zielJahr } });
    }
  }

  // Lerntipp-Push: einmalig pro Klassenarbeit/HÜ-Kontrolle, sobald sie höchstens 2 Tage
  // entfernt ist — dieselbe Empfehlung, die im Dashboard steht, geht dann zusätzlich als
  // Push direkt ans betroffene Kind raus.
  const in3Tagen = new Date(heute);
  in3Tagen.setDate(in3Tagen.getDate() + 3);
  const baldigeEintraege = await prisma.schulEintrag.findMany({
    where: { datum: { gte: heute, lt: in3Tagen }, lerntippGesendet: false, familieId },
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

  // Fix-Batch 92 (Florians Wunsch): Push-Erinnerung an die Eltern, wenn für ein MORGEN
  // geplantes Gericht (Hauptgericht oder Zusatzmahlzeit) noch keine Zutaten auf die
  // Einkaufsliste übernommen wurden — dieselbe Prüfung wie die "⚠️ Noch nicht eingekauft"-
  // Warnung (Fix-Batch 87), hier zusätzlich aktiv als Push statt nur passiv angezeigt.
  const morgen = new Date(heute);
  morgen.setDate(morgen.getDate() + 1);
  const uebermorgen = new Date(morgen);
  uebermorgen.setDate(uebermorgen.getDate() + 1);

  const morgigerEintrag = await prisma.essensplanEintrag.findFirst({
    where: { tag: { gte: morgen, lt: uebermorgen }, einkaufErinnerungGesendet: false, familieId },
    include: { rezept: true, _count: { select: { herkuenfte: true } } },
  });
  if (morgigerEintrag) {
    if (morgigerEintrag._count.herkuenfte === 0) {
      await sendePushAnEltern({
        title: "Einkaufs-Erinnerung 🛒",
        body: `Für morgen ist "${morgigerEintrag.rezept.name}" geplant, aber die Zutaten sind noch nicht auf der Einkaufsliste.`,
        url: "/essensplan",
      }, familieId);
    }
    await prisma.essensplanEintrag.update({ where: { id: morgigerEintrag.id }, data: { einkaufErinnerungGesendet: true } });
  }

  const morgigeExtras = await prisma.extraMahlzeit.findMany({
    where: { tag: { gte: morgen, lt: uebermorgen }, einkaufErinnerungGesendet: false, familieId },
    include: { rezept: true, _count: { select: { herkuenfte: true } } },
  });
  for (const extra of morgigeExtras) {
    if (extra._count.herkuenfte === 0) {
      await sendePushAnEltern({
        title: "Einkaufs-Erinnerung 🛒",
        body: `Für morgen ist "${extra.bezeichnung}: ${extra.rezept.name}" geplant, aber die Zutaten sind noch nicht auf der Einkaufsliste.`,
        url: "/essensplan",
      }, familieId);
    }
    await prisma.extraMahlzeit.update({ where: { id: extra.id }, data: { einkaufErinnerungGesendet: true } });
  }

  // Fix-Batch 92 (Florians Wunsch): Push 7 Tage vor Ferienbeginn, analog zur bereits
  // bestehenden Geburtstags-Erinnerung — der Countdown stand bisher nur auf der Schule-Seite,
  // ohne aktive Benachrichtigung.
  const FERIEN_LABEL: Record<string, string> = {
    HERBST: "Herbstferien",
    WEIHNACHTEN: "Weihnachtsferien",
    WINTER: "Winterferien",
    OSTERN: "Osterferien",
    PFINGSTEN: "Pfingstferien",
    SOMMER: "Sommerferien",
  };
  const in8Tagen = new Date(in7Tagen);
  in8Tagen.setDate(in8Tagen.getDate() + 1);
  // Schulferien sind bewusst öffentliche, familienübergreifend geteilte Referenzdaten (siehe
  // Schema-Kommentar) — "erinnerungGesendet" liegt deshalb ebenfalls global auf dieser Zeile,
  // nicht pro Familie. Bei mehreren Familien im selben Bundesland bekäme dadurch nur die
  // Familie, deren Dashboard zuerst geladen wird, die Push-Erinnerung; für alle anderen ist sie
  // danach schon als "gesendet" markiert. Bewusst als bekannte, geringe Einschränkung in Kauf
  // genommen (betrifft nur diesen einen Push, der Ferien-Countdown selbst bleibt für jede
  // Familie normal sichtbar) statt jetzt extra eine pro-Familie-Sendeverfolgung einzuführen.
  const baldigeFerien = await prisma.schulferien.findMany({
    where: { start: { gte: in7Tagen, lt: in8Tagen }, erinnerungGesendet: false },
  });
  for (const ferien of baldigeFerien) {
    const betroffeneKinder = await prisma.person.findMany({ where: { aktiv: true, bundesland: ferien.bundesland, familieId } });
    if (betroffeneKinder.length > 0) {
      await sendePushAnEltern({
        title: "Ferien in einer Woche 🏖️",
        body: `${FERIEN_LABEL[ferien.typ] ?? ferien.typ} beginnen in 7 Tagen (${betroffeneKinder.map((k) => k.name).join(", ")}).`,
        url: "/schule",
      }, familieId);
    }
    await prisma.schulferien.update({ where: { id: ferien.id }, data: { erinnerungGesendet: true } });
  }
}

export async function getDashboardDaten() {
  const person = await requirePerson();
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const morgenFrueh = new Date(heute);
  morgenFrueh.setDate(morgenFrueh.getDate() + 1);

  await pruefeUndSendeErinnerungen(person.familieId);

  const plan = await getWochenplan(0);
  const heutigesEssen = plan.tage.find((t) => new Date(t.tag).toDateString() === heute.toDateString());

  // Fix-Batch 84 (Florians Wunsch): "Heute gibt's" zeigt jetzt alle heutigen Gerichte
  // (Hauptgericht + Zusatzmahlzeiten wie Frühstück/Snack) und liefert direkt die
  // Zutatenliste in der tatsächlich geplanten (skalierten) Menge mit, damit man sie ohne
  // Umweg über den Essensplan öffnen kann.
  const heutigeGerichte: {
    bezeichnung: string;
    rezeptName: string;
    zutaten: string[];
    zubereitung: string | null;
    zutatenUebernommen: boolean;
  }[] = [];

  if (heutigesEssen?.eintrag) {
    const rezept = await prisma.rezept.findUnique({ where: { id: heutigesEssen.eintrag.rezeptId } });
    if (rezept) {
      const zutaten = rezept.zutaten
        .split("\n")
        .map((z) => z.trim())
        .filter(Boolean)
        .map((z) => skaliereZeile(parseZutatZeile(z), heutigesEssen.eintrag!.esserFaktor || 1))
        .map((z) => (z.menge ? `${z.menge} ${z.name}` : z.name));
      heutigeGerichte.push({
        bezeichnung: "Hauptgericht",
        rezeptName: rezept.name,
        zutaten,
        zubereitung: rezept.zubereitung,
        zutatenUebernommen: heutigesEssen.eintrag.zutatenUebernommen,
      });
    }
  }

  const extraHeute = await prisma.extraMahlzeit.findMany({
    where: { wocheStart: new Date(plan.wocheStart), familieId: person.familieId },
    include: { rezept: true, _count: { select: { herkuenfte: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const e of extraHeute) {
    if (e.tag.toDateString() !== heute.toDateString()) continue;
    const zutaten = e.rezept.zutaten
      .split("\n")
      .map((z) => z.trim())
      .filter(Boolean)
      .map((z) => skaliereZeile(parseZutatZeile(z), e.faktor || 1))
      .map((z) => (z.menge ? `${z.menge} ${z.name}` : z.name));
    heutigeGerichte.push({
      bezeichnung: e.bezeichnung,
      rezeptName: e.rezept.name,
      zutaten,
      zubereitung: e.rezept.zubereitung,
      zutatenUebernommen: e._count.herkuenfte > 0,
    });
  }

  const schulEintraege = await listAnstehendeSchulEintraege();

  const terminWhere =
    person.rolle === "ELTERN"
      ? { familieId: person.familieId, start: { gte: heute, lt: morgenFrueh } }
      : { familieId: person.familieId, start: { gte: heute, lt: morgenFrueh }, OR: [{ personId: person.id }, { personId: null }] };
  const termineHeute = await prisma.termin.findMany({ where: terminWhere as any, include: { person: true }, orderBy: { start: "asc" } });

  const aufgabenWhere =
    person.rolle === "ELTERN"
      ? { familieId: person.familieId, erledigt: false }
      : { familieId: person.familieId, erledigt: false, OR: [{ personId: person.id }, { personId: null }] };
  const offeneAufgaben = await prisma.aufgabe.count({ where: aufgabenWhere as any });

  // Fix-Batch 30: Eltern sehen auf dem Dashboard alle offenen Kinder-Anfragen gesammelt
  // (Noten-Einreichungen + Einkaufs-Wünsche), um direkt von dort zu genehmigen/ablehnen.
  const offeneNoten =
    person.rolle === "ELTERN"
      ? await prisma.note.findMany({ where: { status: "OFFEN", familieId: person.familieId }, include: { fach: true, kind: true }, orderBy: { datum: "desc" } })
      : [];
  const offeneWuensche =
    person.rolle === "ELTERN"
      ? await prisma.einkaufsWunsch.findMany({ where: { status: "OFFEN", familieId: person.familieId }, include: { kind: true }, orderBy: { createdAt: "desc" } })
      : [];

  // Fix-Batch 49: eigene noch nicht abgeschlossene Tickets auf dem Dashboard anzeigen
  // (für alle, nicht nur Eltern) — Klick führt zum Ticket-Bereich in den Einstellungen.
  const meineOffenenTickets = await prisma.ticket.findMany({
    where: { erstelltVonId: person.id, familieId: person.familieId, status: { in: ["EINGEREICHT", "GENEHMIGT", "IN_UMSETZUNG"] } },
    orderBy: { createdAt: "desc" },
  });

  return {
    person: { name: person.name, rolle: person.rolle },
    heutigeGerichte,
    schulEintraege: schulEintraege.map((s) => {
      const tageBis = Math.ceil((s.datum.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: s.id,
        titel: s.titel,
        fachName: s.fachName,
        datum: s.datum.toISOString(),
        personName: s.person.name,
        personFarbe: s.person.farbe,
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
      tendenz: n.tendenz,
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
    where: { geaendertVon: { familieId: person.familieId } },
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
