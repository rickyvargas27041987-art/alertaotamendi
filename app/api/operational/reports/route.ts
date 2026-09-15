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
  return NextResponse.json({ success: true, reports, zones });
}

export async function POST(request: Request) {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false, error: "Acceso vencido o no autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const reportId = Number(body.reportId);
  const action = String(body.action || "");
  if (!Number.isInteger(reportId) || !["view", "navigate"].includes(action)) {
    return NextResponse.json({ success: false, error: "Operación inválida." }, { status: 400 });
  }
  const report = await prisma.report.findFirst({
    where: { id: reportId, AND: [jurisdictionWhere(configZones(session.config))] },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ success: false, error: "Alerta fuera de la jurisdicción autorizada." }, { status: 403 });
  await operationalAudit(session.configId, session.officerName, action === "navigate" ? "OPERATIONAL_NAVIGATION_OPENED" : "OPERATIONAL_REPORT_OPENED", {
    sessionId: session.id,
    reportId,
  });
  return NextResponse.json({ success: true });
}
