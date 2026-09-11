import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildAddress(tags: Record<string, string>) {
  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
  const firstLine = [street, houseNumber].filter(Boolean).join(" ");
  return [firstLine, city].filter(Boolean).join(", ") || null;
}

async function searchPoliceStations(lat: number, lon: number, radiusMeters: number) {
  const query = `
[out:json][timeout:20];
(
  node["amenity"="police"](around:${radiusMeters},${lat},${lon});
  way["amenity"="police"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="police"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Alerta-Otamendi/1.0",
    },
    body: new URLSearchParams({ data: query }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("El servicio de mapas no respondió correctamente.");

  const data = await response.json();
  const elements: OverpassElement[] = Array.isArray(data.elements) ? data.elements : [];

  return elements
    .map((element) => {
      const stationLat = element.lat ?? element.center?.lat;
      const stationLon = element.lon ?? element.center?.lon;
      if (stationLat === undefined || stationLon === undefined) return null;
      const tags = element.tags || {};
      const name = tags.name || tags.official_name || "Dependencia policial";
      const phone = tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null;
      return {
        id: `${element.type}-${element.id}`,
        name,
        address: buildAddress(tags),
        phone,
        latitude: stationLat,
        longitude: stationLon,
        distanceKm: distanceKm(lat, lon, stationLat, stationLon),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ success: false, message: "Ubicación inválida." }, { status: 400 });
    }

    let radiusKm = 5;
    let stations = await searchPoliceStations(lat, lon, 5000);
    if (stations.length < 2) {
      radiusKm = 15;
      stations = await searchPoliceStations(lat, lon, 15000);
    }

    return NextResponse.json({ success: true, radiusKm, stations });
  } catch (error) {
    console.error("Error buscando comisarías:", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron consultar las comisarías en este momento." },
      { status: 500 }
    );
  }
}
