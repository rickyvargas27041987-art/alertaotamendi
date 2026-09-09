import { NextResponse } from "next/server";

const GEOREF_BASE = "https://apis.datos.gob.ar/georef/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");

    if (tipo === "provincias") {
      const response = await fetch(
        `${GEOREF_BASE}/provincias?campos=id,nombre&max=100&orden=nombre`,
        { next: { revalidate: 86400 } }
      );
      if (!response.ok) throw new Error(`GeoRef ${response.status}`);
      const data = await response.json();
      return NextResponse.json({ success: true, provincias: data.provincias ?? [] });
    }

    if (tipo === "localidades") {
      const provincia = searchParams.get("provincia")?.trim();
      if (!provincia) {
        return NextResponse.json(
          { success: false, message: "Falta provincia." },
          { status: 400 }
        );
      }

      const response = await fetch(
        `${GEOREF_BASE}/localidades?provincia=${encodeURIComponent(provincia)}&campos=id,nombre,centroide&max=5000&orden=nombre`,
        { next: { revalidate: 86400 } }
      );
      if (!response.ok) throw new Error(`GeoRef ${response.status}`);
      const data = await response.json();
      return NextResponse.json({ success: true, localidades: data.localidades ?? [] });
    }

    return NextResponse.json(
      { success: false, message: "Tipo de consulta inválido." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error consultando GeoRef:", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron cargar provincias/localidades." },
      { status: 502 }
    );
  }
}
