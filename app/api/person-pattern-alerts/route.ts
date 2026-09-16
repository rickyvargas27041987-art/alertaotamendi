import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageCenter, canOperateReport, canViewReport, getMonitorActor } from "@/lib/monitorAuth";

export async function GET() {
  try {
    const actor = await getMonitorActor();
    if (!actor || !canManageCenter(actor)) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const allAlerts =
      await prisma.personPatternAlert.findMany({
        where: {
          status: {
            in: ["pendiente", "en_revision"],
          },
        },
        orderBy: [
          {
            lastReportAt: "desc",
          },
          {
            updatedAt: "desc",
          },
        ],
        take: 50,
      });

    const reportIds = Array.from(new Set(allAlerts.flatMap((alert) => alert.reportIds)));
    const reports = reportIds.length
      ? await prisma.report.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, province: true, district: true, locality: true },
        })
      : [];
    const reportById = new Map(reports.map((report) => [report.id, report]));
    const alerts = actor.role === "ADMIN"
      ? allAlerts
      : allAlerts.filter((alert) =>
          alert.reportIds.some((reportId) => {
            const report = reportById.get(reportId);
            return report ? canViewReport(actor, report) : false;
          })
        );

    return NextResponse.json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error(
      "Error cargando alertas de patrón de persona:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudieron cargar las alertas de patrón.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: Request
) {
  try {
    const actor = await getMonitorActor();
    if (!actor || !canManageCenter(actor)) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const body = await request.json();
    const id = Number(body.id);
    const status = String(body.status || "");

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "ID inválido.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      ![
        "pendiente",
        "en_revision",
        "resuelta",
        "descartada",
      ].includes(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Estado inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const existing = await prisma.personPatternAlert.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Alerta preventiva no encontrada." }, { status: 404 });
    }
    const relatedReports = await prisma.report.findMany({
      where: { id: { in: existing.reportIds } },
      select: { province: true, district: true, locality: true },
    });
    if (actor.role !== "ADMIN" && !relatedReports.some((report) => canOperateReport(actor, report))) {
      return NextResponse.json({ success: false, error: "No tenés autorización para esta jurisdicción." }, { status: 403 });
    }

    const alert = await prisma.personPatternAlert.update({
        where: {
          id,
        },
        data: {
          status,
        },
      });

    return NextResponse.json({
      success: true,
      alert,
    });
  } catch (error) {
    console.error(
      "Error actualizando alerta de patrón de persona:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo actualizar la alerta de patrón.",
      },
      {
        status: 500,
      }
    );
  }
}
