import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type HealthCenter = {
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
};

type CacheEntry = {
  createdAt: number;
  centers: HealthCenter[];
  radiusKm: number;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number) {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

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
  return [[street, number].filter(Boolean).join(" "), city].filter(Boolean).join(", ") || null;
}

function kind(tags: Record<string, string>) {
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "Hospital";
  if (tags.amenity === "clinic" || tags.healthcare === "clinic") return "Clínica / centro médico";
  if (tags.healthcare === "centre") return "Centro de salud / CAPS";
  if (tags.amenity === "doctors" || tags.healthcare === "doctor") return "Consultorios médicos";
  return "Centro de atención";
}

function query(lat: number, lon: number) {
  return `
[out:json][timeout:10];
(
  nwr["amenity"="hospital"](around:20000,${lat},${lon});
  nwr["amenity"="clinic"](around:20000,${lat},${lon});
  nwr["amenity"="doctors"](around:20000,${lat},${lon});
  nwr["healthcare"="hospital"](around:20000,${lat},${lon});
  nwr["healthcare"="clinic"](around:20000,${lat},${lon});
  nwr["healthcare"="centre"](around:20000,${lat},${lon});
  nwr["healthcare"="doctor"](around:20000,${lat},${lon});
);
out center tags;
`;
}

async function request(endpoint: string, q: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
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
    const elements = Array.isArray(data.elements) ? (data.elements as OverpassElement[]) : [];
    if (elements.length === 0) throw new Error("El servidor no devolvió centros de salud.");
    return elements;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchElements(q: string) {
  return Promise.any(ENDPOINTS.map((endpoint) => request(endpoint, q)));
}

function normalizeCenters(elements: OverpassElement[], lat: number, lon: number) {
  const unique = new Map<string, HealthCenter>();

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
    .filter((center) => center.distanceKm <= 20)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function GET(requestObject: Request) {
  try {
    const { searchParams } = new URL(requestObject.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ success: false, message: "Ubicación inválida." }, { status: 400 });
    }

    const key = cacheKey(lat, lon);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        radiusKm: cached.radiusKm,
        centers: cached.centers,
        source: "cache",
      });
    }

    const elements = await fetchElements(query(lat, lon));
    const allCenters = normalizeCenters(elements, lat, lon);

    const nearby = allCenters.filter((center) => center.distanceKm <= 8);
    const radiusKm = nearby.length >= 3 ? 8 : 20;
    const centers = allCenters.filter((center) => center.distanceKm <= radiusKm).slice(0, 15);

    cache.set(key, { createdAt: Date.now(), centers, radiusKm });

    return NextResponse.json({ success: true, radiusKm, centers, source: "live" });
  } catch (error) {
    console.error("Error buscando centros de salud:", error);
    return NextResponse.json(
      {
        success: false,
        message: "El servicio de mapas está demorando más de lo normal. Podés reintentar en unos segundos.",
      },
      { status: 503 }
    );
  }
}
