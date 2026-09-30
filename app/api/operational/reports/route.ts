import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  categoriesForService,
  configZones,
  getOperationalSession,
  jurisdictionWhere,
  operationalAudit,
  SERVICE_TYPES,
  type ServiceType,
} from "@/lib/operationalAccess";

export async function GET() {
  const session = await getOperationalSession();
  if (!session || !SERVICE_TYPES.includes(session.serviceType as ServiceType)) {
    return NextResponse.json({ success: false, error: "Acceso vencido o no autorizado." }, { status: 401 });
  }

  const zones = configZones(session.config);
  const reports = await prisma.report.findMany({
    where: {
      AND: [
        jurisdictionWhere(zones),
        { category: { in: categoriesForService(session.serviceType as ServiceType) } },
        { status: { notIn: ["resuelta", "descartada"] } },
        { createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      category: true,
      description: true,
      status: true,
      latitude: true,
      longitude: true,
      imageUrl: true,
      videoUrl: true,
      audioUrl: true,
      createdAt: true,
      province: true,
      district: true,
      locality: true,
      aiPriority: true,
      aiSummary: true,
    },
  });

  await prisma.operationalSession.update({ where: { id: session.id }, data: { lastAccessAt: new Date() } });
  await operationalAudit(session.configId, session.officerName, "OPERATIONAL_REPORTS_VIEWED", {
    sessionId: session.id,
    details: `${reports.length} alertas visibles`,
  });
  const responseStates = reports.length
    ? await prisma.operationalResponseState.findMany({
        where: {
          reportId: { in: reports.map((report) => report.id) },
          serviceType: session.serviceType,
        },
      })
    : [];

  const stateByReport = new Map(
    responseStates.map((state) => [state.reportId, state])
  );

  const enrichedReports = reports.map((report) => ({
    ...report,
    operationalState: stateByReport.get(report.id) ?? null,
  }));

  return NextResponse.json({ success: true, reports: enrichedReports, zones });
}

export async function POST(request: Request) {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false, error: "Acceso vencido o no autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const reportId = Number(body.reportId);
  const action = String(body.action || "");
  const validActions = ["view", "navigate", "received", "en_route", "on_scene", "finished"];

  if (!Number.isInteger(reportId) || !validActions.includes(action)) {
    return NextResponse.json({ success: false, error: "Operación inválida." }, { status: 400 });
  }
  const report = await prisma.report.findFirst({
    where: { id: reportId, AND: [jurisdictionWhere(configZones(session.config))] },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ success: false, error: "Alerta fuera de la jurisdicción autorizada." }, { status: 403 });
  if (["received", "en_route", "on_scene", "finished"].includes(action)) {
    const now = new Date();

    const statusData =
      action === "received"
        ? { status: "received", receivedAt: now }
        : action === "en_route"
        ? { status: "en_route", receivedAt: now, enRouteAt: now }
        : action === "on_scene"
        ? { status: "on_scene", receivedAt: now, onSceneAt: now }
        : { status: "finished", receivedAt: now, finishedAt: now };

    const state = await prisma.operationalResponseState.upsert({
      where: {
        reportId_serviceType: {
          reportId,
          serviceType: session.serviceType,
        },
      },
      create: {
        reportId,
        serviceType: session.serviceType,
        officerName: session.officerName,
        agency: session.agency,
        ...statusData,
      },
      update: {
        officerName: session.officerName,
        agency: session.agency,
        ...statusData,
      },
    });

    await operationalAudit(
      session.configId,
      session.officerName,
      `OPERATIONAL_STATUS_${action.toUpperCase()}`,
      {
        sessionId: session.id,
        reportId,
        details: `${session.agency} · ${session.serviceType} · ${action}`,
      }
    );

    return NextResponse.json({ success: true, state });
  }

  await operationalAudit(
    session.configId,
    session.officerName,
    action === "navigate"
      ? "OPERATIONAL_NAVIGATION_OPENED"
      : "OPERATIONAL_REPORT_OPENED",
    {
      sessionId: session.id,
      reportId,
    }
  );

  return NextResponse.json({ success: true });
}
