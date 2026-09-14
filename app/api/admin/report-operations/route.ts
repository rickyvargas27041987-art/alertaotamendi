import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, canOperateReport, getMonitorActor } from "@/lib/monitorAuth";

export async function GET(request: Request) {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });

  const reportId = Number(new URL(request.url).searchParams.get("reportId"));
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return NextResponse.json({ success: false, error: "Reporte inválido." }, { status: 400 });
  }

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { assignedTo: { select: { id: true, name: true, username: true } } },
  });
  if (!report) return NextResponse.json({ success: false, error: "Reporte no encontrado." }, { status: 404 });
  if (!canOperateReport(actor, report)) {
    return NextResponse.json({ success: false, error: "Sin permiso para esta jurisdicción." }, { status: 403 });
  }

  const logs = await prisma.auditLog.findMany({
    where: { reportId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, actorName: true, action: true, details: true, createdAt: true },
  });

  return NextResponse.json({
    success: true,
    assignment: report.assignedTo
      ? { ...report.assignedTo, assignedAt: report.assignedAt }
      : null,
    timeline: [
      { id: `created-${report.id}`, actorName: "Sistema", action: "REPORT_CREATED", details: "Alerta recibida", createdAt: report.createdAt },
      ...logs,
    ],
  });
}

export async function PATCH(request: Request) {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const reportId = Number(body.reportId);
  const action = String(body.action || "");
  if (!Number.isInteger(reportId) || reportId <= 0 || !["claim", "release", "acknowledge"].includes(action)) {
    return NextResponse.json({ success: false, error: "Operación inválida." }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ success: false, error: "Reporte no encontrado." }, { status: 404 });
  if (!canOperateReport(actor, report)) {
    return NextResponse.json({ success: false, error: "Sin permiso para esta jurisdicción." }, { status: 403 });
  }

  if (action === "claim") {
    if (report.assignedToId && report.assignedToId !== actor.id && actor.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Otro operador ya tomó esta alerta." }, { status: 409 });
    }
    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        assignedToId: actor.id,
        assignedAt: new Date(),
        acknowledgedAt: report.acknowledgedAt ?? new Date(),
        status: report.status === "pendiente" ? "en_analisis" : report.status,
      },
      include: { assignedTo: { select: { id: true, name: true, username: true } } },
    });
    await audit(actor, "REPORT_CLAIMED", `Alerta tomada por ${actor.name}`, reportId);
    return NextResponse.json({ success: true, report: updated });
  }

  if (action === "release") {
    if (report.assignedToId && report.assignedToId !== actor.id && actor.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Solo el operador asignado o un administrador puede liberarla." }, { status: 403 });
    }
    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { assignedToId: null, assignedAt: null },
      include: { assignedTo: { select: { id: true, name: true, username: true } } },
    });
    await audit(actor, "REPORT_RELEASED", `Alerta liberada por ${actor.name}`, reportId);
    return NextResponse.json({ success: true, report: updated });
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: { acknowledgedAt: report.acknowledgedAt ?? new Date() },
    include: { assignedTo: { select: { id: true, name: true, username: true } } },
  });
  await audit(actor, "REPORT_ACKNOWLEDGED", `Alerta revisada por ${actor.name}`, reportId);
  return NextResponse.json({ success: true, report: updated });
}
