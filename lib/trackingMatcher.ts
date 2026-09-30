import { prisma } from "@/lib/prisma";

type ReportForTracking = {
  id: number;
  category: string;
  description: string;
  imageUrl: string | null;
  province: string | null;
  district: string | null;
  locality: string | null;
};

type VisualMatch = {
  targetId: number;
  confidence: number;
  reason: string;
};

function normalize(text: string) {
  return text
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string) {
  const stop = new Set([
    "para","pero","como","con","sin","una","uno","unos","unas","que","del","las","los",
    "por","muy","esta","este","ese","esa","sobre","persona","vehiculo","vehículo","auto",
    "moto","camioneta","sospechosa","sospechoso","color","marca","modelo","aproximadamente"
  ]);
  return new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length >= 3 && !stop.has(word))
  );
}

function overlapScore(a: string, b: string) {
  const aw = words(a);
  const bw = words(b);
  if (!aw.size || !bw.size) return 0;

  let shared = 0;
  aw.forEach((word) => {
    if (bw.has(word)) shared += 1;
  });

  return shared / Math.max(aw.size, bw.size);
}

function targetText(target: {
  title: string;
  reason: string;
  description: string | null;
  personAge: string | null;
  personFeatures: string | null;
  vehiclePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleType: string | null;
  distinctive: string | null;
}) {
  return [
    target.title,
    target.reason,
    target.description,
    target.personAge,
    target.personFeatures,
    target.vehiclePlate,
    target.vehicleMake,
    target.vehicleModel,
    target.vehicleColor,
    target.vehicleType,
    target.distinctive,
  ]
    .filter(Boolean)
    .join(" ");
}

function exactVehiclePlateMatch(reportDescription: string, plate: string | null) {
  if (!plate) return false;
  const compactReport = normalize(reportDescription).replace(/\s/g, "");
  const compactPlate = normalize(plate).replace(/\s/g, "");
  return compactPlate.length >= 5 && compactReport.includes(compactPlate);
}

function findOutputText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) return null;

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue;
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

async function compareImages(
  report: ReportForTracking,
  type: "PERSON" | "VEHICLE",
  targets: Array<{
    id: number;
    title: string;
    imageUrl: string | null;
    reason: string;
    description: string | null;
    personAge: string | null;
    personFeatures: string | null;
    vehiclePlate: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleColor: string | null;
    vehicleType: string | null;
    distinctive: string | null;
  }>
): Promise<VisualMatch[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !report.imageUrl) return [];

  const withImages = targets.filter((target) => target.imageUrl).slice(0, 8);
  if (!withImages.length) return [];

  const referenceContent: any[] = [];

  for (const target of withImages) {
    referenceContent.push({
      type: "input_text",
      text: `Referencia targetId ${target.id}. ${targetText(target)}`,
    });
    referenceContent.push({
      type: "input_image",
      image_url: target.imageUrl,
      detail: "high",
    });
  }

  const personRules = `
Para PERSONAS:
- NO identificar a la persona.
- NO usar reconocimiento facial.
- NO basarse en identidad, similitud de rostro ni biometría.
- Comparar solamente rasgos visibles no biométricos: ropa, accesorios, mochila, calzado,
  contextura aproximada, elementos distintivos y contexto visible.
- Si la evidencia no alcanza, usar una confianza baja.
  `.trim();

  const vehicleRules = `
Para VEHÍCULOS:
- Comparar patente sólo si es claramente legible.
- Comparar tipo, color, marca/modelo aproximados, daños, calcomanías, llantas,
  accesorios y otros rasgos distintivos.
- No inventar detalles no visibles.
  `.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
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
Sos un asistente de apoyo para un Centro de Monitoreo.
Compará la imagen de un REPORTE NUEVO con varias REFERENCIAS DE SEGUIMIENTO.

Tipo: ${type}

REGLAS:
- El resultado es sólo una POSIBLE COINCIDENCIA para revisión humana.
- Nunca afirmar que una persona o vehículo es definitivamente el mismo.
- Ser conservador con la confianza.
${type === "PERSON" ? personRules : vehicleRules}

Devolver únicamente las referencias que tengan una similitud visual útil.
Confidence debe estar entre 0 y 1.
                `.trim(),
              },
              {
                type: "input_text",
                text: `REPORTE NUEVO #${report.id}: ${report.description}`,
              },
              {
                type: "input_image",
                image_url: report.imageUrl,
                detail: "high",
              },
              ...referenceContent,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tracking_visual_matches",
            strict: true,
            schema: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      targetId: { type: "integer" },
                      confidence: { type: "number" },
                      reason: { type: "string" },
                    },
                    required: ["targetId", "confidence", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["matches"],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(40_000),
    });

    if (!response.ok) {
      console.error("[TRACKING] Error OpenAI:", response.status, (await response.text()).slice(0, 600));
      return [];
    }

    const outputText = findOutputText(await response.json());
    if (!outputText) return [];

    const parsed = JSON.parse(outputText) as { matches?: VisualMatch[] };
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch (error) {
    console.error("[TRACKING] Error comparando imágenes:", error);
    return [];
  }
}

export async function evaluateTrackingMatches(report: ReportForTracking) {
  const type =
    report.category === "Persona sospechosa"
      ? "PERSON"
      : report.category === "Vehículo sospechoso"
      ? "VEHICLE"
      : null;

  if (!type) return;

  // IMPORTANTE:
  // No hay filtro por provincia, partido ni localidad.
  // Un seguimiento puede coincidir con un reporte de cualquier punto del país.
  const targets = await prisma.trackingTarget.findMany({
    where: {
      active: true,
      type,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 100,
  });

  if (!targets.length) return;

  const scored = targets.map((target) => {
    const reference = targetText(target);
    let score = overlapScore(report.description, reference);

    if (
      type === "VEHICLE" &&
      exactVehiclePlateMatch(report.description, target.vehiclePlate)
    ) {
      score = Math.max(score, 0.99);
    }

    return { target, score };
  });

  const visualCandidates = scored
    .slice()
    .sort((a, b) => {
      const imageA = a.target.imageUrl ? 1 : 0;
      const imageB = b.target.imageUrl ? 1 : 0;
      if (imageA !== imageB) return imageB - imageA;
      return b.score - a.score;
    })
    .map((item) => item.target);

  const visualMatches = await compareImages(report, type, visualCandidates);
  const visualByTarget = new Map(
    visualMatches.map((match) => [
      match.targetId,
      {
        confidence: Math.max(0, Math.min(1, Number(match.confidence) || 0)),
        reason: String(match.reason || "").trim(),
      },
    ])
  );

  for (const { target, score: textScore } of scored) {
    const visual = visualByTarget.get(target.id);
    const visualScore = visual?.confidence ?? 0;
    const exactPlate =
      type === "VEHICLE" &&
      exactVehiclePlateMatch(report.description, target.vehiclePlate);

    const confidence = exactPlate
      ? 0.99
      : Math.max(textScore, visualScore);

    // Umbral alto: preferimos perder alguna coincidencia dudosa antes
    // que saturar al operador con falsos positivos.
    if (confidence < 0.82) continue;

    const reasonParts = [];
    if (exactPlate) reasonParts.push("Patente coincidente en la descripción.");
    if (textScore >= 0.82) reasonParts.push("Descripción con alta similitud.");
    if (visual?.reason) reasonParts.push(visual.reason);

    const reason =
      reasonParts.join(" ") ||
      "Coincidencia automática con evidencia suficiente para revisión.";

    await prisma.trackingMatch.upsert({
      where: {
        trackingTargetId_reportId: {
          trackingTargetId: target.id,
          reportId: report.id,
        },
      },
      update: {
        confidence,
        reason,
        status: "pendiente",
        reportImageUrl: report.imageUrl,
        reportCategory: report.category,
        reportProvince: report.province,
        reportDistrict: report.district,
        reportLocality: report.locality,
      },
      create: {
        trackingTargetId: target.id,
        reportId: report.id,
        confidence,
        reason,
        status: "pendiente",
        reportImageUrl: report.imageUrl,
        reportCategory: report.category,
        reportProvince: report.province,
        reportDistrict: report.district,
        reportLocality: report.locality,
      },
    });

    console.log(
      `[TRACKING] Posible coincidencia: seguimiento #${target.id} ↔ reporte #${report.id} (${Math.round(confidence * 100)}%)`
    );
  }
}
