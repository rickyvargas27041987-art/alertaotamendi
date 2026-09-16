import { createSign } from "crypto";

type FcmPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  reportId?: number;
  priority?: "critical" | "high" | "normal";
};

type CachedAccessToken = { value: string; expiresAt: number };

let cachedAccessToken: CachedAccessToken | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function firebaseCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function getAccessToken(credentials: NonNullable<ReturnType<typeof firebaseCredentials>>) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.privateKey).toString("base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Firebase OAuth respondió ${response.status}.`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Firebase no devolvió un token de acceso.");

  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

export type FcmSendResult = {
  ok: boolean;
  status: number;
  invalidToken: boolean;
  configured: boolean;
};

export async function sendFcmNotification(token: string, payload: FcmPayload): Promise<FcmSendResult> {
  const credentials = firebaseCredentials();
  if (!credentials) {
    console.warn("[FCM] Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY.");
    return { ok: false, status: 503, invalidToken: false, configured: false };
  }

  const accessToken = await getAccessToken(credentials);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: {
            url: payload.url,
            tag: payload.tag,
            reportId: payload.reportId ? String(payload.reportId) : "",
            priority: payload.priority ?? "normal",
          },
          android: {
            priority: payload.priority === "normal" ? "normal" : "high",
            notification: {
              sound: "default",
              tag: payload.tag,
              channel_id: "alertas_importantes",
              default_vibrate_timings: true,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  const text = await response.text();
  const invalidToken = response.status === 404 ||
    (response.status === 400 && /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/i.test(text));

  if (!response.ok) console.error(`[FCM] Envío rechazado (${response.status}):`, text.slice(0, 500));
  return { ok: response.ok, status: response.status, invalidToken, configured: true };
}
