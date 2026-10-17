import { prisma } from "@/lib/prisma";

type ReportLike = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  province: string | null;
  district: string | null;
  locality: string | null;
  createdAt?: Date;
};

function incidentPriority(category: string) {
  if (
    category === "Delito / Robo" ||
    category === "Emergencia"
  ) {
    return "critical";
  }

  if (
    category === "Accidente" ||
    category === "Incendio"
  ) {
    return "high";
  }

  return "normal";
}

function incidentStatus(reportStatus: string) {
  switch (reportStatus) {
    case "en_analisis":
      return "VERIFYING";
    case "verificada":
      return "ACTIVE";
    case "resuelta":
      return "RESOLVED";
    case "descartada":
      return "DISCARDED";
    case "pendiente":
    default:
      return "NEW";
  }
}

function eventForStatus(status: string) {
  switch (status) {
    case "VERIFYING":
      return {
        type: "INCIDENT_VERIFYING",
        message: "El reporte pasó a verificación.",
      };
    case "ACTIVE":
      return {
        type: "INCIDENT_ACTIVATED",
        message: "El reporte fue verificado y el incidente quedó activo.",
      };
    case "RESOLVED":
      return {
        type: "INCIDENT_RESOLVED",
        message: "El reporte fue marcado como resuelto.",
      };
    case "DISCARDED":
      return {
        type: "INCIDENT_DISCARDED",
        message: "El reporte fue descartado.",
      };
    default:
      return {
        type: "INCIDENT_CREATED",
        message: "Incidente creado automáticamente desde un reporte ciudadano.",
      };
  }
}

export async function syncOperationalIncidentFromReport(
  report: ReportLike
) {
  if (
    !report.province ||
    !report.district
  ) {
    console.warn(
      `[RED OPERATIVA] Reporte #${report.id} sin jurisdicción completa. No se crea incidente todavía.`
    );

    return null;
  }

  const network =
    await prisma.operationalNetwork.findFirst({
      where: {
        active: true,
        province: {
          equals: report.province,
          mode: "insensitive",
        },
        district: {
          equals: report.district,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

  if (!network) {
    console.log(
      `[RED OPERATIVA] No hay red activa para ${report.district}, ${report.province}. Reporte #${report.id} queda sin incidente operativo.`
    );

    return null;
  }

  const status =
    incidentStatus(report.status);

  const priority =
    incidentPriority(report.category);

  const title =
    `${report.category} · Reporte #${report.id}`;

  const existing =
    await prisma.operationalIncident.findFirst({
      where: {
        reportId: report.id,
      },
    });

  if (!existing) {
    try {
      const incident =
        await prisma.$transaction(
          async (tx) => {
            const created =
              await tx.operationalIncident.create({
                data: {
                  networkId:
                    network.id,
                  source:
                    "REPORT",
                  reportId:
                    report.id,
                  sourceRef:
                    `report:${report.id}`,
                  title,
                  category:
                    report.category,
                  priority,
                  status,
                  description:
                    report.description,
                  latitude:
                    report.latitude,
                  longitude:
                    report.longitude,
                  province:
                    report.province,
                  district:
                    report.district,
                  locality:
                    report.locality,
                  openedAt:
                    report.createdAt ??
                    new Date(),
                  controlledAt:
                    status ===
                    "RESOLVED"
                      ? new Date()
                      : null,
                  resolvedAt:
                    ["RESOLVED", "DISCARDED"].includes(
                      status
                    )
                      ? new Date()
                      : null,
                },
              });

            const event =
              eventForStatus(status);

            await tx.operationalIncidentEvent.create({
              data: {
                incidentId:
                  created.id,
                actorName:
                  "Alerta Otamendi",
                actorRole:
                  "SYSTEM",
                type:
                  event.type,
                message:
                  event.message,
                metadata: {
                  source:
                    "REPORT",
                  reportId:
                    report.id,
                  network:
                    network.name,
                  reportStatus:
                    report.status,
                },
              },
            });

            return created;
          }
        );

      console.log(
        `[RED OPERATIVA] Incidente #${incident.id} creado desde reporte #${report.id} en ${network.name}.`
      );

      return incident;
    } catch (error: any) {
      if (
        error?.code === "P2002"
      ) {
        return prisma.operationalIncident.findFirst({
          where: {
            reportId:
              report.id,
          },
        });
      }

      throw error;
    }
  }

  const statusChanged =
    existing.status !== status;

  const now =
    new Date();

  const incident =
    await prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.operationalIncident.update({
            where: {
              id: existing.id,
            },
            data: {
              networkId:
                network.id,
              title,
              category:
                report.category,
              priority,
              status,
              description:
                report.description,
              latitude:
                report.latitude,
              longitude:
                report.longitude,
              province:
                report.province,
              district:
                report.district,
              locality:
                report.locality,
              controlledAt:
                status ===
                "RESOLVED"
                  ? existing.controlledAt ??
                    now
                  : status ===
                    "DISCARDED"
                  ? existing.controlledAt
                  : null,
              resolvedAt:
                ["RESOLVED", "DISCARDED"].includes(
                  status
                )
                  ? existing.resolvedAt ??
                    now
                  : null,
            },
          });

        if (statusChanged) {
          const event =
            eventForStatus(status);

          await tx.operationalIncidentEvent.create({
            data: {
              incidentId:
                updated.id,
              actorName:
                "Alerta Otamendi",
              actorRole:
                "SYSTEM",
              type:
                event.type,
              message:
                event.message,
              metadata: {
                source:
                  "REPORT",
                reportId:
                  report.id,
                previousStatus:
                  existing.status,
                status,
                reportStatus:
                  report.status,
              },
            },
          });
        }

        return updated;
      }
    );

  if (statusChanged) {
    console.log(
      `[RED OPERATIVA] Incidente #${incident.id}: ${existing.status} → ${status}.`
    );
  }

  return incident;
}
