import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

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

function buildQuery(lat: number, lon: number, radiusMeters: number) {
  return `
[out:json][timeout:8];
(
  nwr["amenity"="police"](around:${radiusMeters},${lat},${lon});
  nwr["office"="government"]["government"="police"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`;
}

async function requestOverpass(endpoint: string, query: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Alerta-Otamendi/1.0",
      },
      body: new URLSearchParams({ data: query }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Servidor respondió ${response.status}.`);
    const data = await response.json();
    return Array.isArray(data.elements) ? data.elements as OverpassElement[] : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOverpassElements(query: string) {
  try {
    return await requestOverpass(OVERPASS_ENDPOINTS[0], query, 4500);
  } catch (error) {
    console.warn("Servidor principal de comisarías no disponible:", error);
  }
  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.slice(1).map((endpoint) => requestOverpass(endpoint, query, 7000))
    );
  } catch {
    throw new Error("Ningún servidor de mapas respondió a tiempo.");
  }
}

async function searchPoliceStations(lat: number, lon: number, radiusMeters: number) {
  const elements = await fetchOverpassElements(buildQuery(lat, lon, radiusMeters));

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
      { success: false, message: "El servicio de mapas no respondió. Podés reintentar o buscar en Google Maps." },
      { status: 503 }
    );
  }
}
