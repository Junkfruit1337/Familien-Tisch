"use server";

import { prisma } from "@/lib/prisma";
import { requirePerson, requireParent, requireAdmin } from "@/lib/auth";
import { logAenderung } from "@/lib/history";
import { erkenneKategorie } from "@/lib/kategorisierung";
import { formatiereArtikelName } from "@/lib/artikelName";
import { erkenneArtikelAusSprache, type ErkannterArtikel } from "@/lib/spracheErkennung";
import { erkenneEinkaufslisteAusBild, type ErkannterListenArtikel } from "@/lib/einkaufslisteErkennung";
import { sendePushAnEltern } from "@/lib/push";
import { revalidatePath } from "next/cache";

// Spracheingabe fürs Artikel-/Wunsch-Formular (Fix-Batch 30) — für Eltern (Artikel direkt
// hinzufügen) und Kinder (Wunsch einreichen) gleichermaßen nutzbar.
export async function erkenneArtikelAusText(text: string): Promise<{ ok: true; artikel: ErkannterArtikel } | { ok: false; fehler: string }> {
  await requirePerson();
  try {
    const artikel = await erkenneArtikelAusSprache(text);
    return { ok: true, artikel };
  } catch (err) {
    console.error("Spracheingabe (Artikel) fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Spracherkennung.";
    return { ok: false, fehler };
  }
}

// Massenimport per Foto/Screenshot (Fix-Batch 35 Nachtrag) — füllt nur eine Vorschauliste,
// gespeichert wird erst nach Prüfung/Auswahl durch die Eltern (analog Rezept-Fotoerkennung).
export async function erkenneEinkaufslisteAusFoto(
  fotoDataUrl: string
): Promise<{ ok: true; artikel: ErkannterListenArtikel[] } | { ok: false; fehler: string }> {
  await requireParent();
  try {
    const artikel = await erkenneEinkaufslisteAusBild(fotoDataUrl);
    return { ok: true, artikel };
  } catch (err) {
    console.error("Einkaufslisten-Foto-Erkennung fehlgeschlagen:", err);
    const fehler = err instanceof Error ? err.message : "Unbekannter Fehler bei der Bilderkennung.";
    return { ok: false, fehler };
  }
}

// Ermittelt automatisch eine Kategorie-ID anhand des Artikelnamens. Fix-Batch 71 (Florians
// Wunsch, dass die KI "ständig dazulernt" — analog zur Icon-Lerndatenbank aus Fix-Batch 63):
// zuerst wird geprüft, ob für diesen Artikelnamen schon einmal eine Kategorie manuell
// bestätigt/korrigiert wurde (GelernteArtikelKategorie) — das hat Vorrang vor der reinen
// Stichwort-Erkennung, egal ob der Artikel gerade manuell, per Sprache, Foto oder aus einem
// Rezept angelegt wird. Erst wenn nichts gelernt ist, greift die Stichwort-Erkennung.
export async function autoKategorieId(name: string): Promise<string | null> {
  const normalisiert = name.trim().toLowerCase();
  const gelernt = normalisiert ? await prisma.gelernteArtikelKategorie.findUnique({ where: { name: normalisiert } }) : null;
  if (gelernt) {
    const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: gelernt.kategorieName } });
    if (kategorie) return kategorie.id;
  }
  const erkannt = erkenneKategorie(name);
  if (!erkannt) return null;
  const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { name: erkannt } });
  return kategorie?.id ?? null;
}

// Fix (Ticket "Unterschiedliche Milchsorten werden zusammengezählt", Florians Klarstellung:
// "ich hatte bei beiden Sachen Milch geschrieben, aber bei der laktosefreien in die Notizen
// dazu (Laktosefrei)... ist ja ein anderes Produkt... genauso bei Paprika (rot)/(grün)"):
// die Notiz ist der einzige Ort, an dem zwei gleichnamige, aber tatsächlich verschiedene
// Produkte unterschieden werden (siehe Kommentar am Modell EinkaufsArtikel.notiz, "Körnerbrot"
// bei "Brot" — genau dieses Muster). Der Namensabgleich allein reichte deshalb nicht: "Milch"
// ohne Notiz und "Milch" mit Notiz "Laktosefrei" müssen als GETRENNTE Artikel behandelt werden,
// nicht als derselbe mit zusammengezählter Menge. Notiz wird dafür wie der Name normalisiert
// (getrimmt, klein geschrieben) verglichen — kein Eintrag und ein leerer String gelten als
// gleich, aber jede tatsächlich unterschiedliche Notiz schließt ein Zusammenführen aus.
function normalisiereNotiz(notiz: string | null | undefined): string {
  return (notiz ?? "").trim().toLowerCase();
}

// Findet einen bereits offenen (nicht erledigten), BESTÄTIGTEN Artikel mit gleichem Namen UND
// gleicher (oder ebenfalls leerer) Notiz, damit gleiche Artikel nicht als doppelte Zeilen auf
// der Liste landen — aber unterschiedlich benotierte Varianten (z. B. "Milch"/"Milch,
// Laktosefrei" oder "Paprika"/"Paprika, rot") getrennt bleiben. Bewusst nur unter bereits
// bestätigten Artikeln gesucht (Fix-Batch 24) — ein manuell hinzugefügter Artikel darf nicht
// versehentlich in einen noch unbestätigten Essensplan-Posten hineingemischt werden und
// dadurch selbst als "noch nicht zugesagt" erscheinen.
export async function findeOffenenArtikel(name: string, notiz?: string | null) {
  const kandidaten = await prisma.einkaufsArtikel.findMany({
    where: { erledigt: false, bestaetigt: true, name: { equals: name.trim(), mode: "insensitive" } },
  });
  return kandidaten.find((a) => normalisiereNotiz(a.notiz) === normalisiereNotiz(notiz)) ?? null;
}

// Gegenstück für den "noch nicht zugesagt"-Pool aus dem Essensplan (Fix-Batch 24) — mehrere
// Tage, die dieselbe Zutat brauchen, sollen sich in EINEM unbestätigten Posten summieren,
// statt für jeden Tag eine eigene Zeile zu erzeugen (aber ebenfalls nur bei gleicher Notiz,
// siehe findeOffenenArtikel oben).
export async function findeOffenenUnbestaetigtenArtikel(name: string, notiz?: string | null) {
  const kandidaten = await prisma.einkaufsArtikel.findMany({
    where: { erledigt: false, bestaetigt: false, name: { equals: name.trim(), mode: "insensitive" } },
  });
  return kandidaten.find((a) => normalisiereNotiz(a.notiz) === normalisiereNotiz(notiz)) ?? null;
}

// Echte Einheiten-Umrechnung für Gewicht (g/kg) und Volumen (ml/l) — Entscheidung
// 10.09.2026: nur diese beiden Familien, keine Stück-Sonderfälle. Alles andere
// (z. B. "1 Packung") wird weiterhin nur lesbar zusammengehängt.
const GEWICHT_EINHEITEN: Record<string, number> = { g: 1, gramm: 1, kg: 1000, kilo: 1000, kilogramm: 1000 };
const VOLUMEN_EINHEITEN: Record<string, number> = { ml: 1, l: 1000, liter: 1000 };

// Fix-Batch 84 (Florians Bug-Meldung): "1 Stück" + "2 Stück" (oder "1 TL" + "1 TL" usw.)
// wurden bisher nicht zusammengezählt, weil nur Gewicht/Volumen als "echte" Einheiten
// galten — alles andere landete nur lesbar aneinandergehängt. Zwischen diesen Zähl-/
// Portions-Einheiten wird zwar (anders als bei Gewicht/Volumen) NICHT umgerechnet
// (1 TL ist keine feste Menge in EL), aber INNERHALB derselben Einheit wird jetzt addiert.
// Mehrere Schreibweisen je Einheit werden auf eine kanonische Anzeigeform normalisiert.
const ZAEHL_EINHEITEN: Record<string, string> = {
  stück: "Stück", stücke: "Stück", stk: "Stück", st: "Stück",
  zehe: "Zehe", zehen: "Zehe",
  tl: "TL", teelöffel: "TL",
  el: "EL", esslöffel: "EL",
  bund: "Bund", bunde: "Bund", bünde: "Bund",
  prise: "Prise", prisen: "Prise",
  dose: "Dose", dosen: "Dose",
  glas: "Glas", gläser: "Glas",
  packung: "Packung", packungen: "Packung",
  päckchen: "Päckchen",
  scheibe: "Scheibe", scheiben: "Scheibe",
  zweig: "Zweig", zweige: "Zweig",
  knolle: "Knolle", knollen: "Knolle",
  blatt: "Blatt", blätter: "Blatt",
  würfel: "Würfel",
  // Fix-Batch 145 (Ticket #6, Florians Bug-Meldung "Mengenangabe... intelligentere
  // Handhabung"): weitere, in Rezepten übliche Zähl-/Portions-Einheiten ergänzt, die bisher
  // fehlten und deshalb nicht zusammengezählt wurden (z. B. "1 Stange" + "2 Stangen" Lauch).
  stange: "Stange", stangen: "Stange",
  msp: "Msp.", messerspitze: "Msp.", messerspitzen: "Msp.",
  handvoll: "Handvoll",
  becher: "Becher",
  tasse: "Tasse", tassen: "Tasse",
  kugel: "Kugel", kugeln: "Kugel",
  rolle: "Rolle", rollen: "Rolle",
  riegel: "Riegel",
  portion: "Portion", portionen: "Portion",
  filet: "Filet", filets: "Filet",
};

type Mengenfamilie = { kind: "gewicht" } | { kind: "volumen" } | { kind: "zaehl"; einheit: string };

function parseMenge(text: string): { basiswert: number; familie: Mengenfamilie } | null {
  const m = text.trim().match(/^([\d]+(?:[.,]\d+)?)\s*([a-zA-Zäöüß]+)\.?$/);
  if (!m) return null;
  const zahl = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(zahl)) return null;
  const einheit = m[2].toLowerCase();
  if (einheit in GEWICHT_EINHEITEN) return { basiswert: zahl * GEWICHT_EINHEITEN[einheit], familie: { kind: "gewicht" } };
  if (einheit in VOLUMEN_EINHEITEN) return { basiswert: zahl * VOLUMEN_EINHEITEN[einheit], familie: { kind: "volumen" } };
  if (einheit in ZAEHL_EINHEITEN) return { basiswert: zahl, familie: { kind: "zaehl", einheit: ZAEHL_EINHEITEN[einheit] } };
  return null;
}

function formatZahl(n: number): string {
  return Number(n.toFixed(2)).toString().replace(".", ",");
}

function formatMenge(basiswert: number, familie: Mengenfamilie): string {
  if (familie.kind === "gewicht") {
    return basiswert >= 1000 ? `${formatZahl(basiswert / 1000)} kg` : `${formatZahl(basiswert)} g`;
  }
  if (familie.kind === "volumen") {
    return basiswert >= 1000 ? `${formatZahl(basiswert / 1000)} l` : `${formatZahl(basiswert)} ml`;
  }
  return `${formatZahl(basiswert)} ${familie.einheit}`;
}

function gleicheFamilie(a: Mengenfamilie, b: Mengenfamilie): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "zaehl" && b.kind === "zaehl") return a.einheit === b.einheit;
  return true;
}

// Führt zwei Mengenangaben zusammen. Bei erkennbar gleicher Einheiten-Familie
// (g/kg, ml/l oder derselben Zähl-Einheit wie Stück/Zehe/TL/Bund) wird echt
// zusammengerechnet; sonst bleibt es beim lesbaren Aneinanderhängen (z. B. bei
// unterschiedlichen oder unbekannten Einheiten wie "1 Packung").
// Muss "async" sein, obwohl intern nichts asynchrones passiert: Next.js verlangt,
// dass jeder Export aus einer "use server"-Datei eine async-Funktion ist — ein
// synchroner Export hier lässt "next build" fehlschlagen (Ursache des Deploy-Fehlers
// vom 10.09.2026, siehe Anforderungs-Log).
export async function mergeMenge(bestehend: string | null, neu?: string | null): Promise<string | null> {
  if (!neu) return bestehend;
  if (!bestehend) return neu;
  // Fix-Batch 35 Nachtrag (Bugticket "Artikel-Menge wird nicht addiert"): früher wurde bei
  // exakt gleicher oder als Teilstring enthaltener Mengenangabe gar nicht gemerged, sondern
  // stillschweigend die alte Menge beibehalten — dadurch erhöhte sich z.B. "500 g" + "500 g"
  // fälschlich NICHT auf "1000 g". Jetzt läuft es immer durch die echte Zusammenführung unten.

  const a = parseMenge(bestehend);
  const b = parseMenge(neu);
  if (a && b && gleicheFamilie(a.familie, b.familie)) {
    return formatMenge(a.basiswert + b.basiswert, a.familie);
  }
  return `${bestehend} + ${neu}`;
}

// Nur bestätigte Artikel — "noch nicht zugesagte" Essensplan-Posten laufen über den
// eigenen Bereich (listUnbestaetigteArtikel), bis sie geprüft/bestätigt wurden (Fix-Batch 24).
// Fix-Batch 35 Nachtrag (Bugticket "folgt nicht der Kategorieordnung"): zusätzlich nach
// createdAt sortiert, damit die Reihenfolge auch bei gleichem reihenfolge-Wert (sollte nicht
// vorkommen, aber schadet nicht als Absicherung) und für neu hinzugefügte Artikel innerhalb
// ihrer Kategorie IMMER deterministisch bleibt, statt von der (nicht garantierten) Datenbank-
// internen Reihenfolge abzuhängen.
// Fix-Batch 71 (Florians Wunsch): liefert nur noch die AKTIVEN (noch nicht erledigten)
// Artikel — die "Bereits eingekauft"-Historie kann inzwischen (seit Fix-Batch 67 hakt
// Einkaufsmodus-Antippen nur noch ab, statt zu löschen) beliebig groß werden und wird
// deshalb separat, gedeckelt und mit "mehr anzeigen" nachgeladen (siehe listErledigteArtikel).
export async function listArtikel() {
  return prisma.einkaufsArtikel.findMany({
    where: { bestaetigt: true, erledigt: false },
    include: { kategorie: true },
    orderBy: [{ kategorie: { reihenfolge: "asc" } }, { createdAt: "asc" }],
  });
}

// Fix-Batch 71: "Bereits eingekauft" gedeckelt auf `limit` (Standard 50, siehe Florians
// Wunsch), neueste zuerst — mit "mehr anzeigen" im Client höher ladbar. Nichts wird dabei
// gelöscht (siehe Fix-Batch 67), die komplette Historie bleibt für spätere Statistiken
// vollständig in der Datenbank erhalten, es wird nur nicht mehr alles auf einmal geladen.
export async function listErledigteArtikel(limit = 50) {
  const [rohArtikel, gesamtAnzahl] = await Promise.all([
    prisma.einkaufsArtikel.findMany({
      where: { bestaetigt: true, erledigt: true },
      include: { kategorie: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.einkaufsArtikel.count({ where: { bestaetigt: true, erledigt: true } }),
  ]);
  // Bereits hier auf die vom Client erwartete flache Form gebracht (kategorieName statt
  // verschachteltem kategorie-Objekt), damit sowohl page.tsx als auch der client-seitige
  // "mehr anzeigen"-Aufruf dieselbe Form bekommen.
  const items = rohArtikel.map((a) => ({
    id: a.id,
    name: a.name,
    menge: a.menge,
    notiz: a.notiz,
    iconOverride: a.iconOverride,
    erledigt: a.erledigt,
    kategorieId: a.kategorieId,
    kategorieName: a.kategorie?.name ?? "Sonstiges",
  }));
  return { items, gesamtAnzahl };
}

// "Noch nicht zugesagt" (Fix-Batch 24): Zutaten, die automatisch aus einem Rezept auf die
// Einkaufsliste übertragen wurden, aber noch geprüft/angepasst/bestätigt werden müssen.
// Fix-Batch 85 (Florians Wunsch): läuft jetzt für ALLE automatischen Rezept-Übernahmen
// gleichermaßen — Tagesgericht, Zusatzmahlzeit und Ad-hoc-Extra-Rezept —, nicht mehr nur
// fürs Tagesgericht. Zeigt zur Einordnung, aus welchem(n) Gericht(en) die Menge stammt.
export async function listUnbestaetigteArtikel() {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.findMany({
    where: { bestaetigt: false, erledigt: false },
    include: {
      essensplanHerkuenfte: { include: { eintrag: { include: { rezept: true } } } },
      extraMahlzeitHerkuenfte: { include: { extraMahlzeit: { include: { rezept: true } } } },
      quellen: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return artikel.map((a) => ({
    id: a.id,
    name: a.name,
    menge: a.menge,
    herkunft: [
      ...a.essensplanHerkuenfte.map(
        (h) => `${h.eintrag.rezept.name} (${h.eintrag.tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })})`
      ),
      ...a.extraMahlzeitHerkuenfte.map((h) => `${h.extraMahlzeit.bezeichnung}: ${h.extraMahlzeit.rezept.name}`),
      ...a.quellen.map((q) => q.beschreibung),
    ],
  }));
}

// Übernimmt einen "noch nicht zugesagten" Artikel — mergt in einen ggf. schon bestätigt
// offenen Artikel gleichen Namens, statt zwei Zeilen nebeneinander stehen zu lassen.
// data.name erlaubt, den vom Essensplan übernommenen Namen vorm Bestätigen noch zu
// korrigieren (Fix-Batch 34, Florians Wunsch) — der Merge-Check auf einen schon offenen
// gleichnamigen Artikel läuft dann gegen den ggf. korrigierten Namen.
export async function bestaetigeArtikel(id: string, data?: { menge?: string; name?: string }) {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.findUnique({ where: { id } });
  if (!artikel) return;
  const menge = data?.menge !== undefined ? data.menge || null : artikel.menge;
  const name = formatiereArtikelName(data?.name?.trim() ? data.name.trim() : artikel.name);
  const bestehender = await findeOffenenArtikel(name, artikel.notiz);
  if (bestehender) {
    await prisma.einkaufsArtikel.update({
      where: { id: bestehender.id },
      data: { menge: await mergeMenge(bestehender.menge, menge) },
    });
    // Fix-Batch 85: alle Herkunfts-/Quellen-Spuren des unbestätigten Postens müssen beim
    // Merge auf den überlebenden (bereits bestätigten) Artikel umgehängt werden — sonst
    // gehen sie beim anschließenden Löschen (onDelete: Cascade) mit verloren, und ein
    // späteres Entsperren des Tages/der Zusatzmahlzeit fände keine Spur davon mehr.
    await prisma.essensplanHerkunft.updateMany({ where: { artikelId: id }, data: { artikelId: bestehender.id } });
    await prisma.extraMahlzeitHerkunft.updateMany({ where: { artikelId: id }, data: { artikelId: bestehender.id } });
    await prisma.artikelQuelle.updateMany({ where: { artikelId: id }, data: { artikelId: bestehender.id } });
    await prisma.einkaufsArtikel.delete({ where: { id } });
  } else {
    await prisma.einkaufsArtikel.update({ where: { id }, data: { menge, name, bestaetigt: true } });
  }
  revalidatePath("/einkaufsliste");
}

// Lehnt einen "noch nicht zugesagten" Artikel ab (z. B. schon zu Hause vorrätig) — löscht
// ihn samt Essensplan-Herkunfts-Verknüpfung (Cascade) wieder.
export async function lehneArtikelAb(id: string) {
  await requireParent();
  await prisma.einkaufsArtikel.delete({ where: { id } }).catch(() => {});
  revalidatePath("/einkaufsliste");
}

// Eltern sehen alle Wünsche, ein Kind sieht ausschließlich seine eigenen —
// serverseitig gefiltert, damit nicht jeder eingeloggte Nutzer den kompletten
// Datensatz (Namen, Artikel, Status aller Kinder) im Server-Payload erhält.
export async function listWuensche() {
  const person = await requirePerson();
  const where = person.rolle === "ELTERN" ? {} : { kindId: person.id };
  return prisma.einkaufsWunsch.findMany({ where, include: { kind: true }, orderBy: { createdAt: "desc" } });
}

export async function listKategorien() {
  return prisma.einkaufsKategorie.findMany({ orderBy: { reihenfolge: "asc" } });
}

// Eltern: Artikel direkt hinzufügen
export async function addArtikel(data: { name: string; menge?: string; notiz?: string; kategorieId?: string }) {
  await requireParent();

  const name = formatiereArtikelName(data.name);
  const bestehender = await findeOffenenArtikel(name, data.notiz);
  let artikelId: string;
  let artikel;
  if (bestehender) {
    artikel = await prisma.einkaufsArtikel.update({
      where: { id: bestehender.id },
      data: { menge: await mergeMenge(bestehender.menge, data.menge), notiz: data.notiz || bestehender.notiz },
    });
    artikelId = artikel.id;
  } else {
    const kategorieId = data.kategorieId || (await autoKategorieId(name));
    artikel = await prisma.einkaufsArtikel.create({
      data: { name, menge: data.menge, notiz: data.notiz || null, kategorieId: kategorieId || null },
    });
    artikelId = artikel.id;
  }
  await prisma.artikelQuelle.create({ data: { artikelId, beschreibung: "Manuell hinzugefügt", menge: data.menge } });
  revalidatePath("/einkaufsliste");
  return artikel;
}

// Eltern: Namen/Menge/Notiz eines bestehenden Artikels nachträglich korrigieren.
// iconOverride: manuell gewähltes Icon statt der Automatik (Fix-Batch 35 Nachtrag, Ticket
// "Icon-Größe und Regeneration") — leerer String setzt zurück auf automatische Erkennung.
export async function updateArtikel(id: string, data: { name?: string; menge?: string; notiz?: string; iconOverride?: string }) {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.update({
    where: { id },
    data: {
      name: data.name !== undefined ? formatiereArtikelName(data.name) : undefined,
      menge: data.menge,
      notiz: data.notiz !== undefined ? data.notiz || null : undefined,
      iconOverride: data.iconOverride !== undefined ? data.iconOverride || null : undefined,
    },
  });
  // Fix-Batch 63 (Icon-Lerndatenbank): ein manuell gesetztes/korrigiertes Icon merkt sich die
  // App global für diesen Artikelnamen — beim Zurücksetzen auf "Automatisch" (leerer String)
  // wird die gelernte Zuordnung bewusst NICHT gelöscht, da ein einzelnes Zurücksetzen nicht
  // heißt, dass das gelernte Icon insgesamt falsch war.
  if (data.iconOverride) {
    await prisma.gelernteArtikelIcons.upsert({
      where: { name: artikel.name.trim().toLowerCase() },
      update: { icon: data.iconOverride },
      create: { name: artikel.name.trim().toLowerCase(), icon: data.iconOverride },
    });
  }
  revalidatePath("/einkaufsliste");
}

// Fix-Batch 63: globale Icon-Lerndatenbank fürs Frontend — wird einmal geladen und deckt die
// Icon-Anzeige bei Artikeln ohne eigenes iconOverride ab (Priorität: iconOverride > gelernt >
// Stichwort-Erkennung).
export async function listGelernteIcons(): Promise<Record<string, string>> {
  const eintraege = await prisma.gelernteArtikelIcons.findMany();
  return Object.fromEntries(eintraege.map((e) => [e.name, e.icon]));
}

// Fix-Batch 145 (Ticket #8, "intelligente Logik und Suchfunktion"): alle je verwendeten
// Artikelnamen (egal ob aktuell auf der Liste, schon abgehakt oder aus dem Essensplan
// übernommen) als Grundlage für eine Autovervollständigung im Eingabefeld — verhindert
// Tippfehler-Varianten desselben Artikels ("Tomate" / "Tomaten" / "tomate" landen sonst als
// getrennte Zeilen) und macht das erneute Eintippen schon bekannter Dinge schneller.
export async function listBekannteArtikelNamen(): Promise<string[]> {
  const eintraege = await prisma.einkaufsArtikel.findMany({
    distinct: ["name"],
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return eintraege.map((e) => e.name);
}

// Eltern: Artikel manuell in eine andere Kategorie verschieben (übersteuert die Auto-Erkennung dauerhaft).
// Fix-Batch 71: eine manuelle Kategorie-Korrektur wird ab sofort global für diesen
// Artikelnamen gemerkt (siehe autoKategorieId oben), damit sie künftigen Eingaben desselben
// Artikels zugutekommt, egal aus welcher Quelle sie kommen.
export async function verschiebeArtikelKategorie(id: string, kategorieId: string) {
  await requireParent();
  const artikel = await prisma.einkaufsArtikel.update({
    where: { id },
    data: { kategorieId: kategorieId || null },
  });
  if (kategorieId) {
    const kategorie = await prisma.einkaufsKategorie.findUnique({ where: { id: kategorieId } });
    if (kategorie) {
      await prisma.gelernteArtikelKategorie.upsert({
        where: { name: artikel.name.trim().toLowerCase() },
        update: { kategorieName: kategorie.name },
        create: { name: artikel.name.trim().toLowerCase(), kategorieName: kategorie.name },
      });
    }
  }
  revalidatePath("/einkaufsliste");
}

export async function toggleArtikel(id: string) {
  await requireParent();
  const a = await prisma.einkaufsArtikel.findUnique({ where: { id } });
  if (!a) return;
  await prisma.einkaufsArtikel.update({ where: { id }, data: { erledigt: !a.erledigt } });
  revalidatePath("/einkaufsliste");
}

export async function deleteArtikel(id: string) {
  await requireParent();
  await prisma.einkaufsArtikel.delete({ where: { id } });
  revalidatePath("/einkaufsliste");
}

// Kind: Wunsch einreichen
// Fix-Batch 92 (Florians Wunsch): Eltern bekamen bisher keine aktive Benachrichtigung für neue
// Einkaufswünsche (nur fürs Dashboard sichtbar) — analog zur bereits bestehenden Push-
// Benachrichtigung bei neu eingereichten Noten (siehe schule/actions.ts, einreichenNote).
export async function submitWunsch(data: { artikelName: string; menge?: string; notiz?: string }) {
  const person = await requirePerson();
  const artikelName = formatiereArtikelName(data.artikelName);
  const wunsch = await prisma.einkaufsWunsch.create({
    data: { artikelName, menge: data.menge, notiz: data.notiz || null, kindId: person.id },
  });
  await logAenderung({ entityTyp: "EINKAUFS_WUNSCH", entityId: wunsch.id, aktion: "eingereicht", neuerWert: wunsch.artikelName, geaendertVonId: person.id });
  await sendePushAnEltern({
    title: "Neuer Einkaufswunsch",
    body: `${person.name} wünscht sich: ${wunsch.artikelName}${wunsch.menge ? ` (${wunsch.menge})` : ""}`,
    url: "/einkaufsliste",
  });
  revalidatePath("/einkaufsliste");
}

// Fix-Batch 30: ein Kind darf seinen eigenen Wunsch bearbeiten/zurückziehen, solange er noch
// OFFEN ist (noch nicht genehmigt/abgelehnt) — danach nicht mehr, da schon in die Liste
// übernommen bzw. entschieden.
export async function updateWunsch(id: string, data: { artikelName?: string; menge?: string; notiz?: string }) {
  const person = await requirePerson();
  const bestehend = await prisma.einkaufsWunsch.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Wunsch nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
  if (bestehend.status !== "OFFEN") throw new Error("Nur ein noch nicht entschiedener Wunsch kann bearbeitet werden.");
  await prisma.einkaufsWunsch.update({
    where: { id },
    data: { ...data, artikelName: data.artikelName !== undefined ? formatiereArtikelName(data.artikelName) : undefined },
  });
  revalidatePath("/einkaufsliste");
}

export async function deleteWunsch(id: string) {
  const person = await requirePerson();
  const bestehend = await prisma.einkaufsWunsch.findUnique({ where: { id } });
  if (!bestehend) throw new Error("Wunsch nicht gefunden.");
  if (person.rolle !== "ELTERN" && bestehend.kindId !== person.id) throw new Error("Nicht erlaubt.");
  if (person.rolle !== "ELTERN" && bestehend.status !== "OFFEN") throw new Error("Nur ein noch nicht entschiedener Wunsch kann zurückgezogen werden.");
  await prisma.einkaufsWunsch.delete({ where: { id } });
  revalidatePath("/einkaufsliste");
}

export async function entscheideWunsch(id: string, genehmigt: boolean, kategorieId?: string) {
  const person = await requireParent();
  const wunsch = await prisma.einkaufsWunsch.update({
    where: { id },
    data: { status: genehmigt ? "GENEHMIGT" : "ABGELEHNT", entschiedenAm: new Date() },
    include: { kind: true },
  });
  if (genehmigt) {
    const bestehender = await findeOffenenArtikel(wunsch.artikelName, wunsch.notiz);
    let artikelId: string;
    if (bestehender) {
      await prisma.einkaufsArtikel.update({
        where: { id: bestehender.id },
        data: {
          menge: await mergeMenge(bestehender.menge, wunsch.menge),
          notiz: wunsch.notiz || bestehender.notiz,
          vonWunschId: wunsch.id,
          kategorieId: bestehender.kategorieId || kategorieId || (await autoKategorieId(wunsch.artikelName)),
        },
      });
      artikelId = bestehender.id;
    } else {
      const finalKategorieId = kategorieId || (await autoKategorieId(wunsch.artikelName));
      const neu = await prisma.einkaufsArtikel.create({
        data: {
          name: wunsch.artikelName,
          menge: wunsch.menge,
          notiz: wunsch.notiz,
          kategorieId: finalKategorieId || null,
          quelle: "wunsch",
          vonWunschId: wunsch.id,
        },
      });
      artikelId = neu.id;
    }
    await prisma.artikelQuelle.create({ data: { artikelId, beschreibung: `Wunsch von ${wunsch.kind.name}`, menge: wunsch.menge } });
  }
  await logAenderung({
    entityTyp: "EINKAUFS_WUNSCH",
    entityId: id,
    aktion: genehmigt ? "genehmigt" : "abgelehnt",
    geaendertVonId: person.id,
  });
  revalidatePath("/einkaufsliste");
}

// ---------- Quellen-Aufschlüsselung je Artikel (Fahrplan §3, Batch 2) ----------

export async function listArtikelQuellen(artikelId: string) {
  await requireParent();
  const [quellen, essensplanHerkuenfte, extraMahlzeitHerkuenfte] = await Promise.all([
    prisma.artikelQuelle.findMany({ where: { artikelId } }),
    prisma.essensplanHerkunft.findMany({ where: { artikelId }, include: { eintrag: { include: { rezept: true } } } }),
    prisma.extraMahlzeitHerkunft.findMany({ where: { artikelId }, include: { extraMahlzeit: { include: { rezept: true } } } }),
  ]);
  const kombiniert = [
    ...quellen.map((q) => ({ id: q.id, beschreibung: q.beschreibung, menge: q.menge, zeitpunkt: q.createdAt.toISOString() })),
    ...essensplanHerkuenfte.map((h) => ({
      id: h.id,
      beschreibung: `Essensplan: ${h.eintrag.rezept.name} (${h.eintrag.tag.toLocaleDateString("de-DE")})`,
      menge: h.menge,
      zeitpunkt: h.createdAt.toISOString(),
    })),
    // Fix-Batch 84: Zusatzmahlzeiten (Frühstück, Snack, …) laufen jetzt über dieselbe
    // Herkunfts-Logik wie das Hauptgericht, damit sich ihre Menge beim Entsperren
    // wieder sauber herausrechnen lässt — hier trotzdem in derselben Liste angezeigt.
    ...extraMahlzeitHerkuenfte.map((h) => ({
      id: h.id,
      beschreibung: `Extra: ${h.extraMahlzeit.bezeichnung} — ${h.extraMahlzeit.rezept.name}`,
      menge: h.menge,
      zeitpunkt: h.createdAt.toISOString(),
    })),
  ];
  kombiniert.sort((a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime());
  return kombiniert;
}

// ---------- Vorschlagsliste häufig gekaufter Artikel (Fahrplan §3, Batch 2) ----------
// Nutzt die bestehende Einkaufslisten-Historie (jeder abgeschlossene Einkaufszyklus
// erzeugt beim erneuten Hinzufügen einen neuen Artikel-Datensatz, da findeOffenenArtikel
// nur unerledigte Artikel matcht) statt eines separaten Kauf-Historie-Modells.
export async function listVorschlaege() {
  await requireParent();
  const [alleArtikel, offene, dismisses] = await Promise.all([
    prisma.einkaufsArtikel.findMany({ select: { name: true, menge: true, createdAt: true } }),
    prisma.einkaufsArtikel.findMany({ where: { erledigt: false }, select: { name: true } }),
    prisma.vorschlagDismiss.findMany(),
  ]);
  const dismissMap = new Map(dismisses.map((d) => [d.name, d.anzahl]));
  const offeneNamen = new Set(offene.map((a) => a.name.trim().toLowerCase()));

  const gruppen = new Map<string, { anzahl: number; menge: string | null; zeitpunkt: number; anzeigeName: string }>();
  for (const a of alleArtikel) {
    const key = a.name.trim().toLowerCase();
    const bestehend = gruppen.get(key);
    if (!bestehend) {
      gruppen.set(key, { anzahl: 1, menge: a.menge, zeitpunkt: a.createdAt.getTime(), anzeigeName: a.name.trim() });
    } else {
      bestehend.anzahl += 1;
      if (a.createdAt.getTime() > bestehend.zeitpunkt) {
        bestehend.menge = a.menge;
        bestehend.zeitpunkt = a.createdAt.getTime();
      }
    }
  }

  return Array.from(gruppen.entries())
    .filter(([key, g]) => g.anzahl >= 2 && !offeneNamen.has(key))
    .map(([key, g]) => ({ name: g.anzeigeName, menge: g.menge, score: g.anzahl / (1 + (dismissMap.get(key) ?? 0)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ name, menge }) => ({ name, menge }));
}

export async function verwirfVorschlag(name: string) {
  await requireParent();
  const key = name.trim().toLowerCase();
  await prisma.vorschlagDismiss.upsert({
    where: { name: key },
    update: { anzahl: { increment: 1 } },
    create: { name: key, anzahl: 1 },
  });
  revalidatePath("/einkaufsliste");
}

export async function setzeVorschlaegeZurueck() {
  await requireParent();
  await prisma.vorschlagDismiss.deleteMany({});
  revalidatePath("/einkaufsliste");
}

export async function addKategorie(name: string) {
  await requireAdmin();
  const anzahl = await prisma.einkaufsKategorie.count();
  await prisma.einkaufsKategorie.create({ data: { name, reihenfolge: anzahl } });
  revalidatePath("/einkaufsliste");
  revalidatePath("/einstellungen");
}

// Fix-Batch 45 Nachtrag (Bugticket "Sortierung funktioniert nicht zuverlässig"): die
// vorherige ↑/↓-Tausch-Logik (verschiebeKategorie) war anfällig für schnelles Doppelklicken —
// React zeigt während einer laufenden Transition noch die alte Liste, ein zweiter Klick vor
// dem Neuladen konnte dieselbe Position nochmal verschieben und landete dann woanders als
// erwartet. Jetzt direkt die gewünschte 1-basierte Position übergeben — das berechnet die
// GESAMTE Reihenfolge neu und ist dadurch unabhängig davon, wie oft/schnell geklickt wurde.
export async function setzeKategorieReihenfolge(id: string, neuePosition1Basiert: number) {
  await requireAdmin();
  const kategorien = await prisma.einkaufsKategorie.findMany({ orderBy: { reihenfolge: "asc" } });
  const ohneZiel = kategorien.filter((k) => k.id !== id);
  const ziel = kategorien.find((k) => k.id === id);
  if (!ziel) return;
  const einfuegeIndex = Math.max(0, Math.min(ohneZiel.length, neuePosition1Basiert - 1));
  const neueReihenfolge = [...ohneZiel.slice(0, einfuegeIndex), ziel, ...ohneZiel.slice(einfuegeIndex)];
  await prisma.$transaction(
    neueReihenfolge.map((k, i) => prisma.einkaufsKategorie.update({ where: { id: k.id }, data: { reihenfolge: i } }))
  );
  revalidatePath("/einkaufsliste");
  revalidatePath("/einstellungen");
}
