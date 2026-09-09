/* =========================================================
   ALERTA OTAMENDI
   SERVICE WORKER - NOTIFICACIONES PUSH
========================================================= */

/*
 * Hace que una nueva versión del service worker
 * se active inmediatamente.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

/*
 * Toma control de las páginas abiertas sin esperar
 * a que el usuario cierre y vuelva a abrir la web.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* =========================================================
   RECEPCIÓN DE PUSH
========================================================= */

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data
      ? event.data.json()
      : {};
  } catch {
    data = {
      title: "🚨 Alerta Otamendi",

      body: event.data
        ? event.data.text()
        : "Nueva alerta cercana",

      priority: "high",

      url: "/mapa",
    };
  }

  const title =
    data.title ||
    "🚨 Alerta Otamendi";

  const body =
    data.body ||
    "Se registró una alerta cerca de tu ubicación.";

  const priority =
    data.priority ||
    "normal";

  const important =
    priority === "critical" ||
    priority === "high";

  const reportId =
    data.reportId ?? null;

  const notificationUrl =
    data.url || "/mapa";

  /*
   * IMPORTANTE:
   *
   * Primero avisamos a las páginas abiertas para
   * poder mostrar el aviso dentro de la aplicación.
   *
   * Pero NO cancelamos la notificación del sistema.
   *
   * Así una alerta importante nunca se pierde
   * simplemente porque el usuario tenga abierta
   * otra pantalla de Alerta Otamendi.
   */

  event.waitUntil(
    Promise.all([
      /* =============================================
         AVISAR A LAS PÁGINAS ABIERTAS
      ============================================= */

      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((windowClients) => {
          windowClients.forEach(
            (client) => {
              client.postMessage({
                type: "PUSH_ALERT",

                payload: {
                  ...data,

                  title,

                  body,

                  priority,

                  reportId,

                  url:
                    notificationUrl,
                },
              });
            }
          );
        }),

      /* =============================================
         MOSTRAR NOTIFICACIÓN DEL SISTEMA
      ============================================= */

      self.registration.showNotification(
        title,
        {
          body,

          /*
           * El tag evita que el mismo reporte
           * cree notificaciones duplicadas.
           */
          tag:
            data.tag ||
            `report-${
              reportId ||
              Date.now()
            }`,

          /*
           * Si llega otra notificación con el mismo
           * tag, vuelve a avisar.
           */
          renotify: true,

          /*
           * Para emergencias críticas intentamos
           * mantener visible la notificación.
           *
           * Algunos navegadores pueden ignorarlo.
           */
          requireInteraction:
            priority ===
            "critical",

          /*
           * Vibración intensa para alertas
           * importantes.
           *
           * Los dispositivos que no la soporten
           * simplemente la ignorarán.
           */
          vibrate: important
            ? [
                300,
                120,
                300,
                120,
                500,
              ]
            : [200],

          /*
           * Información necesaria cuando el usuario
           * toca la notificación.
           */
          data: {
            url:
              notificationUrl,

            reportId,

            priority,
          },
        }
      ),
    ])
  );
});

/* =========================================================
   CLICK EN NOTIFICACIÓN
========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const relativeUrl =
      event.notification
        .data?.url ||
      "/mapa";

    /*
     * Convertimos /mapa en una dirección completa
     * del sitio actual.
     */
    const targetUrl =
      new URL(
        relativeUrl,
        self.location.origin
      ).href;

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then(
          async (
            windowClients
          ) => {
            /*
             * Si Alerta Otamendi ya está abierta,
             * reutilizamos esa ventana.
             */

            for (
              const client of
              windowClients
            ) {
              try {
                if (
                  "navigate" in
                  client
                ) {
                  await client.navigate(
                    targetUrl
                  );
                }

                if (
                  "focus" in
                  client
                ) {
                  return client.focus();
                }
              } catch {
                // Continuamos buscando otra ventana.
              }
            }

            /*
             * Si no estaba abierta,
             * abrimos /mapa.
             */

            if (
              self.clients.openWindow
            ) {
              return self.clients.openWindow(
                targetUrl
              );
            }
          }
        )
    );
  }
);