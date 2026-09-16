import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type Pharmacy = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
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
  nwr["amenity"="pharmacy"](around:${radiusMeters},${lat},${lon});
  nwr["healthcare"="pharmacy"](around:${radiusMeters},${lat},${lon});
  nwr["shop"="pharmacy"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`;
}

async function requestOverpass(
  endpoint: string,
  query: string,
  timeoutMs: number
): Promise<OverpassElement[]> {
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

    if (!response.ok) {
      throw new Error(`El servidor de mapas respondió ${response.status}.`);
    }

    const data = await response.json();
    return Array.isArray(data.elements) ? data.elements : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOverpassElements(query: string) {
  try {
    return await requestOverpass(OVERPASS_ENDPOINTS[0], query, 4500);
  } catch (primaryError) {
    console.warn("Servidor principal de farmacias no disponible:", primaryError);
  }

  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.slice(1).map((endpoint) =>
        requestOverpass(endpoint, query, 7000)
      )
    );
  } catch {
    throw new Error("Ningún servidor de mapas respondió a tiempo.");
  }
}

function normalizePharmacies(
  elements: OverpassElement[],
  lat: number,
  lon: number
) {
  const uniquePharmacies = new Map<string, Pharmacy>();

  for (const element of elements) {
    const pharmacyLat = element.lat ?? element.center?.lat;
    const pharmacyLon = element.lon ?? element.center?.lon;

    if (pharmacyLat === undefined || pharmacyLon === undefined) continue;

    const id = `${element.type}-${element.id}`;
    const tags = element.tags || {};
    const phone =
      tags.phone ||
      tags["contact:phone"] ||
      tags["contact:mobile"] ||
      null;

    uniquePharmacies.set(id, {
      id,
      name: tags.name || tags.brand || "Farmacia",
      address: buildAddress(tags),
      phone,
      latitude: pharmacyLat,
      longitude: pharmacyLon,
      distanceKm: distanceKm(lat, lon, pharmacyLat, pharmacyLon),
    });
  }

  return [...uniquePharmacies.values()].sort(
    (a, b) => a.distanceKm - b.distanceKm
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return NextResponse.json(
        { success: false, message: "Ubicación inválida." },
        { status: 400 }
      );
    }

    const elements = await fetchOverpassElements(buildQuery(lat, lon, 10000));
    const allPharmacies = normalizePharmacies(elements, lat, lon);
    const pharmaciesWithin5Km = allPharmacies.filter(
      (pharmacy) => pharmacy.distanceKm <= 5
    );
    const radiusKm = pharmaciesWithin5Km.length >= 3 ? 5 : 10;
    const pharmacies = (
      radiusKm === 5 ? pharmaciesWithin5Km : allPharmacies
    ).slice(0, 12);

    return NextResponse.json({ success: true, radiusKm, pharmacies });
  } catch (error) {
    console.error("Error buscando farmacias:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "El servicio de mapas no respondió. Podés reintentar o buscar en Google Maps.",
      },
      { status: 503 }
    );
  }
}
