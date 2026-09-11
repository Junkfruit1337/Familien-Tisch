"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { sendePushAnEltern, sendePushAnPerson } from "@/lib/push";
import { erkenneNoteAusSprache, type ErkannteNote, erkenneSchulEintragAusSprache, type ErkannterSchulEintrag, pruefeFachDuplikatKI } from "@/lib/spracheErkennung";

function betragFuerNote(note: number): number {
  if (note === 1) return 10;
  if (note === 2) return 5;
  return 0;
}

export async function listKinder() {
  return prisma.person.findMany({ where: { rolle: "KIND" }, orderBy: { reihenfolge: "asc" } });
}

// Aktuelles Schuljahr nach der bundesweit einheitlichen Konvention (1. August – 31. Juli,
// Fix-Batch 27 — Recherche bestätigt: gilt gleich für alle 16 Bundesländer). Bewusst nicht
// exportiert: jeder Export aus einer "use server"-Datei muss async sein, sobald er (auch
// nur transitiv) von einer Client-Komponente importiert wird — als reine interne
// Hilfsfunktion bleibt sie synchron und einfach.
function aktuellesSchuljahr(datum: Date = new Date()): string {
  const jahr = datum.getMonth() >= 7 ? datum.getFullYear() : datum.getFullYear() - 1;
  return `${jahr}/${jahr + 1}`;
}

// Bundesland/Klassenstufe/Klasse (Fix-Batch 27) — vom Kind selbst oder von Eltern editierbar.
export async function setSchulProfil(kindId: string, data: { bundesland?: string; klassenstufe?: number; klasse?: string }) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN" && person.id !== kindId) throw new Error("Nicht erlaubt.");
  await prisma.person.update({
    where: { id: kindId },
    data: {
      bundesland: data.bundesland !== undefined ? data.bundesland || null : undefined,
      klassenstufe: data.klassenstufe !== undefined ? data.klassenstufe : undefined,
      klasse: data.klasse !== undefined ? data.klasse || null : undefined,
    },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/schule");
}

// Ferien-Countdown fürs Schule-Tab (Fix-Batch 27) — null, wenn das Kind noch kein
// Bundesland gewählt hat.
export async function listFerienFuerKind(kindId: string) {
  const kind = await prisma.person.findUnique({ where: { id: kindId } });
  if (!kind?.bundesland) return null;
  const schuljahr = aktuellesSchuljahr();
  const eintraege = await prisma.schulferien.findMany({
    where: { bundesland: kind.bundesland, schuljahr },
    orderBy: { start: "asc" },
  });
  const heute = new Date();
  const ferien = eintraege.map((f) => ({
    typ: f.typ,
    start: f.start.toISOString(),
    ende: f.ende.toISOString(),
    tageBis: Math.ceil((f.start.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)),
  }));
  const naechste = ferien.find((f) => f.tageBis >= 0) ?? null;
  return { bundesland: kind.bundesland, schuljahr, ferien, naechste };
}

// Spracheingabe fürs Noten-Formular (Fix-Batch 26) — füllt nur die Formularfelder vor,
// Prüfung/Korrektur/Speichern bleibt beim Nutzer. Fehler als Ergebnis-Objekt statt Wurf
// (analog Rezept-Foto/Termine/Aufgaben, siehe Fix-Batch 19).
export async function erkenneNoteAusText(
  text: string,
  kindId: string
): Promise<{ ok: true; note: ErkannteNote } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const faecher = await prisma.fach.findMany({ where: { kindId }, select: { id: true, name: true } });
    const note = await erkenneNoteAusSprache(text, faecher);
    return { ok: true, note };
  } catch (err) {
    console.error("Spracheingabe (Note) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

export async function listFaecher(kindId: string) {
  return prisma.fach.findMany({ where: { kindId }, orderBy: { name: "asc" } });
}

export async function addFach(kindId: string, name: string) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN" && person.id !== kindId) throw new Error("Nicht erlaubt.");
  const bestehende = await prisma.fach.findMany({ where: { kindId } });
  if (bestehende.some((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error(`„${name}" ist für dieses Kind schon angelegt.`);
  }
  await prisma.fach.create({ data: { kindId, name: name.trim() } });
  revalidatePath("/schule");
  revalidatePath("/einstellungen");
}

// KI-gestützter Duplikat-Check vor dem eigentlichen Anlegen (Fix-Batch 30) — erkennt auch
// Schreibvarianten/Abkürzungen/Synonyme, die der reine (exakte) Textvergleich in addFach
// nicht abdeckt. Gibt bei einem KI-Fehler bewusst "kein Duplikat" zurück, damit das Anlegen
// eines Fachs nie an einem Spracherkennungs-Ausfall scheitert.
export async function pruefeFachDuplikat(kindId: string, name: string) {
  await requirePerson();
  const bestehende = await prisma.fach.findMany({ where: { kindId } });
  const exakt = bestehende.find((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (exakt) return { istVermutlichDuplikat: true, aehnlichesFach: exakt.name };
  if (bestehende.length === 0) return { istVermutlichDuplikat: false, aehnlichesFach: null };
  try {
    return await pruefeFachDuplikatKI(name, bestehende.map((f) => f.name));
  } catch {
    return { istVermutlichDuplikat: false, aehnlichesFach: null };
  }
}

// Fix-Batch 30: Fächer sind jetzt auch umbenennbar (vorher nur anlegen/löschen möglich).
export async function updateFach(id: string, name: string) {
  const person = await requirePerson();
  const fach = await prisma.fach.findUnique({ where: { id } });
  if (!fach) throw new Error("Fach nicht gefunden.");
  if (person.rolle !== "ELTERN" && person.id !== fach.kindId) throw new Error("Nicht erlaubt.");
  const bestehende = await prisma.fach.findMany({ where: { kindId: fach.kindId, id: { not: id } } });
  if (bestehende.some((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error(`„${name}" ist für dieses Kind schon angelegt.`);
  }
  await prisma.fach.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/schule");
  revalidatePath("/einstellungen");
}

export async function deleteFach(id: string) {
  await requireParent();
  try {
    await prisma.fach.delete({ where: { id } });
  } catch {
    throw new Error("Fach kann nicht gelöscht werden, solange noch Noten dafür eingetragen sind.");
  }
  revalidatePath("/schule");
  revalidatePath("/einstellungen");
}

export async function listNoten(kindId?: string) {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? (kindId ? { kindId } : {}) : { kindId: person.id };
  return prisma.note.findMany({ where, include: { fach: true, kind: true }, orderBy: { datum: "desc" } });
}

export async function pruefeNotenDuplikat(params: { fachId: string; art: string; datum: string; ausschlussId?: string }) {
  await requirePerson();
  const start = new Date(params.datum);
  start.setHours(0, 0, 0, 0);
  const ende = new Date(start);
  ende.setDate(ende.getDate() + 1);
  const treffer = await prisma.note.findFirst({
    where: {
      fachId: params.fachId,
      art: params.art as any,
      datum: { gte: start, lt: ende },
      ...(params.ausschlussId ? { id: { not: params.ausschlussId } } : {}),
    },
  });
  return !!treffer;
}

// notiz enthält seit Fix-Batch 30 das PFLICHT-"Thema" (vorher optionale Notiz, wurde aber
// tatsächlich fürs Thema der Arbeit genutzt — Florian wollte das verbindlich machen, damit
// auch im Nachhinein nachvollziehbar bleibt, worum es ging). Kein Schema-Feld umbenannt,
// nur hier verbindlich gemacht und im Formular als "Thema" beschriftet.
export async function einreichenNote(data: {
  fachId: string;
  art: string;
  note: number;
  datum: string;
  notiz?: string;
  fotoBase64?: string;
}) {
  const person = await requirePerson();
  if (!data.notiz?.trim()) throw new Error("Bitte das Thema der Arbeit/Kontrolle angeben.");
  const istEltern = person.rolle === "ELTERN";
  const fach = await prisma.fach.findUnique({ where: { id: data.fachId } });
  if (!fach) throw new Error("Fach nicht gefunden.");
  const kindId = istEltern ? fach.kindId : person.id;
  if (!istEltern && fach.kindId !== person.id) throw new Error("Das ist nicht dein Fach.");

  const gewSetting = await prisma.notenGewichtung.findUnique({
    where: { kindId_fachId_art: { kindId, fachId: data.fachId, art: data.art as any } },
  });

  const status = istEltern ? "GENEHMIGT" : "OFFEN";
  const note = await prisma.note.create({
    data: {
      kindId,
      fachId: data.fachId,
      art: data.art as any,
      note: data.note,
      datum: new Date(data.datum),
      notiz: data.notiz,
      fotoBase64: data.fotoBase64,
      gewichtung: gewSetting?.gewichtung ?? 1,
      status: status as any,
      eingetragenVonId: person.id,
    },
  });

  await logAenderung({ entityTyp: "NOTE", entityId: note.id, aktion: "eingereicht", neuerWert: String(note.note), geaendertVonId: person.id });

  if (istEltern) {
    const betrag = betragFuerNote(note.note);
    if (betrag > 0) {
      await prisma.taschengeldTransaktion.create({
        data: { kindId, betrag, typ: "GUTSCHRIFT", grund: `Note ${note.note}`, noteId: note.id, erstelltVonId: person.id },
      });
      await logAenderung({ entityTyp: "TASCHENGELD", entityId: note.id, aktion: "gutschrift", neuerWert: `${betrag} €`, geaendertVonId: person.id });
    }
  }

  if (!istEltern) {
    const kind = await prisma.person.findUnique({ where: { id: kindId } });
    await sendePushAnEltern({
      title: "Neue Note wartet auf Freigabe",
      body: `${kind?.name ?? "Ein Kind"} — ${fach.name}: Note ${note.note}`,
      url: "/schule",
    });
  }

  revalidatePath("/schule");
  return { istKindEinreichung: !istEltern, note: note.note };
}

// Fix-Batch 30: Eltern dürfen jede offene Note korrigieren, ein Kind nur seine eigene —
// und auch nur, solange sie noch nicht genehmigt/abgelehnt wurde (Florians Wunsch).
export async function korrigiereNote(id: string, data: { note?: number; datum?: string; notiz?: string; fachId?: string }) {
  const person = await requirePerson();
  const bestehend = await prisma.note.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Note nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
  if (bestehend.status !== "OFFEN") throw new Error("Nur offene (noch nicht entschiedene) Noten können korrigiert werden.");

  const updateData: Record<string, unknown> = {};
  if (data.note !== undefined && data.note !== bestehend.note) {
    updateData.note = data.note;
    await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "korrigiert", feld: "note", alterWert: String(bestehend.note), neuerWert: String(data.note), geaendertVonId: person.id });
  }
  if (data.datum) {
    const neuesDatum = new Date(data.datum);
    if (neuesDatum.getTime() !== bestehend.datum.getTime()) {
      updateData.datum = neuesDatum;
      await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "korrigiert", feld: "datum", alterWert: bestehend.datum.toISOString(), neuerWert: neuesDatum.toISOString(), geaendertVonId: person.id });
    }
  }
  if (data.notiz !== undefined && data.notiz !== bestehend.notiz) {
    updateData.notiz = data.notiz;
    await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "korrigiert", feld: "notiz", alterWert: bestehend.notiz, neuerWert: data.notiz, geaendertVonId: person.id });
  }
  if (data.fachId && data.fachId !== bestehend.fachId) {
    updateData.fachId = data.fachId;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.note.update({ where: { id }, data: updateData as any });
  }
  revalidatePath("/schule");
}

export async function erneutEinreichen(id: string, data?: { note?: number; datum?: string; notiz?: string; fotoBase64?: string }) {
  const person = await requirePerson();
  const bestehend = await prisma.note.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Note nicht gefunden.");
  if (bestehend.kindId !== person.id) throw new Error("Das ist nicht deine Note.");
  if (bestehend.status !== "ABGELEHNT") throw new Error("Nur abgelehnte Noten können erneut eingereicht werden.");

  await prisma.note.update({
    where: { id },
    data: {
      note: data?.note ?? bestehend.note,
      datum: data?.datum ? new Date(data.datum) : bestehend.datum,
      notiz: data?.notiz ?? bestehend.notiz,
      fotoBase64: data?.fotoBase64 ?? bestehend.fotoBase64,
      status: "OFFEN",
    },
  });
  await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "erneut eingereicht", geaendertVonId: person.id });
  revalidatePath("/schule");
}

export async function entscheideNote(id: string, genehmigt: boolean) {
  const person = await requireParent();
  const note = await prisma.note.update({
    where: { id },
    data: { status: genehmigt ? "GENEHMIGT" : "ABGELEHNT" },
    include: { fach: true },
  });

  await logAenderung({
    entityTyp: "NOTE",
    entityId: id,
    aktion: genehmigt ? "genehmigt" : "abgelehnt",
    geaendertVonId: person.id,
  });

  if (genehmigt) {
    const betrag = betragFuerNote(note.note);
    if (betrag > 0) {
      await prisma.taschengeldTransaktion.create({
        data: { kindId: note.kindId, betrag, typ: "GUTSCHRIFT", grund: `Note ${note.note}`, noteId: note.id, erstelltVonId: person.id },
      });
    }
  }

  await sendePushAnPerson(note.kindId, {
    title: genehmigt ? "Note genehmigt 🎉" : "Note abgelehnt",
    body: `${note.fach.name}: Note ${note.note}`,
    url: "/schule",
  });

  revalidatePath("/schule");
}

// Fix-Batch 30: ein Kind darf seine eigene Note selbst löschen, solange sie noch OFFEN ist
// (noch nicht genehmigt/abgelehnt) — Eltern dürfen wie bisher jede Note jederzeit löschen.
export async function loescheNote(id: string) {
  const person = await requirePerson();
  const bestehend = await prisma.note.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Note nicht gefunden.");
  if (person.rolle !== "ELTERN") {
    if (bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
    if (bestehend.status !== "OFFEN") throw new Error("Nur eine noch nicht entschiedene Note kannst du selbst löschen.");
  }
  await prisma.taschengeldTransaktion.deleteMany({ where: { noteId: id } });
  await prisma.note.delete({ where: { id } });
  await logAenderung({ entityTyp: "NOTE", entityId: id, aktion: "geloescht", geaendertVonId: person.id });
  revalidatePath("/schule");
}

export async function kontostand(kindId: string) {
  const transaktionen = await prisma.taschengeldTransaktion.findMany({ where: { kindId } });
  return transaktionen.reduce((sum, t) => sum + (t.typ === "GUTSCHRIFT" ? t.betrag : -t.betrag), 0);
}

export async function listTaschengeld(kindId: string) {
  return prisma.taschengeldTransaktion.findMany({ where: { kindId }, orderBy: { createdAt: "desc" } });
}

export async function auszahlen(kindId: string, betrag: number, grund?: string) {
  const person = await requireParent();
  const stand = await kontostand(kindId);
  if (betrag > stand) {
    throw new Error(`Auszahlung (${betrag} €) übersteigt den Kontostand (${stand} €).`);
  }
  const t = await prisma.taschengeldTransaktion.create({
    data: { kindId, betrag, typ: "AUSZAHLUNG", grund, erstelltVonId: person.id },
  });
  await logAenderung({ entityTyp: "TASCHENGELD", entityId: t.id, aktion: "auszahlung", neuerWert: `${betrag} €`, geaendertVonId: person.id });
  revalidatePath("/schule");
}

// Manuelles Gutschreiben durch Eltern (Fix-Batch 23) — z.B. Extra-Taschengeld ohne
// Notenbezug. Notiz ist Pflicht, damit in der Historie immer nachvollziehbar bleibt, wofür.
export async function manuelleGutschrift(kindId: string, betrag: number, grund: string) {
  const person = await requireParent();
  if (!(betrag > 0)) throw new Error("Bitte einen Betrag größer als 0 eingeben.");
  if (!grund.trim()) throw new Error("Bitte eine Notiz angeben, wofür das Geld ist.");
  const t = await prisma.taschengeldTransaktion.create({
    data: { kindId, betrag, typ: "GUTSCHRIFT", grund: grund.trim(), erstelltVonId: person.id },
  });
  await logAenderung({
    entityTyp: "TASCHENGELD",
    entityId: t.id,
    aktion: "manuelle Gutschrift",
    neuerWert: `${betrag} € — ${grund.trim()}`,
    geaendertVonId: person.id,
  });
  revalidatePath("/schule");
}

export async function setSparziel(kindId: string, bezeichnung: string, zielbetrag: number) {
  const person = await requirePerson();
  if (person.rolle !== "ELTERN" && person.id !== kindId) throw new Error("Nicht erlaubt.");
  await prisma.sparziel.upsert({
    where: { kindId },
    update: { bezeichnung, zielbetrag },
    create: { kindId, bezeichnung, zielbetrag },
  });
  revalidatePath("/schule");
}

export async function getSparziel(kindId: string) {
  return prisma.sparziel.findUnique({ where: { kindId } });
}

// ---------- Notengewichtung (Frage 21) ----------

const NOTE_ARTEN = ["KLASSENARBEIT", "HAUSAUFGABEN_KONTROLLE", "EPOCHALNOTE"] as const;

export async function listNotenGewichtung(kindId: string) {
  await requireParent();
  const faecher = await prisma.fach.findMany({ where: { kindId }, orderBy: { name: "asc" } });
  const gewichtungen = await prisma.notenGewichtung.findMany({ where: { kindId } });
  const map = new Map(gewichtungen.map((g) => [`${g.fachId}_${g.art}`, g.gewichtung]));
  return faecher.map((f) => ({
    fachId: f.id,
    fachName: f.name,
    gewichtungen: NOTE_ARTEN.map((art) => ({ art, gewichtung: map.get(`${f.id}_${art}`) ?? 1 })),
  }));
}

export async function setNotenGewichtung(kindId: string, fachId: string, art: string, gewichtung: number) {
  await requireParent();
  await prisma.notenGewichtung.upsert({
    where: { kindId_fachId_art: { kindId, fachId, art: art as any } },
    update: { gewichtung },
    create: { kindId, fachId, art: art as any, gewichtung },
  });
  revalidatePath("/einstellungen");
}

export async function uebertrageGewichtungAufFaecher(kindId: string, art: string, gewichtung: number, zielFachIds: string[]) {
  await requireParent();
  await Promise.all(
    zielFachIds.map((fachId) =>
      prisma.notenGewichtung.upsert({
        where: { kindId_fachId_art: { kindId, fachId, art: art as any } },
        update: { gewichtung },
        create: { kindId, fachId, art: art as any, gewichtung },
      })
    )
  );
  revalidatePath("/einstellungen");
}

export async function uebertrageGewichtungAufKinder(fachName: string, art: string, gewichtung: number, zielKindIds: string[]) {
  await requireParent();
  const faecher = await prisma.fach.findMany({ where: { kindId: { in: zielKindIds }, name: fachName } });
  await Promise.all(
    faecher.map((f) =>
      prisma.notenGewichtung.upsert({
        where: { kindId_fachId_art: { kindId: f.kindId, fachId: f.id, art: art as any } },
        update: { gewichtung },
        create: { kindId: f.kindId, fachId: f.id, art: art as any, gewichtung },
      })
    )
  );
  revalidatePath("/einstellungen");
}

// ---------- Klassenarbeiten & Hausaufgaben-Kontrollen (SchulEintrag) ----------

export async function listAnstehendeSchulEintraege() {
  const person = await requirePerson();
  const where =
    person.rolle === "ELTERN" ? { datum: { gte: new Date() } } : { personId: person.id, datum: { gte: new Date() } };
  return prisma.schulEintrag.findMany({ where, include: { person: true, fach: true }, orderBy: { datum: "asc" }, take: 5 });
}

export async function listSchulEintraege(kindId?: string) {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? (kindId ? { personId: kindId } : {}) : { personId: person.id };
  return prisma.schulEintrag.findMany({ where, include: { person: true, fach: true }, orderBy: { datum: "asc" } });
}

// Spracheingabe fürs Klassenarbeiten/HÜ-Kontrollen-Formular (Fix-Batch 30). fachOptionen wird
// vom Client mitgegeben (die aktuell relevanten Fächer, je nachdem welche(s) Kind(er) gerade
// ausgewählt sind) statt hier anhand einer kindId neu geladen zu werden.
export async function erkenneSchulEintragAusText(
  text: string,
  fachOptionen: { id: string; name: string }[]
): Promise<{ ok: true; eintrag: ErkannterSchulEintrag } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const personen = await prisma.person.findMany({ where: { rolle: "KIND", aktiv: true }, select: { id: true, name: true } });
    const eintrag = await erkenneSchulEintragAusSprache(text, fachOptionen, personen);
    return { ok: true, eintrag };
  } catch (err) {
    console.error("Spracheingabe (Schul-Eintrag) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// titel enthält seit Fix-Batch 30 das "Thema" (siehe Kommentar bei einreichenNote) statt
// eines generischen, wenig aussagekräftigen "Titels". fachName wird weiterhin als NAME
// entgegengenommen (nicht als ID) und pro Zielperson gegen deren eigene Fächerliste
// aufgelöst — nötig, weil beim Anlegen für mehrere Kinder gleichzeitig jedes Kind sein
// eigenes Fach mit eigener ID hat.
export async function createSchulEintrag(data: { thema: string; fachName?: string; art: string; datum: string; personIds?: string[] }) {
  const person = await requirePerson();
  const istEltern = person.rolle === "ELTERN";
  const zielIds = istEltern ? (data.personIds && data.personIds.length > 0 ? data.personIds : [person.id]) : [person.id];

  const rows = await Promise.all(
    zielIds.map(async (personId) => {
      let fachId: string | null = null;
      if (data.fachName) {
        const fach = await prisma.fach.findFirst({ where: { kindId: personId, name: { equals: data.fachName, mode: "insensitive" } } });
        fachId = fach?.id ?? null;
      }
      return {
        titel: data.thema,
        fachName: data.fachName || undefined,
        fachId,
        art: data.art as any,
        datum: new Date(data.datum),
        personId,
      };
    })
  );

  await prisma.schulEintrag.createMany({ data: rows });
  revalidatePath("/schule");
  revalidatePath("/dashboard");
  revalidatePath("/kalender");
}

export async function updateSchulEintrag(id: string, data: { thema?: string; fachName?: string; art?: string; datum?: string }) {
  const person = await requirePerson();
  const bestehend = await prisma.schulEintrag.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Eintrag nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.personId !== person.id) throw new Error("Nicht erlaubt.");
  let fachId: string | null | undefined = undefined;
  if (data.fachName !== undefined) {
    const fach = data.fachName ? await prisma.fach.findFirst({ where: { kindId: bestehend.personId, name: { equals: data.fachName, mode: "insensitive" } } }) : null;
    fachId = fach?.id ?? null;
  }
  await prisma.schulEintrag.update({
    where: { id },
    data: {
      titel: data.thema,
      fachName: data.fachName,
      fachId,
      art: data.art ? (data.art as any) : undefined,
      datum: data.datum ? new Date(data.datum) : undefined,
    },
  });
  revalidatePath("/schule");
  revalidatePath("/dashboard");
  revalidatePath("/kalender");
}

export async function deleteSchulEintrag(id: string) {
  const person = await requirePerson();
  const bestehend = await prisma.schulEintrag.findUnique({ where: { id } });
  if (!bestehend) return;
  if (person.rolle !== "ELTERN" && bestehend.personId !== person.id) throw new Error("Nicht erlaubt.");
  await prisma.schulEintrag.delete({ where: { id } });
  revalidatePath("/schule");
  revalidatePath("/dashboard");
}
