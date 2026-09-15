import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SERVICE_TYPES,
  codesMatch,
  configZones,
  createOperationalToken,
  hashOperationalToken,
  operationalAudit,
  operationalCode,
  operationalCookieOptions,
  OPERATIONAL_COOKIE,
  type ServiceType,
} from "@/lib/operationalAccess";
import { subscriptionHasAccess } from "@/lib/subscription";

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function requestKey(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

function consumeAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const key = requestKey(request);
  if (!consumeAttempt(key)) {
    return NextResponse.json({ success: false, error: "Demasiados intentos. Esperá 15 minutos." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").replace(/\D/g, "");
    const officerName = String(body.officerName || "").trim().slice(0, 100);
    const agency = String(body.agency || "").trim().slice(0, 120);
    const serviceType = String(body.serviceType || "") as ServiceType;

    if (!/^\d{6}$/.test(code) || officerName.length < 3 || agency.length < 2 || !SERVICE_TYPES.includes(serviceType)) {
      return NextResponse.json({ success: false, error: "Completá correctamente todos los datos." }, { status: 400 });
    }

    const configs = await prisma.operationalCodeConfig.findMany({
      include: { ownerUser: { include: { zones: true } } },
    });
    const matches = configs.filter((config) => codesMatch(operationalCode(config).code, code));
    if (matches.length !== 1) {
      return NextResponse.json({ success: false, error: "Código incorrecto, vencido o no habilitado." }, { status: 401 });
    }

    const config = matches[0];
    if (config.ownerUser && !subscriptionHasAccess(config.ownerUser)) {
      return NextResponse.json({ success: false, error: "El acceso de este Centro no se encuentra habilitado." }, { status: 403 });
    }
    if (!configZones(config).length) {
      return NextResponse.json({ success: false, error: "Este Centro todavía no tiene una jurisdicción asignada." }, { status: 403 });
    }

    const current = operationalCode(config);
    const token = createOperationalToken();
    const session = await prisma.operationalSession.create({
      data: {
        configId: config.id,
        tokenHash: hashOperationalToken(token),
        officerName,
        agency,
        serviceType,
        revision: config.revision,
        expiresAt: current.expiresAt,
      },
    });
    attempts.delete(key);
    await operationalAudit(config.id, officerName, "OPERATIONAL_ACCESS_GRANTED", {
      sessionId: session.id,
      details: `${agency} · ${serviceType}`,
    });

    const response = NextResponse.json({ success: true, expiresAt: session.expiresAt });
    response.cookies.set(OPERATIONAL_COOKIE, token, {
      ...operationalCookieOptions,
      maxAge: Math.max(60, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
    });
    return response;
  } catch (error) {
    console.error("Error habilitando acceso operativo:", error);
    return NextResponse.json({ success: false, error: "No se pudo validar el acceso operativo." }, { status: 500 });
  }
}
