import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      category,
      description,
      latitude,
      longitude,
    } = body;

    if (!description) {
      return NextResponse.json(
        { error: "Falta la descripción del reporte" },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          input: `
Sos el sistema de inteligencia artificial del Centro de Monitoreo
de Alerta Otamendi.

Tu tarea es analizar reportes ciudadanos.

REPORTE:

Categoría seleccionada por el vecino:
${category || "Sin categoría"}

Descripción:
${description}

Ubicación:
Latitud: ${latitude ?? "No disponible"}
Longitud: ${longitude ?? "No disponible"}

Analizá el reporte y respondé SOLAMENTE con JSON válido.

Formato obligatorio:

{
  "category": "categoria detectada",
  "priority": "critica | alta | normal | baja",
  "summary": "resumen breve para el operador",
  "confidence": 0,
  "possibleSpam": false,
  "reason": "explicación breve"
}

Reglas:

- No inventes hechos.
- Si hay riesgo inmediato para personas, incendio, delito en curso
  o emergencia grave, aumentá la prioridad.
- Si el mensaje parece una prueba, broma, texto sin sentido,
  publicidad o reporte claramente irrelevante, marcá possibleSpam true.
- confidence debe ser un número entre 0 y 1.
- No descartes automáticamente un reporte solamente porque esté mal escrito.
- Ante dudas importantes, preferí revisión humana.
`,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();

      console.error("OpenAI error:", error);

      return NextResponse.json(
        { error: "No se pudo analizar el reporte con IA" },
        { status: 500 }
      );
    }

    const data = await response.json();

    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "La IA no devolvió un análisis" },
        { status: 500 }
      );
    }

    let analysis;

    try {
      analysis = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: "La IA devolvió una respuesta inválida",
          raw: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("AI analyze error:", error);

    return NextResponse.json(
      { error: "Error interno analizando el reporte" },
      { status: 500 }
    );
  }
}
