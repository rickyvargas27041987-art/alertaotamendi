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

function findOutputText(data: any): string | null {
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return null;
  }

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string" &&
        content.text.trim()
      ) {
        return content.text.trim();
      }
    }
  }

  return null;
}

async function analyzeVehicleImage(
  imageUrl: string
): Promise<VehicleVisualAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY no configurada.");
    return null;
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `
Analizá esta fotografía para un sistema de monitoreo de vehículos.

Tu tarea es describir únicamente lo que realmente pueda observarse.

IMPORTANTE:
- No inventes patente, marca ni modelo.
- Si una patente no es claramente legible, devolver null.
- Si una marca o modelo no se puede determinar con suficiente seguridad, devolver null.
- No identificar personas.
- Describir detalles útiles para reconocer el vehículo en fotografías futuras.

Devolver:
- plate: patente visible o null
- make: marca aproximada o null
- model: modelo aproximado o null
- color: color principal o null
- vehicleType: tipo de vehículo, por ejemplo auto, camioneta, moto, utilitario
- distinctive: daños, calcomanías, accesorios, modificaciones u otros rasgos distintivos
- visualSummary: resumen breve del aspecto general del vehículo
                  `.trim(),
                },
                {
                  type: "input_image",
                  image_url: imageUrl,
                  detail: "high",
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "vehicle_visual_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  plate: { type: ["string", "null"] },
                  make: { type: ["string", "null"] },
                  model: { type: ["string", "null"] },
                  color: { type: ["string", "null"] },
                  vehicleType: { type: ["string", "null"] },
                  distinctive: { type: ["string", "null"] },
                  visualSummary: { type: ["string", "null"] },
                },
                required: [
                  "plate",
                  "make",
                  "model",
                  "color",
                  "vehicleType",
                  "distinctive",
                  "visualSummary",
                ],
                additionalProperties: false,
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Error OpenAI analizando vehículo:",
        response.status,
        errorText
      );
      return null;
    }

    const data = await response.json();
    const outputText = findOutputText(data);

    if (!outputText) {
      console.error("OpenAI no devolvió análisis visual.");
      return null;
    }

    return JSON.parse(outputText) as VehicleVisualAnalysis;
  } catch (error) {
    console.error("Error analizando imagen del vehículo:", error);
    return null;
  }
}

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
