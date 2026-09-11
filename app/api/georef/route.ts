import { NextResponse } from "next/server";

const GEOREF_BASE =
  "https://apis.datos.gob.ar/georef/api/v2.0";

type Provincia = {
  id: string;
  nombre: string;
};

type Localidad = {
  id: string;
  nombre: string;
  centroide: {
    lat: number;
    lon: number;
  };
};

/* =========================================================
   CONSULTA GEOREF
========================================================= */

async function fetchGeoRef(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `GeoRef respondió ${response.status}: ${text.slice(
        0,
        500
      )}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `GeoRef devolvió una respuesta que no es JSON: ${text.slice(
        0,
        500
      )}`
    );
  }
}

/* =========================================================
   BUSCAR NOMBRE DE PROVINCIA
========================================================= */

async function obtenerNombreProvincia(
  provinciaId: string
): Promise<string | null> {
  try {
    const data = await fetchGeoRef(
      `${GEOREF_BASE}/provincias?id=${encodeURIComponent(
        provinciaId
      )}&campos=id,nombre&max=1`
    );

    const provincia =
      Array.isArray(data.provincias) &&
      data.provincias.length > 0
        ? (data.provincias[0] as Provincia)
        : null;

    return provincia?.nombre ?? null;
  } catch (error) {
    console.error(
      "Error buscando nombre de provincia:",
      error
    );

    return null;
  }
}

/* =========================================================
   BUSCAR LOCALIDADES
========================================================= */

async function obtenerLocalidades(
  provincia: string
): Promise<Localidad[]> {
  const url =
    `${GEOREF_BASE}/localidades` +
    `?provincia=${encodeURIComponent(
      provincia
    )}` +
    `&campos=id,nombre,centroide` +
    `&max=1000` +
    `&orden=nombre`;

  console.log(
    "[GEOREF] Consultando localidades:",
    url
  );

  const data =
    await fetchGeoRef(url);

  return Array.isArray(
    data.localidades
  )
    ? data.localidades
    : [];
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const tipo =
      searchParams.get("tipo");

    /* -----------------------------------------------------
       PROVINCIAS
    ----------------------------------------------------- */

    if (tipo === "provincias") {
      const data =
        await fetchGeoRef(
          `${GEOREF_BASE}/provincias?campos=id,nombre&max=100&orden=nombre`
        );

      const provincias =
        Array.isArray(
          data.provincias
        )
          ? data.provincias
          : [];

      return NextResponse.json(
        {
          success: true,
          provincias,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    }

    /* -----------------------------------------------------
       LOCALIDADES
    ----------------------------------------------------- */

    if (tipo === "localidades") {
      const provincia =
        searchParams
          .get("provincia")
          ?.trim();

      if (!provincia) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Falta provincia.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * PRIMER INTENTO
       * Usa exactamente lo que llega.
       */
      let localidades =
        await obtenerLocalidades(
          provincia
        );

      /*
       * SEGUNDO INTENTO
       * Si no devuelve nada, intenta resolver
       * un ID de provincia a su nombre.
       */
      if (
        localidades.length === 0
      ) {
        const nombreProvincia =
          await obtenerNombreProvincia(
            provincia
          );

        if (
          nombreProvincia &&
          nombreProvincia !== provincia
        ) {
          console.log(
            `[GEOREF] Reintentando con nombre de provincia: ${nombreProvincia}`
          );

          localidades =
            await obtenerLocalidades(
              nombreProvincia
            );
        }
      }

      /*
       * Filtrar registros inválidos.
       */
      localidades =
        localidades.filter(
          (localidad) =>
            localidad &&
            typeof localidad.id ===
              "string" &&
            typeof localidad.nombre ===
              "string" &&
            localidad.centroide &&
            Number.isFinite(
              localidad.centroide.lat
            ) &&
            Number.isFinite(
              localidad.centroide.lon
            )
        );

      /*
       * Ordenar por nombre.
       */
      localidades.sort(
        (a, b) =>
          a.nombre.localeCompare(
            b.nombre,
            "es"
          )
      );

      console.log(
        `[GEOREF] Provincia "${provincia}": ${localidades.length} localidades cargadas.`
      );

      return NextResponse.json(
        {
          success: true,
          localidades,
          total:
            localidades.length,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    }

    /* -----------------------------------------------------
       LÍMITES DE LOCALIDAD CENSAL
       Devuelve un bounding box oficial para que el mapa use
       el zoom máximo posible sin cortar la jurisdicción.
    ----------------------------------------------------- */

    if (tipo === "limites-localidad") {
      const id = searchParams.get("id")?.trim();
      if (!id) {
        return NextResponse.json({ success: false, message: "Falta id de localidad." }, { status: 400 });
      }

      const url = `${GEOREF_BASE}/localidades_censales?id=${encodeURIComponent(id)}&formato=geojson&max=1`;
      const data = await fetchGeoRef(url);
      const feature = Array.isArray(data.features) ? data.features[0] : null;
      const coordinates = feature?.geometry?.coordinates;

      const points: Array<[number, number]> = [];
      const collect = (value: unknown) => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
          points.push([value[1], value[0]]); // GeoJSON lon/lat -> Leaflet lat/lon
          return;
        }
        for (const child of value) collect(child);
      };
      collect(coordinates);

      if (points.length === 0) {
        return NextResponse.json({ success: false, message: "La localidad no tiene geometría disponible." }, { status: 404 });
      }

      const lats = points.map((p) => p[0]);
      const lons = points.map((p) => p[1]);
      const bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];

      return NextResponse.json({ success: true, bounds }, {
        headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
      });
    }

    /* -----------------------------------------------------
       TIPO INVÁLIDO
    ----------------------------------------------------- */

    return NextResponse.json(
      {
        success: false,
        message:
          "Tipo de consulta inválido.",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido";

    console.error(
      "Error consultando GeoRef:",
      message
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "No se pudieron cargar provincias/localidades.",
        detail:
          message,
      },
      {
        status: 502,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  }
}
