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

/*
 * Primera etapa de detección de relaciones.
 *
 * La IA solamente revisará reportes que:
 * - estén dentro de 1 km
 * - hayan ocurrido dentro de una ventana de 30 minutos
 *
 * NO une reportes automáticamente.
 * NO descarta reportes.
 * La decisión final sigue siendo del operador.
 */
const RELATED_RADIUS_KM = 1;
const RELATED_TIME_MINUTES = 30;

type AiAnalysis = {
  category: (typeof VALID_CATEGORIES)[number];
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  confidence: number;
  possibleSpam: boolean;
  reason: string;

  relatedReports: boolean;
  relatedReportIds: number[];
  relationSummary: string;
};

type NearbyReport = {
  id: number;
  category: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  distanceKm: number;
};

type VehicleComparison = {
  possibleMatch: boolean;
  confidence: number;
  reason: string;
  detectedPlate: string | null;
  detectedMake: string | null;
  detectedModel: string | null;
  detectedColor: string | null;
  detectedVehicleType: string | null;
  detectedDistinctive: string | null;
  visualSummary: string | null;
};

/* =========================================================
   ADMIN
========================================================= */

async function isAdminAuthenticated() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();

  return (
    cookieStore.get("admin_session")?.value === secret
  );
}

/* =========================================================
   DISTANCIA ENTRE DOS COORDENADAS
   FÓRMULA HAVERSINE
========================================================= */

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earthRadiusKm = 6371;

  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const latitudeDifference =
    toRadians(lat2 - lat1);

  const longitudeDifference =
    toRadians(lon2 - lon1);

  const a =
    Math.sin(latitudeDifference / 2) *
      Math.sin(latitudeDifference / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(longitudeDifference / 2) *
      Math.sin(longitudeDifference / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

/* =========================================================
   EXTRAER TEXTO DE RESPUESTA OPENAI
========================================================= */

function findOutputText(
  data: any
): string | null {
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

/* =========================================================
   COMPARAR FOTO NUEVA CON VEHÍCULO EN SEGUIMIENTO
========================================================= */

async function compareVehicleImages(params: {
  apiKey: string;
  referenceImageUrl: string;
  candidateImageUrl: string;
  referenceDescription: string;
}): Promise<VehicleComparison | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        reasoning: {
          effort: "none",
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `
Sos un sistema de apoyo visual para un Centro de Monitoreo.

Vas a recibir DOS fotografías:

IMAGEN 1:
Vehículo de referencia que ya está en seguimiento.

Datos previamente observados del vehículo de referencia:
${params.referenceDescription}

IMAGEN 2:
Fotografía de un reporte nuevo.

Tu tarea es evaluar si el vehículo visible en la IMAGEN 2 podría ser el mismo vehículo de la IMAGEN 1.

REGLAS IMPORTANTES:
- Esto es solamente una POSIBLE COINCIDENCIA, nunca una identificación definitiva.
- No identifiques personas.
- No inventes patente, marca, modelo ni detalles que no sean visibles.
- Una patente solamente cuenta como coincidencia fuerte si es claramente legible.
- El color por sí solo NO alcanza.
- El tipo de vehículo por sí solo NO alcanza.
- Considerá conjuntamente carrocería, color, marca/modelo si son observables, ópticas, llantas, daños, calcomanías, accesorios y otros rasgos distintivos.
- Tené en cuenta que las fotos pueden tener distinto ángulo, distancia, iluminación o calidad.
- Si las imágenes son insuficientes o muestran vehículos claramente distintos, possibleMatch debe ser false.
- confidence debe estar entre 0 y 1.
- Para possibleMatch=true debe existir evidencia visual razonable y confidence debe ser al menos 0.75.
- reason debe explicar brevemente qué coincide y qué genera incertidumbre.

También describí únicamente los datos que realmente puedan observarse en la IMAGEN 2.
                `.trim(),
              },
              {
                type: "input_image",
                image_url: params.referenceImageUrl,
                detail: "high",
              },
              {
                type: "input_image",
                image_url: params.candidateImageUrl,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "vehicle_match_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                possibleMatch: { type: "boolean" },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                },
                reason: { type: "string" },
                detectedPlate: { type: ["string", "null"] },
                detectedMake: { type: ["string", "null"] },
                detectedModel: { type: ["string", "null"] },
                detectedColor: { type: ["string", "null"] },
                detectedVehicleType: { type: ["string", "null"] },
                detectedDistinctive: { type: ["string", "null"] },
                visualSummary: { type: ["string", "null"] },
              },
              required: [
                "possibleMatch",
                "confidence",
                "reason",
                "detectedPlate",
                "detectedMake",
                "detectedModel",
                "detectedColor",
                "detectedVehicleType",
                "detectedDistinctive",
                "visualSummary",
              ],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI error comparando vehículos:",
        response.status,
        data
      );
      return null;
    }

    const outputText = findOutputText(data);

    if (!outputText) {
      console.error("Comparación visual sin output_text.");
      return null;
    }

    return JSON.parse(outputText) as VehicleComparison;
  } catch (error) {
    console.error("Error comparando imágenes de vehículos:", error);
    return null;
  }
}

/* =========================================================
   POST
   ANALIZAR REPORTE CON IA
========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* -----------------------------------------------------
       SEGURIDAD ADMIN
    ----------------------------------------------------- */

    if (
      !(await isAdminAuthenticated())
    ) {
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

    /* -----------------------------------------------------
       API KEY
    ----------------------------------------------------- */

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "OPENAI_API_KEY no está configurada.",
        },
        {
          status: 500,
        }
      );
    }

    /* -----------------------------------------------------
       ID REPORTE
    ----------------------------------------------------- */

    const body =
      await request.json();

    const reportId =
      Number(body.reportId);

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

    /* -----------------------------------------------------
       BUSCAR REPORTE PRINCIPAL
    ----------------------------------------------------- */

    const report =
      await prisma.report.findUnique({
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
          imageUrl: true,
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

    /* =====================================================
       BUSCAR POSIBLES REPORTES RELACIONADOS
    ===================================================== */

    let nearbyReports: NearbyReport[] = [];

    if (
      report.latitude !== null &&
      report.longitude !== null
    ) {
      /*
       * Usamos la fecha del propio reporte.
       *
       * De esta manera también funciona
       * si el operador vuelve a analizar
       * una alerta antigua.
       */
      const startTime =
        new Date(
          report.createdAt.getTime() -
            RELATED_TIME_MINUTES *
              60 *
              1000
        );

      const endTime =
        new Date(
          report.createdAt.getTime() +
            RELATED_TIME_MINUTES *
              60 *
              1000
        );

      /*
       * Primero filtramos por tiempo
       * desde PostgreSQL.
       *
       * Después calculamos la distancia
       * exacta en el servidor.
       */
      const possibleReports =
        await prisma.report.findMany({
          where: {
            id: {
              not: report.id,
            },

            createdAt: {
              gte: startTime,
              lte: endTime,
            },
          },

          select: {
            id: true,
            category: true,
            description: true,
            latitude: true,
            longitude: true,
            createdAt: true,
          },

          orderBy: {
            createdAt: "desc",
          },

          take: 100,
        });

      nearbyReports =
        possibleReports
          .filter(
            (
              candidate
            ): candidate is typeof candidate & {
              latitude: number;
              longitude: number;
            } =>
              candidate.latitude !== null &&
              candidate.longitude !== null
          )
          .map((candidate) => {
            const distanceKm =
              calculateDistanceKm(
                report.latitude!,
                report.longitude!,
                candidate.latitude,
                candidate.longitude
              );

            return {
              ...candidate,
              distanceKm,
            };
          })
          .filter(
            (candidate) =>
              Number.isFinite(
                candidate.distanceKm
              ) &&
              candidate.distanceKm <=
                RELATED_RADIUS_KM
          )
          .sort(
            (a, b) =>
              a.distanceKm -
              b.distanceKm
          );
    }

    console.log(
      `[IA] Reporte #${report.id}: ${nearbyReports.length} posibles reportes cercanos dentro de ${RELATED_RADIUS_KM} km y ${RELATED_TIME_MINUTES} minutos.`
    );

    /* =====================================================
       PREPARAR INFORMACIÓN DE CANDIDATOS
    ===================================================== */

    const nearbyReportsText =
      nearbyReports.length === 0
        ? "No se encontraron otros reportes cercanos en tiempo y ubicación."
        : nearbyReports
            .map((candidate) => {
              const minutesDifference =
                Math.round(
                  Math.abs(
                    candidate.createdAt.getTime() -
                      report.createdAt.getTime()
                  ) /
                    60000
                );

              return `
REPORTE #${candidate.id}
Categoría: ${candidate.category}
Descripción: ${candidate.description}
Distancia aproximada: ${Math.round(
                candidate.distanceKm * 1000
              )} metros
Diferencia temporal: ${minutesDifference} minutos
Fecha: ${candidate.createdAt.toISOString()}
`.trim();
            })
            .join("\n\n");

    /* =====================================================
       PROMPT
    ===================================================== */

    const prompt = `
Sos el sistema de inteligencia artificial de apoyo
del Centro de Monitoreo de Alerta Otamendi.

Analizás reportes enviados por vecinos.

Tu tarea tiene DOS partes:

1. Analizar el reporte principal.
2. Revisar posibles reportes cercanos y determinar
   si alguno podría describir el mismo hecho.

==================================================
REPORTE PRINCIPAL
==================================================

Número:
#${report.id}

Categoría elegida:
${report.category}

Descripción:
${report.description}

Ubicación:
${
  report.latitude !== null &&
  report.longitude !== null
    ? `Latitud ${report.latitude}, longitud ${report.longitude}`
    : "No disponible"
}

Fecha:
${report.createdAt.toISOString()}

==================================================
POSIBLES REPORTES CERCANOS
==================================================

${nearbyReportsText}

==================================================
REGLAS GENERALES
==================================================

- No inventes información.
- No afirmes como comprobado algo que solamente fue reportado.
- No identifiques ni acuses personas.
- No descartes automáticamente ningún reporte.
- No unas reportes automáticamente.
- La decisión final siempre corresponde al operador humano.

==================================================
PRIORIDAD
==================================================

- critical:
  peligro inmediato, violencia, delito en curso,
  incendio activo o riesgo grave para personas.

- high:
  hechos importantes que requieren revisión rápida.

- medium:
  hechos relevantes sin peligro inmediato evidente.

- low:
  información poco urgente, ambigua o posiblemente irrelevante.

==================================================
POSIBLE SPAM
==================================================

possibleSpam solamente debe ser true si existen
señales claras de:

- prueba del sistema,
- texto absurdo,
- publicidad,
- contenido irrelevante.

No marques spam solamente porque la descripción
sea corta o tenga errores de escritura.

==================================================
RELACIÓN ENTRE REPORTES
==================================================

Analizá los posibles reportes cercanos.

Un reporte puede considerarse posiblemente relacionado
cuando existan coincidencias razonables como:

- mismo tipo de hecho,
- misma persona o descripción física,
- mismo vehículo,
- mismo color,
- misma dirección de desplazamiento,
- mismo lugar o zona,
- misma situación,
- continuidad temporal razonable.

La cercanía geográfica por sí sola NO alcanza.

La cercanía temporal por sí sola NO alcanza.

Si no hay evidencia suficiente de relación:

relatedReports debe ser false.

relatedReportIds debe ser [].

relationSummary debe explicar brevemente
que no se detectaron coincidencias suficientes.

Si existen coincidencias razonables:

relatedReports debe ser true.

relatedReportIds debe contener solamente
los IDs que realmente podrían corresponder
al mismo hecho.

relationSummary debe explicar de manera breve
por qué podrían estar relacionados.

confidence debe estar entre 0 y 1.

Recordá:
tu análisis es solamente apoyo para el operador.
`.trim();

    /* =====================================================
       LLAMAR OPENAI
    ===================================================== */

    const response =
      await fetch(
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
            model:
              "gpt-5.6-luna",

            reasoning: {
              effort: "none",
            },

            input: prompt,

            text: {
              format: {
                type:
                  "json_schema",

                name:
                  "alerta_otamendi_analysis",

                strict: true,

                schema: {
                  type: "object",

                  properties: {
                    category: {
                      type: "string",
                      enum: [
                        ...VALID_CATEGORIES,
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

                    relatedReports: {
                      type: "boolean",
                    },

                    relatedReportIds: {
                      type: "array",

                      items: {
                        type: "integer",
                      },
                    },

                    relationSummary: {
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
                    "relatedReports",
                    "relatedReportIds",
                    "relationSummary",
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

    /* =====================================================
       ERROR OPENAI
    ===================================================== */

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
        {
          status: 502,
        }
      );
    }

    /* =====================================================
       LEER RESPUESTA IA
    ===================================================== */

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
        {
          status: 502,
        }
      );
    }

    let analysis: AiAnalysis;

    try {
      analysis =
        JSON.parse(
          outputText
        ) as AiAnalysis;
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
        {
          status: 502,
        }
      );
    }

    /* =====================================================
       SEGURIDAD EXTRA:
       SOLO PERMITIR IDs DE CANDIDATOS REALES
    ===================================================== */

    const allowedRelatedIds =
      new Set(
        nearbyReports.map(
          (candidate) =>
            candidate.id
        )
      );

    analysis.relatedReportIds =
      analysis.relatedReportIds.filter(
        (id) =>
          allowedRelatedIds.has(id)
      );

    /*
     * Si después del filtro no quedó ningún ID,
     * forzamos relatedReports a false.
     */
    if (
      analysis.relatedReportIds.length ===
      0
    ) {
      analysis.relatedReports =
        false;
    }

    /* =====================================================
       GUARDAR ANÁLISIS EXISTENTE
       TODAVÍA NO GUARDAMOS LAS RELACIONES
    ===================================================== */

    const updatedReport =
      await prisma.report.update({
        where: {
          id: report.id,
        },

        data: {
          aiAnalyzed: true,

          aiCategory:
            analysis.category,

          aiPriority:
            analysis.priority,

          aiSummary:
            analysis.summary,

          aiConfidence:
            analysis.confidence,

          aiPossibleSpam:
            analysis.possibleSpam,

          aiReason:
            analysis.reason,

          aiAnalyzedAt:
            new Date(),
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

    /* =====================================================
       COMPARAR FOTO CON VEHÍCULOS ACTIVOS EN SEGUIMIENTO
    ===================================================== */

    const vehicleMatches: Array<{
      id: number;
      vehicleWatchId: number;
      sourceReportId: number;
      reportId: number;
      confidence: number;
      reason: string;
      imageUrl: string;
      status: string;
    }> = [];

    if (report.imageUrl) {
      const activeVehicleWatches = await prisma.vehicleWatch.findMany({
        where: {
          active: true,
          sourceReportId: {
            not: report.id,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      });

      for (const vehicle of activeVehicleWatches) {
        const referenceDescription = [
          vehicle.vehicleType ? `Tipo: ${vehicle.vehicleType}` : null,
          vehicle.make ? `Marca: ${vehicle.make}` : null,
          vehicle.model ? `Modelo: ${vehicle.model}` : null,
          vehicle.color ? `Color: ${vehicle.color}` : null,
          vehicle.plate ? `Patente: ${vehicle.plate}` : null,
          vehicle.distinctive ? `Rasgos: ${vehicle.distinctive}` : null,
          vehicle.visualSummary
            ? `Resumen visual: ${vehicle.visualSummary}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        const comparison = await compareVehicleImages({
          apiKey,
          referenceImageUrl: vehicle.imageUrl,
          candidateImageUrl: report.imageUrl,
          referenceDescription:
            referenceDescription || "Sin datos descriptivos adicionales.",
        });

        if (!comparison) {
          continue;
        }

        const confidence = Math.max(
          0,
          Math.min(1, comparison.confidence)
        );

        if (!comparison.possibleMatch || confidence < 0.75) {
          continue;
        }

        const savedMatch = await prisma.vehicleMatch.upsert({
          where: {
            vehicleWatchId_reportId: {
              vehicleWatchId: vehicle.id,
              reportId: report.id,
            },
          },
          update: {
            sourceReportId: vehicle.sourceReportId,
            imageUrl: report.imageUrl,
            confidence,
            reason: comparison.reason,
            detectedPlate: comparison.detectedPlate,
            detectedMake: comparison.detectedMake,
            detectedModel: comparison.detectedModel,
            detectedColor: comparison.detectedColor,
            detectedVehicleType: comparison.detectedVehicleType,
            detectedDistinctive: comparison.detectedDistinctive,
            visualSummary: comparison.visualSummary,
            status: "pendiente",
          },
          create: {
            vehicleWatchId: vehicle.id,
            reportId: report.id,
            sourceReportId: vehicle.sourceReportId,
            imageUrl: report.imageUrl,
            confidence,
            reason: comparison.reason,
            detectedPlate: comparison.detectedPlate,
            detectedMake: comparison.detectedMake,
            detectedModel: comparison.detectedModel,
            detectedColor: comparison.detectedColor,
            detectedVehicleType: comparison.detectedVehicleType,
            detectedDistinctive: comparison.detectedDistinctive,
            visualSummary: comparison.visualSummary,
            status: "pendiente",
          },
        });

        vehicleMatches.push(savedMatch);
      }
    }

    /* =====================================================
       RESPUESTA AL CENTRO DE MONITOREO
    ===================================================== */

    return NextResponse.json({
      success: true,

      analysis,

      vehicleMatches,

      relatedSearch: {
        radiusKm:
          RELATED_RADIUS_KM,

        timeMinutes:
          RELATED_TIME_MINUTES,

        candidatesFound:
          nearbyReports.length,

        candidates:
          nearbyReports.map(
            (candidate) => ({
              id:
                candidate.id,

              category:
                candidate.category,

              distanceMeters:
                Math.round(
                  candidate.distanceKm *
                    1000
                ),

              createdAt:
                candidate.createdAt,
            })
          ),
      },

      report:
        updatedReport,
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
      {
        status: 500,
      }
    );
  }
}
