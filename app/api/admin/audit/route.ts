import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonitorActor } from "@/lib/monitorAuth";
export async function GET() {
  const actor = await getMonitorActor();
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ success:false, error:"No autorizado." }, { status:403 });
  const [monitorLogs, operationalLogs] = await Promise.all([
    prisma.auditLog.findMany({ orderBy:{createdAt:"desc"}, take:300 }),
    prisma.operationalAuditLog.findMany({
      where: actor.kind === "legacy_admin" ? {} : { config: { ownerUserId: actor.id } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);
  const logs = [
    ...monitorLogs,
    ...operationalLogs.map((log) => ({
      id: -log.id,
      actorName: log.actorName,
      actorUsername: "acceso-operativo",
      action: log.action,
      details: log.details,
      reportId: log.reportId,
      createdAt: log.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 300);
  return NextResponse.json({ success:true, logs });
}
