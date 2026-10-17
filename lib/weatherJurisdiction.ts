import {
  provinciasArgentina,
  localidadesPorProvincia,
} from "@/app/data/localidadesArgentina";

export type WeatherMonitorZone = {
  province: string;
  district: string;
  locality: string | null;
};

export type WeatherJurisdictionArea = {
  description?: string | null;

  polygons?: number[][][];

  circles?: Array<{
    latitude: number;
    longitude: number;
    radiusKm: number;
  }>;
};

export type WeatherJurisdictionAlert = {
  areaDescription?: string | null;
  areas?: WeatherJurisdictionArea[];
};

const DEFAULT_ZONE: WeatherMonitorZone = {
  province: "Buenos Aires",
  district: "General Alvarado",
  locality: null,
};

/* =========================================================
   NORMALIZACIÓN
========================================================= */

function decodeEntities(
  value: string
) {
  let result = value;

  for (let i = 0; i < 3; i++) {
    const previous =
      result;

    result = result
      .replace(
        /&#x([0-9a-f]+);?/gi,
        (_, code) => {
          const number =
            parseInt(
              code,
              16
            );

          return Number.isFinite(
            number
          )
            ? String.fromCodePoint(
                number
              )
            : _;
        }
      )
      .replace(
        /&#([0-9]+);?/g,
        (_, code) => {
          const number =
            parseInt(
              code,
              10
            );

          return Number.isFinite(
            number
          )
            ? String.fromCodePoint(
                number
              )
            : _;
        }
      )
      .replace(
        /&nbsp;/gi,
        " "
      )
      .replace(
        /&amp;/gi,
        "&"
      );

    if (
      result === previous
    ) {
      break;
    }
  }

  return result;
}

function normalize(
  value: string | null | undefined
) {
  return decodeEntities(
    value ?? ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLocaleLowerCase(
      "es-AR"
    )
    .replace(
      /[^a-z0-9ñ]+/gi,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

/* =========================================================
   GEOMETRÍA
========================================================= */

function pointInPolygon(
  latitude: number,
  longitude: number,
  polygon: number[][]
) {
  let inside =
    false;

  for (
    let i = 0,
      j =
        polygon.length -
        1;
    i < polygon.length;
    j = i++
  ) {
    const yi =
      polygon[i]?.[0];

    const xi =
      polygon[i]?.[1];

    const yj =
      polygon[j]?.[0];

    const xj =
      polygon[j]?.[1];

    if (
      !Number.isFinite(
        yi
      ) ||
      !Number.isFinite(
        xi
      ) ||
      !Number.isFinite(
        yj
      ) ||
      !Number.isFinite(
        xj
      )
    ) {
      continue;
    }

    const intersects =
      yi > latitude !==
        yj > latitude &&
      longitude <
        ((xj - xi) *
          (latitude -
            yi)) /
          (yj -
            yi ||
            Number.EPSILON) +
          xi;

    if (intersects) {
      inside =
        !inside;
    }
  }

  return inside;
}

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R =
    6371;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) *
      Math.PI) /
    180;

  const a =
    Math.sin(
      dLat / 2
    ) **
      2 +
    Math.cos(
      (lat1 *
        Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 *
          Math.PI) /
          180
      ) *
      Math.sin(
        dLon / 2
      ) **
        2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(
        1 - a
      )
    )
  );
}

/* =========================================================
   PUNTOS REPRESENTATIVOS DE LA JURISDICCIÓN
========================================================= */

function zonePoints(
  zone: WeatherMonitorZone
) {
  const normalizedProvince =
    normalize(
      zone.province
    );

  const province =
    provinciasArgentina.find(
      (item) =>
        normalize(
          item.nombre
        ) ===
        normalizedProvince
    );

  const provincesToCheck =
    province
      ? [province]
      : provinciasArgentina;

  const points: Array<{
    latitude: number;
    longitude: number;
  }> = [];

  for (
    const currentProvince of
    provincesToCheck
  ) {
    const localities =
      localidadesPorProvincia(
        currentProvince.id
      );

    for (
      const locality of
      localities
    ) {
      const localityDistrict =
        locality.municipio ||
        locality.departamento ||
        "";

      if (
        normalize(
          localityDistrict
        ) !==
        normalize(
          zone.district
        )
      ) {
        continue;
      }

      if (
        zone.locality &&
        normalize(
          locality.nombre
        ) !==
          normalize(
            zone.locality
          )
      ) {
        continue;
      }

      if (
        Number.isFinite(
          locality.lat
        ) &&
        Number.isFinite(
          locality.lon
        )
      ) {
        points.push({
          latitude:
            locality.lat,

          longitude:
            locality.lon,
        });
      }
    }
  }

  return points;
}

/* =========================================================
   COINCIDENCIA POR TEXTO
========================================================= */

function areaTextMatchesZone(
  alert: WeatherJurisdictionAlert,
  zone: WeatherMonitorZone
) {
  const descriptions = [
    alert.areaDescription,

    ...(alert.areas ?? []).map(
      (area) =>
        area.description ??
        ""
    ),
  ]
    .filter(Boolean)
    .join(" · ");

  const haystack =
    normalize(
      descriptions
    );

  if (!haystack) {
    return false;
  }

  const district =
    normalize(
      zone.district
    );

  const locality =
    normalize(
      zone.locality
    );

  /*
   * El partido/departamento es el dato principal.
   * Así General Alvarado no recibe alertas de toda
   * la Provincia de Buenos Aires.
   */
  if (
    district &&
    haystack.includes(
      district
    )
  ) {
    return true;
  }

  if (
    locality &&
    haystack.includes(
      locality
    )
  ) {
    return true;
  }

  /*
   * Provincia se usa solamente como respaldo
   * cuando la jurisdicción no tiene distrito.
   */
  if (
    !district
  ) {
    const province =
      normalize(
        zone.province
      );

    if (
      province &&
      haystack.includes(
        province
      )
    ) {
      return true;
    }
  }

  return false;
}

/* =========================================================
   COINCIDENCIA POR GEOMETRÍA
========================================================= */

function geometryMatchesZone(
  alert: WeatherJurisdictionAlert,
  zone: WeatherMonitorZone
) {
  const points =
    zonePoints(zone);

  if (
    points.length === 0
  ) {
    return false;
  }

  for (
    const area of
    alert.areas ?? []
  ) {
    for (
      const polygon of
      area.polygons ?? []
    ) {
      if (
        !Array.isArray(
          polygon
        ) ||
        polygon.length < 3
      ) {
        continue;
      }

      for (
        const point of
        points
      ) {
        if (
          pointInPolygon(
            point.latitude,
            point.longitude,
            polygon
          )
        ) {
          return true;
        }
      }
    }

    for (
      const circle of
      area.circles ?? []
    ) {
      if (
        !Number.isFinite(
          circle.latitude
        ) ||
        !Number.isFinite(
          circle.longitude
        ) ||
        !Number.isFinite(
          circle.radiusKm
        )
      ) {
        continue;
      }

      for (
        const point of
        points
      ) {
        if (
          distanceKm(
            point.latitude,
            point.longitude,
            circle.latitude,
            circle.longitude
          ) <=
          circle.radiusKm
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/* =========================================================
   FUNCIÓN PRINCIPAL
========================================================= */

export function weatherAlertAffectsZones(
  alert: WeatherJurisdictionAlert,
  monitorZones: WeatherMonitorZone[]
) {
  /*
   * El administrador histórico no tiene zonas guardadas.
   * En ese caso mantenemos la jurisdicción histórica:
   * General Alvarado, Buenos Aires.
   */
  const zones =
    monitorZones.length >
    0
      ? monitorZones
      : [
          DEFAULT_ZONE,
        ];

  for (
    const zone of
    zones
  ) {
    /*
     * Primero usamos los nombres oficiales del CAP.
     */
    if (
      areaTextMatchesZone(
        alert,
        zone
      )
    ) {
      return true;
    }

    /*
     * Si el texto no alcanza, usamos los polígonos
     * y círculos publicados por el SMN.
     */
    if (
      geometryMatchesZone(
        alert,
        zone
      )
    ) {
      return true;
    }
  }

  return false;
}
