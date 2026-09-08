import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

async function isAdminAuthenticated() {
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminSessionSecret) {
    return false;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;

  return session === adminSessionSecret;
}

export async function GET() {
  try {
    const isAdmin = await isAdminAuthenticated();

    if (isAdmin) {
      const reports = await prisma.report.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return NextResponse.json({
        success: true,
        total: reports.length,
        reports,
      });
    }

    const reports = await prisma.report.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      total: reports.length,
      reports,
    });
  } catch (error) {
    console.error("Error al obtener reportes:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al obtener los reportes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const category = body.category;
    const description = body.description;
    const latitude = body.latitude;
    const longitude = body.longitude;
    const imageUrl = body.imageUrl;
    const videoUrl = body.videoUrl;
    const audioUrl = body.audioUrl;

    if (!category || !description) {
      return NextResponse.json(
        {
          success: false,
          message: "Falta la categoría o la descripción.",
        },
        { status: 400 }
      );
    }

    const newReport = await prisma.report.create({
      data: {
        category,
        description,
        status: "pendiente",
        latitude,
        longitude,
        imageUrl,
        videoUrl,
        audioUrl,
      },
      select: {
        id: true,
        category: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Alerta recibida correctamente.",
        report: newReport,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al guardar alerta:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al guardar la alerta.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const isAdmin = await isAdminAuthenticated();

    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          message: "No autorizado.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const id = Number(body.id);
    const status = body.status;

    const validStatuses = [
      "pendiente",
      "en_analisis",
      "verificada",
      "resuelta",
      "descartada",
    ];

    if (!id || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          message: "ID o estado inválido.",
        },
        { status: 400 }
      );
    }

    const updatedReport = await prisma.report.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Estado actualizado correctamente.",
      report: updatedReport,
    });
  } catch (error) {
    console.error("Error al actualizar estado:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al actualizar el estado.",
      },
      { status: 500 }
    );
  }
}
