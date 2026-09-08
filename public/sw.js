self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "🚨 Alerta Otamendi",
      body: event.data ? event.data.text() : "Nueva alerta cercana",
    };
  }

  const title = data.title || "🚨 Alerta Otamendi";

  const options = {
    body: data.body || "Se registró una alerta importante cerca de tu ubicación.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "alerta-otamendi",
    renotify: true,
    vibrate: [300, 150, 300],
    data: {
      url: data.url || "/mapa",
      reportId: data.reportId || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url =
    event.notification.data?.url || "/mapa";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
