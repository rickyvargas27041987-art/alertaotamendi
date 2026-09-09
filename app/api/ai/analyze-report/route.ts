import { NextResponse } from "next/server";

type AiAnalysis = {
  category:
    | "Delito / Robo"
    | "Persona sospechosa"
    | "Vehículo sospechoso"
    | "Accidente"
    | "Incendio"
    | "Emergencia";

  priority:
    | "critical"
    | "high"
    | "medium"
    | "low";

  summary: string;
  confidence: number;
  possibleSpam: boolean;
  reason: string;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      category,
      description,
      latitude,
      longitude,
    } = body;

    if (
      typeof description !== "string" ||
      description.trim().length < 3
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Falta una descripción válida.",
        },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "OPENAI_API_KEY no está configurada.",
        },
        { status: 500 }
      );
    }

    const prompt = `
Sos el sistema de inteligencia artificial de apoyo
del Centro de Monitoreo de Alerta Otamendi.

Analizás reportes enviados por vecinos.

DATOS DEL REPORTE

Categoría elegida:
${category || "Sin categoría"}

Descripción:
${description.trim()}

Ubicación:
${
  latitude !== null &&
  latitude !== undefined &&
  longitude !== null &&
  longitude !== undefined
    ? `Latitud ${latitude}, longitud ${longitude}`
    : "No disponible"
}

REGLAS

- No inventes información.
- No afirmes como comprobado algo que solo fue reportado.
- No identifiques ni acuses personas.
- La decisión final siempre corresponde al operador humano.
- possibleSpam solo debe ser true si hay señales claras
  de prueba, texto absurdo, publicidad o contenido irrelevante.
- confidence debe estar entre 0 y 1.
`.trim();

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
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
              name:
                "alerta_otamendi_analysis",
              strict: true,

              schema: {
                type: "object",

                properties: {
                  category: {
                    type: "string",
                    enum: [
                      "Delito / Robo",
                      "Persona sospechosa",
                      "Vehículo sospechoso",
                      "Accidente",
                      "Incendio",
                      "Emergencia",
                    ],
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

                additionalProperties:
                  false,
              },
            },
          },
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI API error:",
        response.status,
        data
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "OpenAI rechazó la solicitud.",
          openAiStatus:
            response.status,
        },
        { status: 502 }
      );
    }

    const outputText =
      findOutputText(data);

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
      analysis =
        JSON.parse(outputText) as AiAnalysis;
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

    return NextResponse.json({
      success: true,
      analysis,
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
