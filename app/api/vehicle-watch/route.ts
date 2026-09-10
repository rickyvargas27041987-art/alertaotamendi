import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

async function isAdminAuthenticated() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === secret;
}

// LISTAR VEHÍCULOS EN SEGUIMIENTO
export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { success: false, error: "No autorizado." },
        { status: 401 }
      );
    }

    const vehicles = await prisma.vehicleWatch.findMany({
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
    console.error("Error cargando vehículos en seguimiento:", error);

    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los vehículos en seguimiento.",
      },
      { status: 500 }
    );
  }
}

// PONER UN VEHÍCULO EN SEGUIMIENTO
export async function POST(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { success: false, error: "No autorizado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const reportId = Number(body.reportId);

    if (!Number.isInteger(reportId) || reportId <= 0) {
      return NextResponse.json(
        { success: false, error: "ID de reporte inválido." },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        imageUrl: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        { success: false, error: "Reporte no encontrado." },
        { status: 404 }
      );
    }

    if (!report.imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Este reporte no tiene una foto para seguir el vehículo.",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.vehicleWatch.findFirst({
      where: {
        sourceReportId: report.id,
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

    const vehicle = await prisma.vehicleWatch.create({
      data: {
        sourceReportId: report.id,
        imageUrl: report.imageUrl,
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      vehicle,
      alreadyWatching: false,
    });
  } catch (error) {
    console.error("Error agregando vehículo al seguimiento:", error);

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo poner el vehículo en seguimiento.",
      },
      { status: 500 }
    );
  }
}

// FINALIZAR O REACTIVAR SEGUIMIENTO
export async function PATCH(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { success: false, error: "No autorizado." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const id = Number(body.id);
    const active = Boolean(body.active);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { success: false, error: "ID de seguimiento inválido." },
        { status: 400 }
      );
    }

    const vehicle = await prisma.vehicleWatch.update({
      where: {
        id,
      },
      data: {
        active,
      },
    });

    return NextResponse.json({
      success: true,
      vehicle,
    });
  } catch (error) {
    console.error("Error actualizando seguimiento de vehículo:", error);

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar el seguimiento.",
      },
      { status: 500 }
    );
  }
}
