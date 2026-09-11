// Service Worker für Web-Push-Benachrichtigungen (Fragenkatalog Frage 33, Batch 8).
// Bewusst minimal — kein Offline-Caching, nur Push-Empfang/-Anzeige.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let daten = { title: "Familientisch", body: "" };
  try {
    if (event.data) daten = event.data.json();
  } catch {
    daten.body = event.data ? event.data.text() : "";
  }

  event.waitUntil(
    self.registration.showNotification(daten.title || "Familientisch", {
      body: daten.body || "",
      icon: "/icon-192.png",
      // Android maskiert das "badge" (Statusleisten-Icon) rein nach Alpha-Kanal und färbt es
      // weiß — das normale, komplett opake Farb-Icon wurde dadurch zu einem weißen Viereck
      // (Florians Bugreport). badge-96.png ist eine eigene, monochrome Silhouette auf
      // transparentem Grund extra für diesen Zweck.
      badge: "/badge-96.png",
      data: { url: daten.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
