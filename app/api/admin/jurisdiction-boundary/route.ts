import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";

type BoundaryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export async function GET(request: Request) {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const province = searchParams.get("province")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";
  if (!province || !district) {
    return NextResponse.json({ success: false, error: "Jurisdicción incompleta." }, { status: 400 });
  }
  try {
    const territorialName = province === "Buenos Aires" ? `Partido de ${district}` : `Departamento de ${district}`;
    const query = new URLSearchParams({
      q: `${territorialName}, ${province}, Argentina`,
      format: "jsonv2",
      countrycodes: "ar",
      polygon_geojson: "1",
      addressdetails: "1",
      limit: "5",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
      headers: { "User-Agent": "AlertaOtamendi/1.0 (jurisdiction-boundaries)" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    const results = await response.json() as Array<{ geojson?: BoundaryGeometry; display_name?: string }>;
    const match = results.find((item) => item.geojson && ["Polygon", "MultiPolygon"].includes(item.geojson.type));
    if (!match?.geojson) {
      return NextResponse.json({ success: false, error: "Límite territorial no disponible." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      boundary: {
        type: "Feature",
        properties: { province, district, label: match.display_name || district },
        geometry: match.geojson,
      },
    }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("No se pudo cargar el límite territorial:", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar el límite territorial." }, { status: 502 });
  }
}
