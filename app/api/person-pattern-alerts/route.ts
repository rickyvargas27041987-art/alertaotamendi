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

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
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

    const alerts =
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
    if (!(await isAdminAuthenticated())) {
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

    const alert =
      await prisma.personPatternAlert.update({
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
