import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getMonitorActor } from "@/lib/monitorAuth";
import { configZones, ensureCenterConfig, operationalCode } from "@/lib/operationalAccess";

export async function GET() {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });

  try {
    const config = await ensureCenterConfig(actor);
    const current = operationalCode(config);
    const sessions = await prisma.operationalSession.findMany({
      where: { configId: config.id, revokedAt: null, expiresAt: { gt: new Date() }, revision: config.revision },
      orderBy: { lastAccessAt: "desc" },
      take: 50,
      select: { id: true, officerName: true, agency: true, serviceType: true, createdAt: true, lastAccessAt: true, expiresAt: true },
    });

    return NextResponse.json({
      success: true,
      code: current.code,
      expiresAt: current.expiresAt,
      zones: configZones(config),
      sessions,
    });
  } catch (error) {
    console.error("Error obteniendo acceso operativo:", error);
    return NextResponse.json({ success: false, error: "No se pudo generar el código operativo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const config = await ensureCenterConfig(actor);

  if (action === "rotate") {
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.operationalCodeConfig.update({
        where: { id: config.id },
        data: { revision: { increment: 1 }, rotationStartedAt: new Date() },
      });
      await tx.operationalSession.updateMany({
        where: { configId: config.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return next;
    });
    await audit(actor, "OPERATIONAL_CODE_ROTATED", "Código operativo renovado; accesos anteriores revocados.");
    const current = operationalCode(updated);
    return NextResponse.json({ success: true, code: current.code, expiresAt: current.expiresAt });
  }

  if (action === "revoke_session") {
    const sessionId = Number(body.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ success: false, error: "Acceso inválido." }, { status: 400 });
    }
    const result = await prisma.operationalSession.updateMany({
      where: { id: sessionId, configId: config.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return NextResponse.json({ success: false, error: "Acceso no encontrado." }, { status: 404 });
    await audit(actor, "OPERATIONAL_SESSION_REVOKED", `Acceso operativo #${sessionId} revocado.`);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Operación inválida." }, { status: 400 });
}
