import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, canManageCenter, getMonitorActor, type MonitorActor } from "@/lib/monitorAuth";

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("es-AR");
}

function canUseMatches(actor: MonitorActor) {
  return actor.role !== "INSTITUTIONAL" && canManageCenter(actor);
}

function actorOwnsTarget(
  actor: MonitorActor,
  target: { province: string | null; district: string | null; locality: string | null }
) {
  if (actor.role === "ADMIN") return true;
  if (!target.province || !target.district) return false;

  return actor.zones.some(
    (zone) =>
      norm(zone.province) === norm(target.province) &&
      norm(zone.district) === norm(target.district) &&
      (!zone.locality || norm(zone.locality) === norm(target.locality))
  );
}

export async function GET(request: Request) {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    }
    if (!canUseMatches(actor)) {
      return NextResponse.json(
        { success: false, error: "Tu perfil no tiene acceso a coincidencias." },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pendiente";

    const targets = await prisma.trackingTarget.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
    });

    const visibleTargets = targets.filter((target) => actorOwnsTarget(actor, target));
    const targetIds = visibleTargets.map((target) => target.id);
    const targetMap = new Map(visibleTargets.map((target) => [target.id, target]));

    const matches = targetIds.length
      ? await prisma.trackingMatch.findMany({
          where: {
            trackingTargetId: { in: targetIds },
            ...(status === "todos" ? {} : { status }),
          },
          orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
          take: 200,
        })
      : [];

    return NextResponse.json({
      success: true,
      matches: matches.map((match) => ({
        ...match,
        target: targetMap.get(match.trackingTargetId) ?? null,
        outsideJurisdiction:
          Boolean(match.reportProvince && match.reportDistrict) &&
          !actor.zones.some(
            (zone) =>
              norm(zone.province) === norm(match.reportProvince) &&
              norm(zone.district) === norm(match.reportDistrict) &&
              (!zone.locality || norm(zone.locality) === norm(match.reportLocality))
          ),
      })),
    });
  } catch (error) {
    console.error("Error cargando coincidencias:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar las coincidencias." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    }
    if (!canUseMatches(actor)) {
      return NextResponse.json(
        { success: false, error: "Tu perfil no puede revisar coincidencias." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const id = Number(body.id);
    const status = String(body.status ?? "");

    if (!Number.isInteger(id) || id <= 0 || !["confirmada", "descartada", "pendiente"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Datos de revisión inválidos." },
        { status: 400 }
      );
    }

    const match = await prisma.trackingMatch.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ success: false, error: "Coincidencia no encontrada." }, { status: 404 });
    }

    const target = await prisma.trackingTarget.findUnique({
      where: { id: match.trackingTargetId },
    });

    if (!target || !actorOwnsTarget(actor, target)) {
      return NextResponse.json(
        { success: false, error: "No tenés autorización para revisar esta coincidencia." },
        { status: 403 }
      );
    }

    const updated = await prisma.trackingMatch.update({
      where: { id },
      data: {
        status,
        reviewedById: actor.id,
        reviewedByName: actor.name,
        reviewedAt: status === "pendiente" ? null : new Date(),
      },
    });

    await audit(
      actor,
      status === "confirmada" ? "TRACKING_MATCH_CONFIRMED" : status === "descartada" ? "TRACKING_MATCH_DISCARDED" : "TRACKING_MATCH_REOPENED",
      `Coincidencia #${id} · seguimiento #${target.id} · reporte #${match.reportId}`,
      match.reportId
    );

    return NextResponse.json({ success: true, match: updated });
  } catch (error) {
    console.error("Error revisando coincidencia:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la coincidencia." },
      { status: 500 }
    );
  }
}
