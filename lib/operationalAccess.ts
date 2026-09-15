import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MonitorActor } from "@/lib/monitorAuth";
import { subscriptionHasAccess } from "@/lib/subscription";

export const OPERATIONAL_COOKIE = "operational_session";
export const OPERATIONAL_PERIOD_HOURS = 12;
export const OPERATIONAL_PERIOD_MS = OPERATIONAL_PERIOD_HOURS * 60 * 60 * 1000;

export const SERVICE_TYPES = ["POLICE", "FIRE", "MEDICAL", "CIVIL_DEFENSE"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

const SERVICE_CATEGORIES: Record<ServiceType, string[]> = {
  POLICE: ["Delito / Robo", "Persona sospechosa", "Vehículo sospechoso", "Accidente", "Emergencia"],
  FIRE: ["Incendio", "Accidente", "Emergencia"],
  MEDICAL: ["Accidente", "Emergencia"],
  CIVIL_DEFENSE: ["Incendio", "Accidente", "Emergencia"],
};

const LEGACY_ZONE = {
  province: "Buenos Aires",
  district: "General Alvarado",
  locality: null,
};

function secret() {
  const value = process.env.OPERATIONAL_CODE_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("Falta configurar OPERATIONAL_CODE_SECRET o ADMIN_SESSION_SECRET.");
  }
  return value;
}

export function hashOperationalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOperationalToken() {
  return randomBytes(32).toString("base64url");
}

export function operationalPeriod(config: { rotationStartedAt: Date }) {
  const now = Date.now();
  const anchor = config.rotationStartedAt.getTime();
  const index = Math.max(0, Math.floor((now - anchor) / OPERATIONAL_PERIOD_MS));
  return {
    index,
    expiresAt: new Date(anchor + (index + 1) * OPERATIONAL_PERIOD_MS),
  };
}

export function operationalCode(config: { id: number; revision: number; rotationStartedAt: Date }) {
  const period = operationalPeriod(config);
  const digest = createHmac("sha256", secret())
    .update(`${config.id}:${config.revision}:${period.index}`)
    .digest();
  const numeric = digest.readUInt32BE(0) % 1_000_000;
  return { code: numeric.toString().padStart(6, "0"), expiresAt: period.expiresAt };
}

export function codesMatch(expected: string, candidate: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ensureCenterConfig(actor: MonitorActor) {
  const centerKey = actor.kind === "legacy_admin" ? "legacy_admin" : `user:${actor.id}`;
  return prisma.operationalCodeConfig.upsert({
    where: { centerKey },
    create: { centerKey, ownerUserId: actor.id },
    update: actor.id ? { ownerUserId: actor.id } : {},
    include: { ownerUser: { include: { zones: true } } },
  });
}

export type OperationalZone = { province: string; district: string; locality: string | null };

export function configZones(config: {
  centerKey: string;
  ownerUser: { zones: OperationalZone[] } | null;
}): OperationalZone[] {
  if (config.ownerUser?.zones.length) return config.ownerUser.zones;
  return config.centerKey === "legacy_admin" ? [LEGACY_ZONE] : [];
}

export function jurisdictionWhere(zones: OperationalZone[]): Prisma.ReportWhereInput {
  if (!zones.length) return { id: -1 };
  return {
    OR: zones.map((zone) => ({
      province: { equals: zone.province, mode: "insensitive" },
      district: { equals: zone.district, mode: "insensitive" },
      ...(zone.locality ? { locality: { equals: zone.locality, mode: "insensitive" as const } } : {}),
    })),
  };
}

export function categoriesForService(serviceType: ServiceType) {
  return SERVICE_CATEGORIES[serviceType];
}

export async function getOperationalSession() {
  const store = await cookies();
  const token = store.get(OPERATIONAL_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.operationalSession.findUnique({
    where: { tokenHash: hashOperationalToken(token) },
    include: {
      config: { include: { ownerUser: { include: { zones: true } } } },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.revision !== session.config.revision) return null;
  if (session.config.ownerUser && !subscriptionHasAccess(session.config.ownerUser)) return null;
  return session;
}

export async function operationalAudit(
  configId: number,
  actorName: string,
  action: string,
  options?: { sessionId?: number; details?: string; reportId?: number }
) {
  try {
    await prisma.operationalAuditLog.create({
      data: {
        configId,
        sessionId: options?.sessionId,
        actorName,
        action,
        details: options?.details,
        reportId: options?.reportId,
      },
    });
  } catch (error) {
    console.error("No se pudo registrar la auditoría operativa:", error);
  }
}

export const operationalCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: OPERATIONAL_PERIOD_HOURS * 60 * 60,
};
