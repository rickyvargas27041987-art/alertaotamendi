import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const VALID_CATEGORIES = [
  "Delito / Robo",
  "Persona sospechosa",
  "Vehículo sospechoso",
  "Accidente",
  "Incendio",
  "Emergencia",
] as const;

type AiAnalysis = {
  category: (typeof VALID_CATEGORIES)[number];
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  confidence: number;
  possibleSpam: boolean;
  reason: string;
};

async function isAdminAuthenticated() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();

  return cookieStore.get("admin_session")?.value === secret;
}

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

export async function POST(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado.",
        },
        { status: 401 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "OPENAI_API_KEY no está configurada.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const reportId = Number(body.reportId);

    if (!Number.isInteger(reportId) || reportId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "ID de reporte inválido.",
        },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        category: true,
        description: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error: "Reporte no encontrado.",
        },
        { status: 404 }
      );
    }

    const prompt = `
Sos el sistema de inteligencia artificial de apoyo
del Centro de Monitoreo de Alerta Otamendi.

Analizás reportes enviados por vecinos.

DATOS DEL REPORTE

Número:
#${report.id}

Categoría elegida:
${report.category}

Descripción:
${report.description}

Ubicación:
${
  report.latitude !== null && report.longitude !== null
    ? `Latitud ${report.latitude}, longitud ${report.longitude}`
    : "No disponible"
}

Fecha:
${report.createdAt.toISOString()}

REGLAS

- No inventes información.
- No afirmes como comprobado algo que solo fue reportado.
- No identifiques ni acuses personas.
- La decisión final siempre corresponde al operador humano.
- possibleSpam solo debe ser true si hay señales claras
  de prueba, texto absurdo, publicidad o contenido irrelevante.
- confidence debe estar entre 0 y 1.
- Si existe peligro inmediato, violencia, delito en curso,
  incendio activo o riesgo grave para personas, usá critical.
- Usá high para hechos importantes que requieren revisión rápida.
- Usá medium para hechos relevantes sin peligro inmediato evidente.
- Usá low para información poco urgente, ambigua o posiblemente irrelevante.
`.trim();

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
          reasoning: {
            effort: "none",
          },
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "alerta_otamendi_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: [...VALID_CATEGORIES],
                  },
                  priority: {
                    type: "string",
                    enum: [
                      "critical",
                      "high",
                      "medium",
                      "low",
                    ],
                  },
                  summary: {
                    type: "string",
                  },
                  confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                  },
                  possibleSpam: {
                    type: "boolean",
                  },
                  reason: {
                    type: "string",
                  },
                },
                required: [
                  "category",
                  "priority",
                  "summary",
                  "confidence",
                  "possibleSpam",
                  "reason",
                ],
                additionalProperties: false,
              },
            },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI API error:",
        response.status,
        data
      );

      return NextResponse.json(
        {
          success: false,
          error: "OpenAI rechazó la solicitud.",
          openAiStatus: response.status,
        },
        { status: 502 }
      );
    }

    const outputText = findOutputText(data);

    if (!outputText) {
      console.error(
        "Respuesta OpenAI sin output_text:",
        JSON.stringify(data)
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "La IA respondió, pero no encontramos el análisis.",
        },
        { status: 502 }
      );
    }

    let analysis: AiAnalysis;

    try {
      analysis = JSON.parse(outputText) as AiAnalysis;
    } catch (error) {
      console.error(
        "JSON IA inválido:",
        outputText,
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "No pudimos interpretar la respuesta de IA.",
        },
        { status: 502 }
      );
    }

    const updatedReport = await prisma.report.update({
      where: {
        id: report.id,
      },
      data: {
        aiAnalyzed: true,
        aiCategory: analysis.category,
        aiPriority: analysis.priority,
        aiSummary: analysis.summary,
        aiConfidence: analysis.confidence,
        aiPossibleSpam: analysis.possibleSpam,
        aiReason: analysis.reason,
        aiAnalyzedAt: new Date(),
      },
      select: {
        id: true,
        category: true,
        status: true,
        aiAnalyzed: true,
        aiCategory: true,
        aiPriority: true,
        aiSummary: true,
        aiConfidence: true,
        aiPossibleSpam: true,
        aiReason: true,
        aiAnalyzedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
      report: updatedReport,
    });
  } catch (error) {
    console.error(
      "AI analyze error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Error interno analizando el reporte.",
      },
      { status: 500 }
    );
  }
}
