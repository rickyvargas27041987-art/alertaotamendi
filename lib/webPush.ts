import webpush from "web-push";

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  reportId?: number | null;
  priority?: "critical" | "high" | "normal";
};

let vapidConfigured = false;

/* =========================================================
   CONFIGURACIÓN VAPID
========================================================= */

function configureVapid() {
  if (vapidConfigured) return;

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;

  const subject =
    process.env.VAPID_SUBJECT;

  if (!publicKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY."
    );
  }

  if (!privateKey) {
    throw new Error(
      "Falta VAPID_PRIVATE_KEY."
    );
  }

  if (!subject) {
    throw new Error(
      "Falta VAPID_SUBJECT."
    );
  }

  /*
   * Ejemplo válido de VAPID_SUBJECT:
   *
   * mailto:administrador@dominio.com
   *
   * Nunca exponer la clave privada al navegador.
   */

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );

  vapidConfigured = true;
}

/* =========================================================
   ENVÍO PUSH
========================================================= */

export async function sendWebPush(
  subscription: StoredSubscription,
  payload: PushPayload
) {
  configureVapid();

  try {
    /*
     * Para una aplicación de seguridad:
     *
     * - critical = urgencia alta
     * - high     = urgencia alta
     * - normal   = normal
     *
     * TTL de 1 hora:
     * si momentáneamente el celular pierde internet,
     * el servicio push todavía puede entregarla
     * cuando vuelva a conectarse.
     */

    const urgency:
      | "very-low"
      | "low"
      | "normal"
      | "high" =
      payload.priority === "critical" ||
      payload.priority === "high"
        ? "high"
        : "normal";

    const response =
      await webpush.sendNotification(
        {
          endpoint:
            subscription.endpoint,

          keys: {
            p256dh:
              subscription.p256dh,

            auth:
              subscription.auth,
          },
        },

        JSON.stringify({
          title:
            payload.title,

          body:
            payload.body,

          url:
            payload.url || "/mapa",

          tag:
            payload.tag ||
            `alerta-${Date.now()}`,

          reportId:
            payload.reportId ?? null,

          priority:
            payload.priority ||
            "normal",

          timestamp:
            Date.now(),
        }),

        {
          /*
           * 3600 segundos = 1 hora.
           *
           * Mucho más apropiado que 120 segundos
           * para alertas comunitarias.
           */
          TTL: 3600,

          urgency,
        }
      );

    console.log(
      `Push enviado correctamente. Estado: ${
        response.statusCode || 201
      }`
    );

    return {
      ok: true,

      status:
        response.statusCode || 201,

      text:
        response.body || "",
    };
  } catch (error: unknown) {
    const pushError =
      error as {
        statusCode?: number;
        body?: string;
        message?: string;
        headers?: Record<
          string,
          string
        >;
      };

    const status =
      pushError.statusCode || 500;

    const text =
      pushError.body ||
      pushError.message ||
      "Error enviando push";

    /*
     * 404 / 410 generalmente significa
     * que esa suscripción ya dejó de existir.
     *
     * reports/route.ts ya se encarga de
     * desactivarla en la base de datos.
     */

    if (
      status === 404 ||
      status === 410
    ) {
      console.warn(
        `Suscripción push vencida o inexistente (${status}).`
      );
    } else {
      console.error(
        `Error Web Push (${status}):`,
        text
      );
    }

    return {
      ok: false,
      status,
      text,
    };
  }
}

/* =========================================================
   DISTANCIA ENTRE DOS COORDENADAS
   Fórmula Haversine
========================================================= */

export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  /*
   * Radio medio terrestre en kilómetros.
   */
  const R = 6371;

  const lat1Rad =
    (lat1 * Math.PI) / 180;

  const lat2Rad =
    (lat2 * Math.PI) / 180;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) *
      Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  const distance =
    R * c;

  /*
   * Protección por si alguna coordenada
   * incorrecta produjera un resultado inválido.
   */
  if (!Number.isFinite(distance)) {
    return Infinity;
  }

  return distance;
}