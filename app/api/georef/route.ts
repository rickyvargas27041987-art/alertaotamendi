import { NextResponse } from "next/server";

const GEOREF_BASE =
  "https://apis.datos.gob.ar/georef/api";

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
  });

  if (!response.ok) {
    throw new Error(
      `GeoRef respondió ${response.status}`
    );
  }

  return response.json();
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
    `&max=5000` +
    `&orden=nombre`;

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
       *
       * Normalmente el selector nos envía
       * el ID de provincia.
       */
      let localidades =
        await obtenerLocalidades(
          provincia
        );

      /*
       * SEGUNDO INTENTO
       *
       * Si GeoRef no devuelve localidades
       * usando el ID, buscamos el nombre
       * real de la provincia y repetimos
       * la consulta.
       */
      if (
        localidades.length === 0
      ) {
        const nombreProvincia =
          await obtenerNombreProvincia(
            provincia
          );

        if (nombreProvincia) {
          console.log(
            `[GEOREF] Reintentando localidades con provincia "${nombreProvincia}".`
          );

          localidades =
            await obtenerLocalidades(
              nombreProvincia
            );
        }
      }

      /*
       * Quitamos registros inválidos.
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
              localidad.centroide
                .lat
            ) &&
            Number.isFinite(
              localidad.centroide
                .lon
            )
        );

      /*
       * Ordenamos nuevamente por nombre
       * para asegurarnos de que aparezcan
       * correctamente en el desplegable.
       */
      localidades.sort(
        (a, b) =>
          a.nombre.localeCompare(
            b.nombre,
            "es"
          )
      );

      console.log(
        `[GEOREF] Provincia ${provincia}: ${localidades.length} localidades cargadas.`
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
    console.error(
      "Error consultando GeoRef:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "No se pudieron cargar provincias/localidades.",
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
