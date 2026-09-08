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

function configureVapid() {
  if (vapidConfigured) return;

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;

  const subject =
    process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Variables VAPID incompletas."
    );
  }

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );

  vapidConfigured = true;
}

export async function sendWebPush(
  subscription: StoredSubscription,
  payload: PushPayload
) {
  configureVapid();

  try {
    const response =
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 120,
          urgency:
            payload.priority === "critical"
              ? "high"
              : "normal",
        }
      );

    return {
      ok: true,
      status: response.statusCode || 201,
      text: response.body || "",
    };
  } catch (error: unknown) {
    const pushError = error as {
      statusCode?: number;
      body?: string;
      message?: string;
    };

    return {
      ok: false,
      status: pushError.statusCode || 500,
      text:
        pushError.body ||
        pushError.message ||
        "Error enviando push",
    };
  }
}

export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}
