"use client";

import { useState, useTransition } from "react";
import { listTicketNachrichten, erstelleTicketNachricht } from "@/app/(app)/einstellungen/actions";
import Spracheingabe from "./Spracheingabe";
import { Icon } from "@/lib/uiIcons";
import { formatiereDatumUhrzeit } from "@/lib/datumFormat";

type Nachricht = { id: string; text: string; erstellerName: string; istEigene: boolean; createdAt: string };

// Fix-Batch 142 (Florians Wunsch): Kinder sollen auf ihre Tickets antworten bzw. noch etwas
// ergänzen können, der Admin soll zurückschreiben können — jeweils auch per Spracheingabe.
// Wird sowohl in "Meine gemeldeten Tickets" (Kind-Ansicht) als auch in "Tickets verwalten"
// (Admin-Ansicht) eingebunden. Lädt die Nachrichten erst beim Aufklappen (dieselbe Technik
// wie ArtikelHerkunft in der Einkaufsliste).
export default function TicketNachrichtenThread({ ticketId }: { ticketId: string }) {
  const [nachrichten, setNachrichten] = useState<Nachricht[] | null>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  async function laden() {
    setNachrichten(await listTicketNachrichten(ticketId));
  }

  return (
    <details
      style={{ marginTop: 4 }}
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && nachrichten === null) startTransition(laden);
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        <Icon id="message" size={12} /> Nachrichten{nachrichten && nachrichten.length > 0 ? ` (${nachrichten.length})` : ""}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {pending && nachrichten === null && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Lädt …</span>}
        {nachrichten?.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Noch keine Nachrichten.</span>}
        {nachrichten?.map((n) => (
          <div key={n.id} style={{ display: "flex", flexDirection: "column", alignItems: n.istEigene ? "flex-end" : "flex-start" }}>
            <div className="card" style={{ padding: "6px 10px", fontSize: 13, maxWidth: "85%" }}>
              <div>{n.text}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {n.erstellerName} · {formatiereDatumUhrzeit(n.createdAt)}
              </div>
            </div>
          </div>
        ))}
        <Spracheingabe onErgebnis={(erkannt) => setText((bisher) => (bisher ? `${bisher} ${erkannt}` : erkannt))} disabled={pending} />
        <textarea
          rows={2}
          placeholder="Nachricht ergänzen …"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ fontSize: 13 }}
        />
        <button
          className="btn-secondary"
          style={{ fontSize: 12, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4 }}
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              await erstelleTicketNachricht(ticketId, text);
              setText("");
              await laden();
            })
          }
        >
          <Icon id="send" size={13} /> Absenden
        </button>
      </div>
    </details>
  );
}
