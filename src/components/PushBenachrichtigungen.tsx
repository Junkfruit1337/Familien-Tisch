"use client";

import { useEffect, useState } from "react";
import { getVapidPublicKey, istPushAktiv, registrierePushSubscription, entfernePushSubscription } from "@/app/(app)/push/actions";

function base64ZuUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Status = "wird_geprueft" | "nicht_unterstuetzt" | "nicht_eingerichtet" | "aus" | "an";

// Benachrichtigungs-Opt-in pro Gerät (Fragenkatalog Frage 33, Batch 8) — bewusst für
// jede Person auf jeder Seite verfügbar (nicht nur Eltern), da jede Person selbst
// entscheidet, ob ihr eigenes Gerät Push-Nachrichten bekommen soll.
export default function PushBenachrichtigungen() {
  const [status, setStatus] = useState<Status>("wird_geprueft");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus("nicht_unterstuetzt");
        return;
      }
      const serverAktiv = await istPushAktiv();
      if (!serverAktiv) {
        setStatus("nicht_eingerichtet");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      setStatus(subscription ? "an" : "aus");
    })().catch(() => setStatus("nicht_unterstuetzt"));
  }, []);

  async function aktivieren() {
    setPending(true);
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") {
        alert("Ohne Erlaubnis im Browser können keine Benachrichtigungen gesendet werden.");
        return;
      }
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        setStatus("nicht_eingerichtet");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ZuUint8Array(publicKey),
      });
      await registrierePushSubscription(subscription.toJSON() as any);
      setStatus("an");
    } catch (e: any) {
      alert(e.message ?? "Aktivieren fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  async function deaktivieren() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await entfernePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("aus");
    } finally {
      setPending(false);
    }
  }

  if (status === "wird_geprueft" || status === "nicht_unterstuetzt") return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <strong>🔔 Benachrichtigungen (dieses Gerät)</strong>
      {status === "nicht_eingerichtet" ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Push-Benachrichtigungen sind serverseitig noch nicht eingerichtet.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {status === "an"
              ? "Aktiv — du bekommst z. B. eine Nachricht, wenn eine neue Note zur Freigabe wartet oder ein Termin bald beginnt."
              : "Noch nicht aktiviert. Nach dem Aktivieren fragt der Browser einmalig um Erlaubnis."}
          </p>
          <button className="btn-secondary" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={status === "an" ? deaktivieren : aktivieren}>
            {status === "an" ? "Deaktivieren" : "Aktivieren"}
          </button>
        </>
      )}
    </div>
  );
}
