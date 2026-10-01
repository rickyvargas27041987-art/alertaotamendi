import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const ENDPOINTS = [
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

function address(tags: Record<string, string>) {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const city =
    tags["addr:city"] ||
    tags["addr:town"] ||
    tags["addr:village"] ||
    tags["addr:suburb"];
  return [[street, number].filter(Boolean).join(" "), city]
    .filter(Boolean)
    .join(", ") || null;
}

function kind(tags: Record<string, string>) {
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "Hospital";
  if (tags.amenity === "clinic" || tags.healthcare === "clinic") return "Clínica / centro médico";
  if (tags.healthcare === "centre") return "Centro de salud / CAPS";
  if (tags.amenity === "doctors" || tags.healthcare === "doctor") return "Consultorios médicos";
  return "Centro de atención";
}

function query(lat: number, lon: number, radius: number) {
  return `
[out:json][timeout:9];
(
  nwr["amenity"="hospital"](around:${radius},${lat},${lon});
  nwr["amenity"="clinic"](around:${radius},${lat},${lon});
  nwr["amenity"="doctors"](around:${radius},${lat},${lon});
  nwr["healthcare"="hospital"](around:${radius},${lat},${lon});
  nwr["healthcare"="clinic"](around:${radius},${lat},${lon});
  nwr["healthcare"="centre"](around:${radius},${lat},${lon});
  nwr["healthcare"="doctor"](around:${radius},${lat},${lon});
);
out center tags;
`;
}

async function request(endpoint: string, q: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Alerta-Otamendi/1.0",
      },
      body: new URLSearchParams({ data: q }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Servidor respondió ${response.status}.`);
    const data = await response.json();
    return Array.isArray(data.elements) ? data.elements as OverpassElement[] : [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchElements(q: string) {
  try {
    return await request(ENDPOINTS[0], q, 5000);
  } catch {
    return await Promise.any(
      ENDPOINTS.slice(1).map((endpoint) => request(endpoint, q, 7500))
    );
  }
}

async function search(lat: number, lon: number, radiusMeters: number) {
  const elements = await fetchElements(query(lat, lon, radiusMeters));
  const unique = new Map<string, {
    id: string;
    name: string;
    kind: string;
    address: string | null;
    phone: string | null;
    openingHours: string | null;
    emergency: boolean;
    latitude: number;
    longitude: number;
    distanceKm: number;
  }>();

  for (const element of elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude === undefined || longitude === undefined) continue;

    const tags = element.tags || {};
    const id = `${element.type}-${element.id}`;

    unique.set(id, {
      id,
      name: tags.name || tags.official_name || tags.operator || kind(tags),
      kind: kind(tags),
      address: address(tags),
      phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null,
      openingHours: tags.opening_hours || null,
      emergency: tags.emergency === "yes",
      latitude,
      longitude,
      distanceKm: distanceKm(lat, lon, latitude, longitude),
    });
  }

  return [...unique.values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 15);
}

export async function GET(requestObject: Request) {
  try {
    const { searchParams } = new URL(requestObject.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { success: false, message: "Ubicación inválida." },
        { status: 400 }
      );
    }

    let radiusKm = 8;
    let centers = await search(lat, lon, 8000);

    if (centers.length < 3) {
      radiusKm = 20;
      centers = await search(lat, lon, 20000);
    }

    return NextResponse.json({ success: true, radiusKm, centers });
  } catch (error) {
    console.error("Error buscando centros de salud:", error);
    return NextResponse.json(
      {
        success: false,
        message: "El servicio de mapas no respondió. Podés reintentar o buscar en Google Maps.",
      },
      { status: 503 }
    );
  }
}
