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

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const visibleClient = windowClients.find(
          (client) => client.visibilityState === "visible"
        );

        if (visibleClient) {
          visibleClient.postMessage({
            type: "PUSH_ALERT",
            payload: data,
          });
          return;
        }

        const important = data.priority === "critical" || data.priority === "high";

        return self.registration.showNotification(
          data.title || "🚨 Alerta Otamendi",
          {
            body:
              data.body ||
              "Se registró una alerta importante cerca de tu ubicación.",
            tag: data.tag || `alerta-${data.reportId || "otamendi"}`,
            renotify: true,
            requireInteraction: data.priority === "critical",
            vibrate: important ? [300, 130, 300, 130, 500] : undefined,
            data: {
              url: data.url || "/mapa",
              reportId: data.reportId || null,
            },
          }
        );
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/mapa";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ("navigate" in client) {
            await client.navigate(url);
          }
          if ("focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
