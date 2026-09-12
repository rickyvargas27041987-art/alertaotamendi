import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";

export async function GET(request: Request) {
  const actor = await getMonitorActor();
  if (!actor) {
    return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ success: false, error: "Coordenadas inválidas." }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "es");

    const response = await fetch(url, {
      headers: { "User-Agent": "AlertaOtamendi/1.0 (centro-monitoreo)" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    const data = await response.json();
    const a = data?.address ?? {};
    const street = a.road ?? a.pedestrian ?? a.residential ?? a.path ?? null;
    const number = a.house_number ?? null;
    const locality = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? null;
    const district = a.municipality ?? a.county ?? null;
    const province = a.state ?? null;
    const streetLine = [street, number].filter(Boolean).join(" ");
    const areaLine = [locality, district, province].filter(Boolean).join(" · ");

    return NextResponse.json({
      success: true,
      address: streetLine || data?.display_name || "Ubicación sin calle identificada",
      area: areaLine,
      displayName: data?.display_name ?? null,
    });
  } catch (error) {
    console.error("Error resolviendo dirección:", error);
    return NextResponse.json({ success: false, error: "No se pudo obtener la dirección." }, { status: 502 });
  }
}
