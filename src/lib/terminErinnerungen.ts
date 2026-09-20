import "server-only";
import { prisma } from "./prisma";
import { sendePushAnPerson, sendePushAnAlle } from "./push";

// Termin-Erinnerungen (Fragenkatalog Frage 33, Batch 8) — läuft als einfacher
// Hintergrund-Timer im selben Node-Prozess (Coolify hält den Container dauerhaft am
// Laufen, kein separater Cron-Dienst nötig). Prüft alle 60 Sekunden, ob ein Termin in
// den nächsten ERINNERUNG_MINUTEN_VORHER Minuten beginnt, und schickt dafür einmalig
// eine Push-Nachricht (Termin.erinnerungGesendet verhindert Doppel-Versand).
const ERINNERUNG_MINUTEN_VORHER = 30;
const PRUEF_INTERVALL_MS = 60 * 1000;

let gestartet = false;

export function starteTerminErinnerungen() {
  if (gestartet) return;
  gestartet = true;
  setInterval(pruefeFaelligeTermine, PRUEF_INTERVALL_MS);
}

async function pruefeFaelligeTermine() {
  try {
    const jetzt = new Date();
    const grenze = new Date(jetzt.getTime() + ERINNERUNG_MINUTEN_VORHER * 60 * 1000);
    const faellige = await prisma.termin.findMany({
      where: { erinnerungGesendet: false, ganztaegig: false, start: { gte: jetzt, lte: grenze } },
    });

    for (const termin of faellige) {
      const uhrzeit = termin.start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const payload = { title: "Termin-Erinnerung", body: `${termin.titel} um ${uhrzeit}`, url: "/kalender" };
      if (termin.personId) {
        await sendePushAnPerson(termin.personId, payload);
      } else {
        await sendePushAnAlle(payload);
      }
      await prisma.termin.update({ where: { id: termin.id }, data: { erinnerungGesendet: true } });
    }
  } catch (err) {
    console.error("Termin-Erinnerung: Fehler beim Prüfen fälliger Termine:", err);
  }
}
