import crypto from "crypto";

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

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function base64UrlEncode(value: Buffer | Uint8Array | string) {
  const buffer = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hmac(key: Buffer, data: Buffer) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function createVapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: audience,
      exp: now + 12 * 60 * 60,
      sub: subject,
    })
  );

  const signingInput = `${header}.${payload}`;

  const publicBytes = base64UrlDecode(publicKey);
  const privateBytes = base64UrlDecode(privateKey);

  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04 || privateBytes.length !== 32) {
    throw new Error("Claves VAPID inválidas.");
  }

  const x = publicBytes.subarray(1, 33);
  const y = publicBytes.subarray(33, 65);

  const keyObject = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      d: base64UrlEncode(privateBytes),
    },
    format: "jwk",
  });

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: keyObject,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function encryptPayload(payload: string, userPublicKey: string, authSecret: string) {
  const uaPublic = base64UrlDecode(userPublicKey);
  const auth = base64UrlDecode(authSecret);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04 || auth.length !== 16) {
    throw new Error("Suscripción push inválida.");
  }

  const sender = crypto.createECDH("prime256v1");
  sender.generateKeys();

  const asPublic = sender.getPublicKey(undefined, "uncompressed");
  const sharedSecret = sender.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);

  const prkKey = hmac(auth, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info"),
    Buffer.from([0]),
    uaPublic,
    asPublic,
  ]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));

  const prk = hmac(salt, ikm);
  const cekInfo = Buffer.concat([
    Buffer.from("Content-Encoding: aes128gcm"),
    Buffer.from([0]),
  ]);
  const nonceInfo = Buffer.concat([
    Buffer.from("Content-Encoding: nonce"),
    Buffer.from([0]),
  ]);

  const cek = hmac(prk, Buffer.concat([cekInfo, Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([nonceInfo, Buffer.from([1])])).subarray(0, 12);

  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext]);
}

export async function sendWebPush(subscription: StoredSubscription, payload: PushPayload) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Variables VAPID incompletas.");
  }

  const body = encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
  const jwt = createVapidJwt(subscription.endpoint, publicKey, privateKey, subject);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "120",
      Urgency: payload.priority === "critical" ? "high" : "normal",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    text: response.ok ? "" : await response.text().catch(() => ""),
  };
}

export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
