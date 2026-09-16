import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const memoryFallback = new Map<string, { count: number; expiresAt: number }>();

function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
}

function hashedKey(request: Request, scope: string) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.ADMIN_SESSION_SECRET || "alerta-rate-limit";
  return createHash("sha256").update(`${scope}:${requestAddress(request)}:${secret}`).digest("hex");
}

function consumeMemory(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = memoryFallback.get(key);
  if (!current || current.expiresAt <= now) {
    memoryFallback.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

export async function consumeRateLimit(
  request: Request,
  scope: string,
  max: number,
  windowSeconds: number
) {
  const key = hashedKey(request, scope);
  const windowMs = windowSeconds * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.requestRateLimit.findUnique({ where: { key } });
      if (!current || current.expiresAt <= now) {
        await tx.requestRateLimit.upsert({
          where: { key },
          create: { key, count: 1, windowStart: now, expiresAt },
          update: { count: 1, windowStart: now, expiresAt },
        });
        return true;
      }
      if (current.count >= max) return false;
      await tx.requestRateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
      return true;
    });
  } catch (error) {
    // La protección local mantiene el servicio operativo si todavía no se aplicó
    // la migración o la base está temporalmente indisponible.
    console.warn(`[RATE LIMIT] Se usó respaldo local para ${scope}:`, error);
    return consumeMemory(key, max, windowMs);
  }
}
