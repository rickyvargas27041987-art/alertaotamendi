export type Jurisdiction = {
  province: string | null;
  district: string | null;
  locality: string | null;
};

const EMPTY_JURISDICTION: Jurisdiction = {
  province: null,
  district: null,
  locality: null,
};

export async function resolveJurisdiction(
  latitude: number,
  longitude: number
): Promise<Jurisdiction> {
  try {
    const url = new URL("https://apis.datos.gob.ar/georef/api/ubicacion");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return EMPTY_JURISDICTION;

    const data = await response.json();
    const location = data?.ubicacion;

    return {
      province: location?.provincia?.nombre ?? null,
      district:
        location?.municipio?.nombre ??
        location?.departamento?.nombre ??
        null,
      locality: location?.localidad?.nombre ?? null,
    };
  } catch (error) {
    console.error("No se pudo resolver la jurisdicción:", error);
    return EMPTY_JURISDICTION;
  }
}
