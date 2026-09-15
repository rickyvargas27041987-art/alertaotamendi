import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/webPush";
import { configZones, type OperationalZone, type ServiceType } from "@/lib/operationalAccess";

type OperationalReport = {
  id: number;
  category: string;
  description: string;
  province: string | null;
  district: string | null;
  locality: string | null;
};

const SERVICE_ROUTING: Record<string, ServiceType[]> = {
  "Delito / Robo": ["POLICE"],
  Incendio: ["FIRE"],
  Accidente: ["MEDICAL"],
  Emergencia: ["POLICE", "FIRE", "MEDICAL", "CIVIL_DEFENSE"],
};

function normalize(value: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("es-AR");
}

function zoneMatches(report: OperationalReport, zones: OperationalZone[]) {
  return zones.some((zone) =>
    normalize(zone.province) === normalize(report.province) &&
    normalize(zone.district) === normalize(report.district) &&
    (!zone.locality || normalize(zone.locality) === normalize(report.locality))
  );
}

export async function notifyOperationalResponders(report: OperationalReport) {
  const services = SERVICE_ROUTING[report.category] ?? [];
  if (!services.length || !report.province || !report.district) return;

  try {
    const subscriptions = await prisma.operationalPushSubscription.findMany({
      where: {
        enabled: true,
        session: {
          serviceType: { in: services },
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      },
      include: {
        session: { include: { config: { include: { ownerUser: { include: { zones: true } } } } } },
      },
    });

    const recipients = subscriptions.filter((item) =>
      item.session.revision === item.session.config.revision &&
      zoneMatches(report, configZones(item.session.config))
    );
    const area = [report.locality, report.district].filter(Boolean).join(" · ");
    await Promise.allSettled(recipients.map(async (item) => {
      const result = await sendWebPush(item, {
        title: `🚨 ${report.category === "Delito / Robo" ? "Hurto / Robo" : report.category} · aviso operativo`,
        body: `${area || "Jurisdicción asignada"}: ${report.description.slice(0, 180)}`,
        url: `/operativo?report=${report.id}`,
        tag: `operational-report-${report.id}`,
        reportId: report.id,
        priority: "critical",
        channel: "operational",
      });
      if (!result.ok && [404, 410].includes(result.status)) {
        await prisma.operationalPushSubscription.update({ where: { id: item.id }, data: { enabled: false } });
      }
    }));
  } catch (error) {
    // Un fallo de notificación nunca debe impedir que el reporte se guarde.
    console.error("No se pudieron enviar avisos al personal operativo:", error);
  }
}
