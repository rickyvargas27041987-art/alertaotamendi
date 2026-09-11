import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, canOperateReport, getMonitorActor } from "@/lib/monitorAuth";

type VehicleVisualAnalysis = {
  plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  distinctive: string | null;
  visualSummary: string | null;
};

// =========================================================
// LISTAR VEHÍCULOS EN SEGUIMIENTO
// =========================================================

export async function GET() {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
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

    const vehicles =
      await prisma.vehicleWatch.findMany({
        where: {
          active: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    return NextResponse.json({
      success: true,
      vehicles,
    });
  } catch (error) {
    console.error(
      "Error cargando vehículos en seguimiento:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudieron cargar los vehículos en seguimiento.",
      },
      {
        status: 500,
      }
    );
  }
}

// =========================================================
// PONER VEHÍCULO EN SEGUIMIENTO
// =========================================================

export async function POST(
  request: Request
) {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
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

    const reportId = Number(
      body.reportId
    );

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ID de reporte inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const report =
      await prisma.report.findUnique({
        where: {
          id: reportId,
        },

        select: {
          id: true,
          imageUrl: true,
          province: true,
          district: true,
          locality: true,
        },
      });

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Reporte no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (!canOperateReport(actor, report)) {
      return NextResponse.json({ success: false, error: "No tenés autorización para operar este reporte fuera de tu jurisdicción." }, { status: 403 });
    }

    if (!report.imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este reporte no tiene una foto para seguir el vehículo.",
        },
        {
          status: 400,
        }
      );
    }

    const existing =
      await prisma.vehicleWatch.findFirst({
        where: {
          sourceReportId:
            report.id,

          active: true,
        },
      });

    if (existing) {
      return NextResponse.json({
        success: true,
        vehicle: existing,
        alreadyWatching: true,
      });
    }

    // -----------------------------------------------------
    // ANALIZAR FOTO CON IA
    // -----------------------------------------------------

    const visualAnalysis =
      await analyzeVehicleImage(
        report.imageUrl
      );

    // -----------------------------------------------------
    // CREAR VEHÍCULO EN SEGUIMIENTO
    // -----------------------------------------------------

    const vehicle =
      await prisma.vehicleWatch.create({
        data: {
          sourceReportId:
            report.id,

          imageUrl:
            report.imageUrl,

          active: true,

          plate:
            visualAnalysis?.plate ??
            null,

          make:
            visualAnalysis?.make ??
            null,

          model:
            visualAnalysis?.model ??
            null,

          color:
            visualAnalysis?.color ??
            null,

          vehicleType:
            visualAnalysis?.vehicleType ??
            null,

          distinctive:
            visualAnalysis?.distinctive ??
            null,

          visualSummary:
            visualAnalysis?.visualSummary ??
            null,
        },
      });

    await audit(actor, "VEHICLE_WATCH_CREATED", `Seguimiento #${vehicle.id}`, report.id);

    return NextResponse.json({
      success: true,

      vehicle,

      alreadyWatching: false,

      aiAnalyzed:
        visualAnalysis !== null,
    });
  } catch (error) {
    console.error(
      "Error agregando vehículo al seguimiento:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo poner el vehículo en seguimiento.",
      },
      {
        status: 500,
      }
    );
  }
}

// =========================================================
// FINALIZAR O REACTIVAR SEGUIMIENTO
// =========================================================

export async function PATCH(
  request: Request
) {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const id =
      Number(body.id);

    const active =
      Boolean(body.active);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ID de seguimiento inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const existingVehicle = await prisma.vehicleWatch.findUnique({ where: { id }, select: { sourceReportId: true } });
    if (!existingVehicle) return NextResponse.json({ success: false, error: "Seguimiento no encontrado." }, { status: 404 });
    const sourceReport = await prisma.report.findUnique({ where: { id: existingVehicle.sourceReportId }, select: { province: true, district: true, locality: true } });
    if (!sourceReport || !canOperateReport(actor, sourceReport)) return NextResponse.json({ success: false, error: "No tenés autorización para operar este seguimiento." }, { status: 403 });

    const vehicle =
      await prisma.vehicleWatch.update({
        where: {
          id,
        },

        data: {
          active,
        },
      });

    await audit(actor, active ? "VEHICLE_WATCH_REACTIVATED" : "VEHICLE_WATCH_CLOSED", `Seguimiento #${id}`, existingVehicle.sourceReportId);
    return NextResponse.json({
      success: true,
      vehicle,
    });
  } catch (error) {
    console.error(
      "Error actualizando seguimiento de vehículo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo actualizar el seguimiento.",
      },
      {
        status: 500,
      }
    );
  }
}
