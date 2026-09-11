import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export type MonitorActor = {
  kind: "legacy_admin" | "user";
  id: number | null;
  username: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
  zones: Array<{ province: string; district: string; locality: string | null }>;
};

const SESSION_COOKIE = "monitor_session";
const SESSION_HOURS = 8;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [salt, storedHash] = stored.split(":");
    if (!salt || !storedHash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(storedHash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await prisma.monitorSession.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
}

export async function getMonitorActor(): Promise<MonitorActor | null> {
  const store = await cookies();
  const legacy = store.get("admin_session")?.value;
  const legacySecret = process.env.ADMIN_SESSION_SECRET;
  if (legacy && legacySecret && legacy === legacySecret) {
    return { kind: "legacy_admin", id: null, username: "admin", name: "Administrador", role: "ADMIN", zones: [] };
  }

  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.monitorSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { zones: true } } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return {
    kind: "user",
    id: session.user.id,
    username: session.user.username,
    name: session.user.name,
    role: session.user.role as "ADMIN" | "OPERATOR",
    zones: session.user.zones.map(z => ({ province: z.province, district: z.district, locality: z.locality })),
  };
}

export function canOperateReport(actor: MonitorActor, report: { province: string | null; district: string | null; locality: string | null }) {
  if (actor.role === "ADMIN") return true;
  if (!report.province || !report.district) return false;
  const norm = (s: string | null) => (s ?? "").trim().toLocaleLowerCase("es-AR");
  return actor.zones.some(z =>
    norm(z.province) === norm(report.province) &&
    norm(z.district) === norm(report.district) &&
    (!z.locality || norm(z.locality) === norm(report.locality))
  );
}

export async function audit(actor: MonitorActor, action: string, details?: string, reportId?: number) {
  try {
    await prisma.auditLog.create({ data: { userId: actor.id, actorName: actor.name, actorUsername: actor.username, action, details: details ?? null, reportId: reportId ?? null } });
  } catch (error) {
    console.error("No se pudo registrar auditoría:", error);
  }
}

export const monitorSessionCookie = { name: SESSION_COOKIE, maxAge: SESSION_HOURS * 60 * 60 };
