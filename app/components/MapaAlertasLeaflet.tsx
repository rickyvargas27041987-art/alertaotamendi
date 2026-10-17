"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Circle,
  GeoJSON,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import type {
  LatLngBoundsExpression,
} from "leaflet";
import type { GeoJsonObject } from "geojson";

import "leaflet/dist/leaflet.css";

import {
  provinciasArgentina,
  localidadesPorProvincia,
  type LocalidadArgentina,
} from "../data/localidadesArgentina";

import {
  weatherAlertAffectsZones,
} from "@/lib/weatherJurisdiction";

/* =========================================================
   TIPOS
========================================================= */

type Report = {
  id: number;
  category: string;
  description?: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type MapFocusTarget = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  key: number;
};

type MonitorZone = {
  province: string;
  district: string;
  locality: string | null;
};

type PreventiveAlert = {
  id: number;
  category: string;
  reportIds?: number[];
  reportCount: number;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusKm: number;
  summary?: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
};

type WeatherMapArea = {
  description: string | null;

  polygons: number[][][];

  circles: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }[];
};

type WeatherMapAlert = {
  id: number;
  event: string;
  severity: string | null;
  headline: string | null;
  expiresAt: string | null;
  areaDescription: string | null;
  areas: WeatherMapArea[];
};

type Props = {
  reports: Report[];
  mode?: "admin" | "public";
  onSelectReport?: (report: Report) => void;
  heightClassName?: string;
  focusTarget?: MapFocusTarget | null;
  monitorZones?: MonitorZone[];
  kioskMode?: boolean;
  onOpenHistory?: () => void;
  hotZoneMode?: boolean;
  privacyMode?: boolean;
};

type JurisdictionBoundary = {
  type: "Feature";
  properties: {
    province: string;
    district: string;
    label?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
};

type UserPosition = {
  latitude: number;
  longitude: number;
};

type Provincia = {
  id: string;
  nombre: string;
};

type Localidad = LocalidadArgentina;

type AdminSelectedLocation = {
  latitude: number;
  longitude: number;
  label: string;
  localityId?: string;
  bounds?: [
    [number, number],
    [number, number],
  ];
  detailZoom?: boolean;
  detailLevel?: 0 | 1 | 2 | 3;
  detailDirection?: "in" | "out";
  commandKey?: number;
} | null;

/* =========================================================
   CONFIGURACIÓN GENERAL
========================================================= */

const OTAMENDI_CENTER: [number, number] = [
  -38.112,
  -57.84,
];

/*
 * Vista pública:
 * - Predeterminada: 1,5 km alrededor de la ubicación actual.
 * - Al tocar "Mi ubicación": 200 m alrededor del usuario.
 *
 * Esto afecta solamente la cámara del mapa.
 * NO modifica el radio de notificaciones push.
 */
const PUBLIC_DEFAULT_RADIUS_METERS = 1_500;
const PUBLIC_USER_RADIUS_METERS = 200;

/*
 * Círculo visual alrededor de la ubicación del usuario.
 */
const PUBLIC_MAP_RADIUS_METERS = 200;

const ADMIN_LAST_LOCATION_STORAGE_KEY =
  "alerta_otamendi_admin_last_location_v2";

const WEATHER_LAYER_STORAGE_KEY =
  "alerta_otamendi_weather_layer_v1";

/*
 * Las alertas nuevas tienen animación durante 10 minutos.
 */
const NEW_REPORT_MINUTES = 10;

/* =========================================================
   CATEGORÍAS / MARCADORES
========================================================= */

const MARKER_CONFIG: Record<
  string,
  {
    color: string;
    emoji: string;
    label: string;
  }
> = {
  "Delito / Robo": {
    color: "#ef4444",
    emoji: "🚨",
    label: "Hurto / Robo",
  },

  "Persona sospechosa": {
    color: "#f97316",
    emoji: "👤",
    label: "Persona",
  },

  "Vehículo sospechoso": {
    color: "#eab308",
    emoji: "🚗",
    label: "Vehículo",
  },

  Accidente: {
    color: "#3b82f6",
    emoji: "⚠️",
    label: "Accidente",
  },

  Incendio: {
    color: "#a855f7",
    emoji: "🔥",
    label: "Incendio",
  },

  Emergencia: {
    color: "#10b981",
    emoji: "🆘",
    label: "Emergencia",
  },

  "Defensa Civil": {
    color: "#0891b2",
    emoji: "🛡️",
    label: "Defensa Civil",
  },
};

function displayCategory(category: string) {
  return category === "Delito / Robo"
    ? "Hurto / Robo"
    : category;
}

const FILTROS = [
  {
    label: "Todos",
    value: "Todos",
  },

  {
    label: "🚨 Hurto / Robo",
    value: "Delito / Robo",
  },

  {
    label: "👤 Persona",
    value: "Persona sospechosa",
  },

  {
    label: "🚗 Vehículo",
    value: "Vehículo sospechoso",
  },

  {
    label: "⚠️ Accidente",
    value: "Accidente",
  },

  {
    label: "🔥 Incendio",
    value: "Incendio",
  },

  {
    label: "🆘 Emergencia",
    value: "Emergencia",
  },

  {
    label: "🛡️ Defensa Civil",
    value: "Defensa Civil",
  },
];

/* =========================================================
   FUNCIONES AUXILIARES METEOROLOGÍA
========================================================= */

function weatherLayerColor(
  severity: string | null
) {
  const value =
    severity?.toLowerCase() || "";

  if (value === "extreme") {
    return "#ef4444";
  }

  if (value === "severe") {
    return "#f97316";
  }

  if (value === "moderate") {
    return "#eab308";
  }

  return "#38bdf8";
}

function weatherSeverityLabel(
  severity: string | null
) {
  const value =
    severity?.toLowerCase() || "";

  if (value === "extreme") {
    return "EXTREMA";
  }

  if (value === "severe") {
    return "SEVERA";
  }

  if (value === "moderate") {
    return "MODERADA";
  }

  if (value === "minor") {
    return "MENOR";
  }

  return severity?.toUpperCase() || "ALERTA";
}

function decodeWeatherMapText(
  value: string | null
) {
  if (!value) return value;

  let result = value;

  for (let i = 0; i < 3; i++) {
    const previous = result;

    result = result
      .replace(
        /&#x([0-9a-f]+);?/gi,
        (_, code) => {
          const number =
            parseInt(code, 16);

          return Number.isFinite(number)
            ? String.fromCodePoint(number)
            : _;
        }
      )
      .replace(
        /&#([0-9]+);?/g,
        (_, code) => {
          const number =
            parseInt(code, 10);

          return Number.isFinite(number)
            ? String.fromCodePoint(number)
            : _;
        }
      )
      .replace(/&aacute;/gi, "á")
      .replace(/&eacute;/gi, "é")
      .replace(/&iacute;/gi, "í")
      .replace(/&oacute;/gi, "ó")
      .replace(/&uacute;/gi, "ú")
      .replace(/&ntilde;/gi, "ñ")
      .replace(/&uuml;/gi, "ü")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");

    if (result === previous) {
      break;
    }
  }

  return result;
}

function formatWeatherMapDate(
  value: string | null
) {
  if (!value) {
    return "Sin dato";
  }

  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return "Sin dato";
  }

  return date.toLocaleString(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function normalizeWeatherAreas(
  value: unknown
): WeatherMapArea[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((rawArea) => {
    const area =
      rawArea &&
      typeof rawArea === "object"
        ? (rawArea as Record<
            string,
            unknown
          >)
        : {};

    const polygons =
      Array.isArray(area.polygons)
        ? area.polygons
            .map((rawPolygon) => {
              if (
                !Array.isArray(
                  rawPolygon
                )
              ) {
                return [];
              }

              return rawPolygon
                .map((rawPoint) => {
                  if (
                    !Array.isArray(
                      rawPoint
                    ) ||
                    rawPoint.length <
                      2
                  ) {
                    return null;
                  }

                  const latitude =
                    Number(
                      rawPoint[0]
                    );

                  const longitude =
                    Number(
                      rawPoint[1]
                    );

                  if (
                    !Number.isFinite(
                      latitude
                    ) ||
                    !Number.isFinite(
                      longitude
                    )
                  ) {
                    return null;
                  }

                  return [
                    latitude,
                    longitude,
                  ];
                })
                .filter(
                  (
                    point
                  ): point is number[] =>
                    point !== null
                );
            })
            .filter(
              (polygon) =>
                polygon.length >= 3
            )
        : [];

    const circles =
      Array.isArray(area.circles)
        ? area.circles
            .map((rawCircle) => {
              if (
                !rawCircle ||
                typeof rawCircle !==
                  "object"
              ) {
                return null;
              }

              const circle =
                rawCircle as Record<
                  string,
                  unknown
                >;

              const latitude =
                Number(
                  circle.latitude
                );

              const longitude =
                Number(
                  circle.longitude
                );

              const radiusKm =
                Number(
                  circle.radiusKm
                );

              if (
                !Number.isFinite(
                  latitude
                ) ||
                !Number.isFinite(
                  longitude
                ) ||
                !Number.isFinite(
                  radiusKm
                )
              ) {
                return null;
              }

              return {
                latitude,
                longitude,
                radiusKm,
              };
            })
            .filter(
              (
                circle
              ): circle is {
                latitude: number;
                longitude: number;
                radiusKm: number;
              } =>
                circle !== null
            )
        : [];

    return {
      description:
        typeof area.description ===
        "string"
          ? decodeWeatherMapText(
              area.description
            )
          : null,

      polygons,

      circles,
    };
  });
}

/* =========================================================
   FUNCIONES AUXILIARES GENERALES
========================================================= */

function isCritical(category: string) {
  return (
    category === "Emergencia" ||
    category === "Delito / Robo" ||
    category === "Incendio" ||
    category === "Accidente"
  );
}

function getMarkerIcon(
  category: string,
  isNew: boolean,
  mode: "admin" | "public"
) {
  const item =
    MARKER_CONFIG[category] || {
      color: "#64748b",
      emoji: "📍",
      label: "Alerta",
    };

  const isSuspicion =
    category ===
      "Persona sospechosa" ||
    category ===
      "Vehículo sospechoso";

  const compact =
    mode === "admin" &&
    isSuspicion;

  const critical =
    isCritical(category);

  const markerSize = compact
    ? 27
    : critical
      ? 44
      : 40;

  const wrapperWidth =
    compact ? 38 : 56;

  const wrapperHeight =
    compact ? 42 : 60;

  const anchorX =
    Math.round(
      wrapperWidth / 2
    );

  const anchorY =
    compact ? 35 : 51;

  const borderWidth =
    compact ? 2 : 3;

  const radius =
    compact
      ? "9px 9px 9px 2px"
      : "14px 14px 14px 3px";

  const fontSize =
    compact
      ? 13
      : critical
        ? 20
        : 18;

  const pulseSize =
    markerSize;

  const pulseLeft =
    Math.round(
      (wrapperWidth -
        pulseSize) /
        2
    );

  const pulseTop =
    compact ? 4 : 5;

  const shouldPulse =
    critical ||
    (!compact && isNew);

  const glow = critical
    ? `0 0 0 6px ${item.color}38,
       0 0 28px ${item.color}88,
       0 8px 22px rgba(0,0,0,.58)`
    : compact
      ? "0 4px 10px rgba(0,0,0,.38)"
      : "0 7px 20px rgba(0,0,0,.50)";

  return L.divIcon({
    className:
      "alerta-marker-wrapper",

    html: `
      <div style="position:relative;width:${wrapperWidth}px;height:${wrapperHeight}px;display:flex;align-items:center;justify-content:center;">
        ${
          shouldPulse
            ? `
          <div style="position:absolute;top:${pulseTop}px;left:${pulseLeft}px;width:${pulseSize}px;height:${pulseSize}px;border-radius:999px;background:${item.color};opacity:.42;animation:alertaPulse ${
                critical
                  ? "1.15s"
                  : "1.35s"
              } infinite;"></div>
        `
            : ""
        }
        <div style="position:relative;width:${markerSize}px;height:${markerSize}px;border-radius:${radius};transform:rotate(-45deg);background:${item.color};border:${borderWidth}px solid white;box-shadow:${glow};display:flex;align-items:center;justify-content:center;z-index:2;">
          <span style="transform:rotate(45deg);font-size:${fontSize}px;line-height:1;">${item.emoji}</span>
        </div>
      </div>
    `,

    iconSize: [
      wrapperWidth,
      wrapperHeight,
    ],

    iconAnchor: [
      anchorX,
      anchorY,
    ],

    popupAnchor: [
      0,
      -anchorY + 5,
    ],
  });
}

function getUserIcon() {
  return L.divIcon({
    className: "",

    html: `
      <div
        style="
          position:relative;
          width:34px;
          height:34px;
        "
      >

        <div
          style="
            position:absolute;
            inset:0;
            border-radius:999px;
            background:#3b82f6;
            opacity:.22;
            animation:usuarioPulse 2s infinite;
          "
        ></div>

        <div
          style="
            position:absolute;
            left:8px;
            top:8px;
            width:18px;
            height:18px;
            border-radius:999px;
            background:#2563eb;
            border:3px solid white;
            box-shadow:
              0 0 0 3px rgba(37,99,235,.25),
              0 3px 10px rgba(0,0,0,.50);
          "
        ></div>

      </div>
    `,

    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function statusLabel(status: string) {
  switch (
    status.toLowerCase()
  ) {
    case "pendiente":
      return "Pendiente";

    case "en_analisis":
      return "En análisis";

    case "verificada":
      return "Verificada";

    case "resuelta":
    case "resuelto":
      return "Resuelta";

    case "descartada":
      return "Descartada";

    default:
      return status;
  }
}

function relativeTime(date: string) {
  const timestamp =
    new Date(date).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return "";
  }

  const diff = Math.max(
    0,
    Date.now() -
      timestamp
  );

  const seconds =
    Math.floor(
      diff / 1000
    );

  if (seconds < 60) {
    return "Ahora";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return `Hace ${days} d`;
}

/* =========================================================
   VIEWPORT ADMINISTRADOR
========================================================= */

function AdminViewport({
  reports,
  resetKey,
  selectedLocation,
  locationKey,
  focusTarget,
}: {
  reports: Report[];
  resetKey: number;
  selectedLocation: AdminSelectedLocation;
  locationKey: number;
  focusTarget:
    MapFocusTarget | null;
}) {
  const map = useMap();

  const reportsRef =
    useRef(reports);

  useEffect(() => {
    reportsRef.current =
      reports;
  }, [reports]);

  useEffect(() => {
    const validReports =
      reportsRef.current.filter(
        (report) =>
          report.latitude !==
            null &&
          report.longitude !==
            null
      );

    const timer =
      window.setTimeout(
        () => {
          map.invalidateSize();

          const selectedCommandKey =
            selectedLocation
              ?.commandKey ?? 0;

          const focusCommandKey =
            focusTarget?.key ?? 0;

          const useSelectedLocation =
            Boolean(
              selectedLocation
            ) &&
            selectedCommandKey >=
              focusCommandKey;

          if (
            focusTarget &&
            !useSelectedLocation
          ) {
            const bounds =
              L.latLng(
                focusTarget.latitude,
                focusTarget.longitude
              ).toBounds(
                (focusTarget.radiusMeters ??
                  1500) * 2
              );

            map.fitBounds(
              bounds,
              {
                padding: [
                  24,
                  24,
                ],
                animate: true,
                duration: 0.6,
              }
            );

            return;
          }

          if (
            selectedLocation
          ) {
            const detailLevel =
              selectedLocation.detailLevel ??
              (selectedLocation.detailZoom
                ? 1
                : 0);

            if (
              detailLevel > 0
            ) {
              const detailDiameterMeters =
                detailLevel === 3
                  ? 900
                  : detailLevel ===
                      2
                    ? 1800
                    : 4200;

              const detailBounds =
                L.latLng(
                  selectedLocation.latitude,
                  selectedLocation.longitude
                ).toBounds(
                  detailDiameterMeters
                );

              map.fitBounds(
                detailBounds,
                {
                  padding: [
                    24,
                    24,
                  ],

                  maxZoom:
                    detailLevel ===
                    3
                      ? 19
                      : detailLevel ===
                          2
                        ? 18
                        : 17,

                  animate: true,
                  duration: 0.6,
                }
              );

              return;
            }

            if (
              selectedLocation.bounds
            ) {
              map.fitBounds(
                selectedLocation.bounds,
                {
                  padding: [
                    34,
                    34,
                  ],

                  maxZoom: 17,
                  animate: true,
                  duration: 0.6,
                }
              );
            } else {
              const fallbackBounds =
                L.latLng(
                  selectedLocation.latitude,
                  selectedLocation.longitude
                ).toBounds(
                  3000
                );

              map.fitBounds(
                fallbackBounds,
                {
                  padding: [
                    34,
                    34,
                  ],

                  maxZoom: 16,
                  animate: true,
                }
              );
            }

            return;
          }

          if (
            validReports.length ===
            0
          ) {
            map.setView(
              OTAMENDI_CENTER,
              14,
              {
                animate: true,
              }
            );

            return;
          }

          if (
            validReports.length ===
            1
          ) {
            map.setView(
              [
                validReports[0]
                  .latitude!,
                validReports[0]
                  .longitude!,
              ],
              16,
              {
                animate: true,
              }
            );

            return;
          }

          const bounds =
            validReports.map(
              (report) =>
                [
                  report.latitude!,
                  report.longitude!,
                ] as [
                  number,
                  number,
                ]
            ) as LatLngBoundsExpression;

          map.fitBounds(
            bounds,
            {
              padding: [
                50,
                50,
              ],
              maxZoom: 16,
              animate: true,
            }
          );
        },
        100
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    map,
    resetKey,
    selectedLocation,
    locationKey,
    focusTarget?.key,
  ]);

  return null;
}

/* =========================================================
   VIEWPORT PÚBLICO
========================================================= */

function PublicViewport({
  userPosition,
  locationKey,
  radiusMeters,
}: {
  userPosition:
    UserPosition | null;
  locationKey: number;
  radiusMeters: number;
}) {
  const map = useMap();

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          map.invalidateSize();

          if (
            !userPosition
          ) {
            const defaultBounds =
              L.latLng(
                OTAMENDI_CENTER[0],
                OTAMENDI_CENTER[1]
              ).toBounds(
                PUBLIC_DEFAULT_RADIUS_METERS *
                  2
              );

            map.fitBounds(
              defaultBounds,
              {
                padding: [
                  24,
                  24,
                ],
                animate: false,
              }
            );

            return;
          }

          const userBounds =
            L.latLng(
              userPosition.latitude,
              userPosition.longitude
            ).toBounds(
              radiusMeters *
                2
            );

          map.fitBounds(
            userBounds,
            {
              padding: [
                24,
                24,
              ],
              animate: true,
              duration: 0.6,
            }
          );
        },
        100
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    map,
    userPosition,
    locationKey,
    radiusMeters,
  ]);

  return null;
}

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function MapaAlertasLeaflet({
  reports,
  mode = "public",
  onSelectReport,
  heightClassName = "h-[460px] md:h-[560px]",
  focusTarget = null,
  monitorZones = [],
  kioskMode = false,
  onOpenHistory,
  hotZoneMode = false,
  privacyMode = false,
}: Props) {
  const [
    filtro,
    setFiltro,
  ] =
    useState("Todos");

  const [
    resetKey,
    setResetKey,
  ] =
    useState(0);

  const [
    locationKey,
    setLocationKey,
  ] =
    useState(0);

  const [
    publicViewportRadiusMeters,
    setPublicViewportRadiusMeters,
  ] = useState(
    PUBLIC_DEFAULT_RADIUS_METERS
  );

  const [
    userPosition,
    setUserPosition,
  ] =
    useState<UserPosition | null>(
      null
    );

  const [
    locating,
    setLocating,
  ] =
    useState(false);

  const [
    preventiveAlerts,
    setPreventiveAlerts,
  ] =
    useState<
      PreventiveAlert[]
    >([]);

  const [
    weatherLayerEnabled,
    setWeatherLayerEnabled,
  ] =
    useState(false);

  const [
    weatherMapAlerts,
    setWeatherMapAlerts,
  ] =
    useState<
      WeatherMapAlert[]
    >([]);

  const [
    jurisdictionBoundaries,
    setJurisdictionBoundaries,
  ] =
    useState<
      Array<{
        key: string;
        label: string;
        data: GeoJsonObject;
      }>
    >([]);

  const [
    selectedDistrictBoundary,
    setSelectedDistrictBoundary,
  ] =
    useState<{
      key: string;
      label: string;
      data: GeoJsonObject;
    } | null>(null);

  const [
    locationMessage,
    setLocationMessage,
  ] =
    useState("");

  const [provincias] =
    useState<Provincia[]>(
      provinciasArgentina
    );

  const [
    provinciaId,
    setProvinciaId,
  ] =
    useState("");

  const [
    district,
    setDistrict,
  ] =
    useState("");

  const [
    localidadId,
    setLocalidadId,
  ] =
    useState("");

  const [
    adminSelectedLocation,
    setAdminSelectedLocation,
  ] =
    useState<AdminSelectedLocation>(
      null
    );

  const [
    adminLocationKey,
    setAdminLocationKey,
  ] =
    useState(0);

  const districts =
    useMemo(
      () =>
        Array.from(
          new Set(
            localidadesPorProvincia(
              provinciaId
            )
              .map(
                (item) =>
                  item.municipio ||
                  item.departamento
              )
              .filter(
                (
                  item
                ): item is string =>
                  Boolean(item)
              )
          )
        ).sort(
          (a, b) =>
            a.localeCompare(
              b,
              "es"
            )
        ),
      [provinciaId]
    );

  const localidades =
    useMemo<Localidad[]>(
      () =>
        localidadesPorProvincia(
          provinciaId
        )
          .filter(
            (item) =>
              (item.municipio ||
                item.departamento) ===
              district
          )
          .sort(
            (a, b) =>
              a.nombre.localeCompare(
                b.nombre,
                "es"
              )
          ),
      [
        district,
        provinciaId,
      ]
    );

  const primaryZone =
    useMemo<MonitorZone>(
      () =>
        monitorZones[0] ?? {
          province:
            "Buenos Aires",
          district:
            "General Alvarado",
          locality: null,
        },
      [monitorZones]
    );

  const primaryJurisdiction =
    useMemo<AdminSelectedLocation>(
      () => {
        const zone =
          primaryZone;

        const zoneLocality =
          zone.locality;

        if (zoneLocality) {
          const normalized = (
            value: string
          ) =>
            value
              .trim()
              .toLocaleLowerCase(
                "es-AR"
              );

          for (
            const provincia of
            provinciasArgentina
          ) {
            const localidades =
              localidadesPorProvincia(
                provincia.id
              );

            const match =
              localidades.find(
                (item) =>
                  normalized(
                    item.nombre
                  ) ===
                  normalized(
                    zoneLocality
                  )
              );

            if (match) {
              return {
                latitude:
                  match.lat,

                longitude:
                  match.lon,

                label:
                  `${zoneLocality}, ${zone.district}`,

                localityId:
                  match.id,
              };
            }
          }
        }

        const boundary =
          jurisdictionBoundaries.find(
            (item) =>
              item.key ===
              `${zone.province}|${zone.district}`
          );

        if (boundary) {
          const leafletBounds =
            L.geoJSON(
              boundary.data
            ).getBounds();

          if (
            leafletBounds.isValid()
          ) {
            const center =
              leafletBounds.getCenter();

            return {
              latitude:
                center.lat,

              longitude:
                center.lng,

              label:
                `Partido / departamento de ${zone.district}`,

              bounds: [
                [
                  leafletBounds.getSouth(),
                  leafletBounds.getWest(),
                ],
                [
                  leafletBounds.getNorth(),
                  leafletBounds.getEast(),
                ],
              ],
            };
          }
        }

        return {
          latitude:
            OTAMENDI_CENTER[0],

          longitude:
            OTAMENDI_CENTER[1],

          label:
            zone.district ||
            "Mi jurisdicción",
        };
      },
      [
        primaryZone,
        jurisdictionBoundaries,
      ]
    );

  const mountedRef =
    useRef(true);

  /* =======================================================
     MONTAJE / DESMONTAJE
  ======================================================= */

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;
    };
  }, []);

  /* =======================================================
     CAPA METEOROLÓGICA SMN - SOLO ADMIN
  ======================================================= */

  useEffect(() => {
    if (
      mode !== "admin" ||
      typeof window ===
        "undefined"
    ) {
      setWeatherLayerEnabled(
        false
      );

      setWeatherMapAlerts(
        []
      );

      return;
    }

    let cancelled =
      false;

    let previousEnabled =
      false;

    function readEnabled() {
      try {
        const raw =
          window.localStorage.getItem(
            WEATHER_LAYER_STORAGE_KEY
          );

        if (!raw) {
          return false;
        }

        const value =
          JSON.parse(raw) as {
            enabled?: boolean;
          };

        return Boolean(
          value.enabled
        );
      } catch (error) {
        console.warn(
          "No se pudo leer el estado de la capa SMN:",
          error
        );

        return false;
      }
    }

    const loadWeatherAlerts =
      async () => {
        try {
          const response =
            await fetch(
              "/api/weather/active",
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (
            cancelled ||
            !response.ok ||
            !data?.success ||
            !Array.isArray(
              data.alerts
            )
          ) {
            return;
          }

          const normalizedAlerts =
            data.alerts.map(
              (
                rawAlert: Record<
                  string,
                  unknown
                >
              ) => ({
                id:
                  Number(
                    rawAlert.id
                  ),

                event:
                  decodeWeatherMapText(
                    typeof rawAlert.event ===
                      "string"
                      ? rawAlert.event
                      : null
                  ) ||
                  "Alerta meteorológica",

                severity:
                  typeof rawAlert.severity ===
                  "string"
                    ? rawAlert.severity
                    : null,

                headline:
                  decodeWeatherMapText(
                    typeof rawAlert.headline ===
                      "string"
                      ? rawAlert.headline
                      : null
                  ),

                expiresAt:
                  typeof rawAlert.expiresAt ===
                  "string"
                    ? rawAlert.expiresAt
                    : null,

                areaDescription:
                  decodeWeatherMapText(
                    typeof rawAlert.areaDescription ===
                      "string"
                      ? rawAlert.areaDescription
                      : null
                  ),

                areas:
                  normalizeWeatherAreas(
                    rawAlert.areas
                  ),
              })
            ) as WeatherMapAlert[];

          const jurisdictionAlerts =
            normalizedAlerts.filter(
              (alert) =>
                weatherAlertAffectsZones(
                  alert,
                  monitorZones
                )
            );

          if (!cancelled) {
            setWeatherMapAlerts(
              jurisdictionAlerts
            );
          }
        } catch (error) {
          console.error(
            "Error cargando las zonas meteorológicas del SMN:",
            error
          );
        }
      };

    const syncLayerState =
      (
        forceRefresh =
          false
      ) => {
        const enabled =
          readEnabled();

        setWeatherLayerEnabled(
          enabled
        );

        if (!enabled) {
          previousEnabled =
            false;

          setWeatherMapAlerts(
            []
          );

          return;
        }

        if (
          forceRefresh ||
          !previousEnabled
        ) {
          previousEnabled =
            true;

          void loadWeatherAlerts();
        }
      };

    syncLayerState(true);

    const onStorage = (
      event: StorageEvent
    ) => {
      if (
        event.key ===
        WEATHER_LAYER_STORAGE_KEY
      ) {
        syncLayerState(
          true
        );
      }
    };

    window.addEventListener(
      "storage",
      onStorage
    );

    /*
     * El evento "storage" no se dispara en la misma pestaña
     * que hizo el cambio. Por eso leemos el estado también
     * cada segundo.
     */
    const stateInterval =
      window.setInterval(
        () =>
          syncLayerState(
            false
          ),
        1000
      );

    /*
     * Mientras la capa esté encendida actualizamos los datos
     * meteorológicos una vez por minuto.
     */
    const dataInterval =
      window.setInterval(
        () => {
          if (
            previousEnabled
          ) {
            void loadWeatherAlerts();
          }
        },
        60_000
      );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "storage",
        onStorage
      );

      window.clearInterval(
        stateInterval
      );

      window.clearInterval(
        dataInterval
      );
    };
  }, [mode, monitorZones]);

  /* =======================================================
     RECORDAR ÚLTIMA PROVINCIA / LOCALIDAD - SOLO ADMIN
  ======================================================= */

  useEffect(() => {
    if (
      mode !== "admin" ||
      typeof window ===
        "undefined"
    ) {
      return;
    }

    try {
      const raw =
        window.localStorage.getItem(
          ADMIN_LAST_LOCATION_STORAGE_KEY
        );

      if (!raw) {
        return;
      }

      const saved =
        JSON.parse(raw) as {
          provinciaId?: string;
          district?: string;
          localidadId?: string;
          latitude?: number;
          longitude?: number;
          label?: string;
        };

      if (
        saved.provinciaId
      ) {
        setProvinciaId(
          saved.provinciaId
        );
      }

      if (saved.district) {
        setDistrict(
          saved.district
        );
      }

      if (
        saved.localidadId
      ) {
        setLocalidadId(
          saved.localidadId
        );
      }

      if (
        typeof saved.latitude ===
          "number" &&
        typeof saved.longitude ===
          "number" &&
        typeof saved.label ===
          "string"
      ) {
        setAdminSelectedLocation(
          {
            latitude:
              saved.latitude,

            longitude:
              saved.longitude,

            label:
              saved.label,

            commandKey:
              Date.now(),
          }
        );

        setAdminLocationKey(
          (value) =>
            value + 1
        );
      }
    } catch (error) {
      console.error(
        "No se pudo recuperar la última localidad del Centro de Monitoreo:",
        error
      );
    }
  }, [mode]);

  function targetFromBoundary(
    data: GeoJsonObject,
    label: string
  ):
    | NonNullable<AdminSelectedLocation>
    | null {
    const leafletBounds =
      L.geoJSON(
        data
      ).getBounds();

    if (
      !leafletBounds.isValid()
    ) {
      return null;
    }

    const center =
      leafletBounds.getCenter();

    return {
      latitude:
        center.lat,

      longitude:
        center.lng,

      label,

      bounds: [
        [
          leafletBounds.getSouth(),
          leafletBounds.getWest(),
        ],
        [
          leafletBounds.getNorth(),
          leafletBounds.getEast(),
        ],
      ],

      detailZoom: false,
      detailLevel: 0,
      commandKey:
        Date.now(),
    };
  }

  async function mostrarPartido(
    provinceIdValue: string,
    districtValue: string
  ) {
    const province =
      provincias.find(
        (item) =>
          item.id ===
          provinceIdValue
      );

    if (
      !province ||
      !districtValue
    ) {
      return;
    }

    const districtLocalities =
      localidadesPorProvincia(
        provinceIdValue
      ).filter(
        (item) =>
          (item.municipio ||
            item.departamento) ===
          districtValue
      );

    if (
      districtLocalities.length
    ) {
      const latitude =
        districtLocalities.reduce(
          (sum, item) =>
            sum + item.lat,
          0
        ) /
        districtLocalities.length;

      const longitude =
        districtLocalities.reduce(
          (sum, item) =>
            sum + item.lon,
          0
        ) /
        districtLocalities.length;

      setAdminSelectedLocation(
        {
          latitude,
          longitude,

          label:
            `${districtValue}, ${province.nombre}`,

          commandKey:
            Date.now(),
        }
      );

      setAdminLocationKey(
        (value) =>
          value + 1
      );
    }

    try {
      const params =
        new URLSearchParams(
          {
            province:
              province.nombre,

            district:
              districtValue,
          }
        );

      const response =
        await fetch(
          `/api/admin/jurisdiction-boundary?${params}`,
          {
            cache:
              "no-store",
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success ||
        !data.boundary
      ) {
        return;
      }

      const boundary = {
        key:
          `${province.nombre}|${districtValue}`,

        label:
          districtValue,

        data:
          data.boundary as GeoJsonObject,
      };

      setSelectedDistrictBoundary(
        boundary
      );

      const target =
        targetFromBoundary(
          boundary.data,
          `Partido / departamento de ${districtValue}`
        );

      if (target) {
        setAdminSelectedLocation(
          target
        );

        setAdminLocationKey(
          (value) =>
            value + 1
        );
      }
    } catch (error) {
      console.warn(
        "No se pudo cargar el límite del partido o departamento:",
        error
      );
    }
  }

  function seleccionarPartido(
    value: string
  ) {
    setDistrict(value);
    setLocalidadId("");
    setSelectedDistrictBoundary(
      null
    );

    if (!value) {
      setAdminSelectedLocation(
        null
      );

      return;
    }

    void mostrarPartido(
      provinciaId,
      value
    );

    try {
      window.localStorage.setItem(
        ADMIN_LAST_LOCATION_STORAGE_KEY,
        JSON.stringify({
          provinciaId,
          district: value,
        })
      );
    } catch (error) {
      console.error(
        "No se pudo guardar el último partido del Centro de Monitoreo:",
        error
      );
    }
  }

  function seleccionarLocalidad(
    id: string
  ) {
    setLocalidadId(id);

    const localidad =
      localidades.find(
        (item) =>
          item.id === id
      );

    const provincia =
      provincias.find(
        (item) =>
          item.id ===
          provinciaId
      );

    if (!localidad) {
      return;
    }

    const label =
      `${localidad.nombre}${
        provincia
          ? `, ${provincia.nombre}`
          : ""
      }`;

    const baseLocation: NonNullable<AdminSelectedLocation> =
      {
        latitude:
          localidad.lat,

        longitude:
          localidad.lon,

        label,

        localityId:
          localidad.id,

        commandKey:
          Date.now(),
      };

    setAdminSelectedLocation(
      baseLocation
    );

    setAdminLocationKey(
      (value) =>
        value + 1
    );

    fetch(
      `/api/georef?tipo=limites-localidad&id=${encodeURIComponent(
        localidad.id
      )}`
    )
      .then(
        (response) =>
          response.ok
            ? response.json()
            : null
      )
      .then((data) => {
        if (
          !data?.success ||
          !Array.isArray(
            data.bounds
          )
        ) {
          return;
        }

        setAdminSelectedLocation(
          {
            ...baseLocation,

            bounds:
              data.bounds,

            commandKey:
              Date.now(),
          }
        );

        setAdminLocationKey(
          (value) =>
            value + 1
        );
      })
      .catch((error) =>
        console.warn(
          "No se pudieron cargar límites de localidad:",
          error
        )
      );

    try {
      window.localStorage.setItem(
        ADMIN_LAST_LOCATION_STORAGE_KEY,
        JSON.stringify({
          provinciaId,
          district,
          localidadId:
            id,

          latitude:
            localidad.lat,

          longitude:
            localidad.lon,

          label,
        })
      );
    } catch (error) {
      console.error(
        "No se pudo guardar la última localidad del Centro de Monitoreo:",
        error
      );
    }
  }

  async function mostrarMiJurisdiccion() {
    const zone =
      primaryZone;

    const province =
      provincias.find(
        (item) =>
          item.nombre ===
          zone.province
      );

    if (!province) {
      if (
        primaryJurisdiction
      ) {
        setAdminSelectedLocation(
          {
            ...primaryJurisdiction,

            detailZoom:
              false,

            detailLevel:
              0,

            commandKey:
              Date.now(),
          }
        );

        setAdminLocationKey(
          (value) =>
            value + 1
        );
      }

      return;
    }

    setProvinciaId(
      province.id
    );

    setDistrict(
      zone.district
    );

    setSelectedDistrictBoundary(
      null
    );

    if (!zone.locality) {
      setLocalidadId("");

      await mostrarPartido(
        province.id,
        zone.district
      );

      return;
    }

    const locality =
      localidadesPorProvincia(
        province.id
      ).find(
        (item) =>
          (item.municipio ||
            item.departamento) ===
            zone.district &&
          item.nombre
            .trim()
            .toLocaleLowerCase(
              "es-AR"
            ) ===
            zone.locality
              ?.trim()
              .toLocaleLowerCase(
                "es-AR"
              )
      );

    if (!locality) {
      return;
    }

    setLocalidadId(
      locality.id
    );

    const baseLocation: NonNullable<AdminSelectedLocation> =
      {
        latitude:
          locality.lat,

        longitude:
          locality.lon,

        label:
          `${locality.nombre}, ${zone.district}`,

        localityId:
          locality.id,

        detailZoom:
          false,

        detailLevel:
          0,

        commandKey:
          Date.now(),
      };

    setAdminSelectedLocation(
      baseLocation
    );

    setAdminLocationKey(
      (value) =>
        value + 1
    );

    try {
      const response =
        await fetch(
          `/api/georef?tipo=limites-localidad&id=${encodeURIComponent(
            locality.id
          )}`
        );

      const data =
        response.ok
          ? await response.json()
          : null;

      if (
        data?.success &&
        Array.isArray(
          data.bounds
        )
      ) {
        setAdminSelectedLocation(
          {
            ...baseLocation,

            bounds:
              data.bounds,

            commandKey:
              Date.now(),
          }
        );

        setAdminLocationKey(
          (value) =>
            value + 1
        );
      }
    } catch (error) {
      console.warn(
        "No se pudieron cargar los límites de la localidad asignada:",
        error
      );
    }
  }

  /* =======================================================
     LÍMITES DE JURISDICCIÓN
  ======================================================= */

  useEffect(() => {
    if (
      mode !== "admin"
    ) {
      setJurisdictionBoundaries(
        []
      );

      return;
    }

    let cancelled =
      false;

    const zonesToLoad =
      monitorZones.length
        ? monitorZones
        : [primaryZone];

    const uniqueZones =
      Array.from(
        new Map(
          zonesToLoad.map(
            (zone) => [
              `${zone.province}|${zone.district}`,
              zone,
            ]
          )
        ).values()
      );

    Promise.all(
      uniqueZones.map(
        async (zone) => {
          const params =
            new URLSearchParams(
              {
                province:
                  zone.province,

                district:
                  zone.district,
              }
            );

          const response =
            await fetch(
              `/api/admin/jurisdiction-boundary?${params}`,
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          return response.ok &&
            data.success
            ? {
                key:
                  `${zone.province}|${zone.district}`,

                label:
                  zone.district,

                data:
                  data.boundary as GeoJsonObject,
              }
            : null;
        }
      )
    )
      .then((items) => {
        if (!cancelled) {
          setJurisdictionBoundaries(
            items.filter(
              (
                item
              ): item is NonNullable<
                typeof item
              > =>
                Boolean(item)
            )
          );
        }
      })
      .catch((error) =>
        console.warn(
          "No se pudieron cargar los límites de jurisdicción:",
          error
        )
      );

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    monitorZones,
    primaryZone,
  ]);

  const visibleJurisdictionBoundaries =
    useMemo(() => {
      if (
        !selectedDistrictBoundary ||
        jurisdictionBoundaries.some(
          (item) =>
            item.key ===
            selectedDistrictBoundary.key
        )
      ) {
        return jurisdictionBoundaries;
      }

      return [
        ...jurisdictionBoundaries,
        selectedDistrictBoundary,
      ];
    }, [
      jurisdictionBoundaries,
      selectedDistrictBoundary,
    ]);

  /* =======================================================
     ALERTAS PREVENTIVAS
  ======================================================= */

  useEffect(() => {
    if (privacyMode) {
      setPreventiveAlerts(
        []
      );

      return;
    }

    let cancelled =
      false;

    const load =
      async () => {
        try {
          const endpoint =
            mode === "admin"
              ? "/api/person-pattern-alerts"
              : "/api/preventive-alerts";

          const response =
            await fetch(
              endpoint,
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (
            !cancelled &&
            response.ok &&
            data.success &&
            Array.isArray(
              data.alerts
            )
          ) {
            setPreventiveAlerts(
              data.alerts.filter(
                (
                  alert: PreventiveAlert
                ) =>
                  alert.reportCount >=
                  3
              )
            );
          }
        } catch (error) {
          console.error(
            "Error cargando perímetros preventivos:",
            error
          );
        }
      };

    void load();

    const interval =
      window.setInterval(
        () =>
          void load(),
        mode === "admin"
          ? 3000
          : 12000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        interval
      );
    };
  }, [
    mode,
    privacyMode,
  ]);

  /* =======================================================
     REPORTES FILTRADOS
  ======================================================= */

  const filteredReports =
    useMemo(() => {
      return reports.filter(
        (report) => {
          if (
            report.latitude ===
              null ||
            report.longitude ===
              null
          ) {
            return false;
          }

          const status =
            report.status
              .toLowerCase()
              .trim();

          if (
            mode === "public" &&
            [
              "resuelta",
              "resuelto",
              "descartada",
            ].includes(status)
          ) {
            return false;
          }

          if (
            mode === "public" &&
            [
              "Persona sospechosa",
              "Vehículo sospechoso",
            ].includes(
              report.category
            )
          ) {
            return false;
          }

          if (
            filtro !== "Todos" &&
            report.category !==
              filtro
          ) {
            return false;
          }

          return true;
        }
      );
    }, [
      reports,
      filtro,
      mode,
    ]);

  const markerPositions =
    useMemo(() => {
      const positions =
        new Map<
          number,
          [number, number]
        >();

      if (!kioskMode) {
        for (
          const report of
          filteredReports
        ) {
          if (
            report.latitude !==
              null &&
            report.longitude !==
              null
          ) {
            positions.set(
              report.id,
              [
                report.latitude,
                report.longitude,
              ]
            );
          }
        }

        return positions;
      }

      const groups =
        new Map<
          string,
          Report[]
        >();

      for (
        const report of
        filteredReports
      ) {
        if (
          report.latitude ===
            null ||
          report.longitude ===
            null
        ) {
          continue;
        }

        const key =
          `${report.latitude.toFixed(
            4
          )}|${report.longitude.toFixed(
            4
          )}`;

        const group =
          groups.get(key) ??
          [];

        group.push(report);

        groups.set(
          key,
          group
        );
      }

      for (
        const group of
        groups.values()
      ) {
        if (
          group.length === 1
        ) {
          const report =
            group[0];

          positions.set(
            report.id,
            [
              report.latitude!,
              report.longitude!,
            ]
          );

          continue;
        }

        group.forEach(
          (
            report,
            index
          ) => {
            const angle =
              (Math.PI *
                2 *
                index) /
              group.length;

            const radius =
              Math.min(
                0.00042,
                0.00016 +
                  group.length *
                    0.000025
              );

            positions.set(
              report.id,
              [
                report.latitude! +
                  Math.sin(
                    angle
                  ) *
                    radius,

                report.longitude! +
                  Math.cos(
                    angle
                  ) *
                    radius,
              ]
            );
          }
        );
      }

      return positions;
    }, [
      filteredReports,
      kioskMode,
    ]);

  const hotZones =
    useMemo(() => {
      if (!hotZoneMode) {
        return [] as Array<{
          key: string;
          latitude: number;
          longitude: number;
          count: number;
        }>;
      }

      const groups =
        new Map<
          string,
          {
            latitude: number;
            longitude: number;
            count: number;
          }
        >();

      for (
        const report of
        filteredReports
      ) {
        if (
          report.latitude ===
            null ||
          report.longitude ===
            null
        ) {
          continue;
        }

        const latBucket =
          Math.round(
            report.latitude *
              100
          ) / 100;

        const lonBucket =
          Math.round(
            report.longitude *
              100
          ) / 100;

        const key =
          `${latBucket.toFixed(
            2
          )}:${lonBucket.toFixed(
            2
          )}`;

        const current =
          groups.get(key);

        if (current) {
          current.count +=
            1;
        } else {
          groups.set(
            key,
            {
              latitude:
                latBucket,

              longitude:
                lonBucket,

              count: 1,
            }
          );
        }
      }

      return [
        ...groups.entries(),
      ]
        .map(
          ([
            key,
            value,
          ]) => ({
            key,
            ...value,
          })
        )
        .filter(
          (item) =>
            item.count >= 2
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        )
        .slice(0, 30);
    }, [
      filteredReports,
      hotZoneMode,
    ]);

  /* =======================================================
     SOLICITAR UBICACIÓN
  ======================================================= */

  const requestUserLocation =
    useCallback(
      (
        recenter = true,
        radiusMeters =
          PUBLIC_USER_RADIUS_METERS
      ) => {
        if (
          mode !== "public"
        ) {
          return;
        }

        if (
          typeof navigator ===
            "undefined" ||
          !navigator.geolocation
        ) {
          setLocating(
            false
          );

          setLocationMessage(
            "Tu dispositivo no permite obtener la ubicación."
          );

          return;
        }

        setLocating(
          true
        );

        setLocationMessage(
          "Buscando tu ubicación…"
        );

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (
              !mountedRef.current
            ) {
              return;
            }

            const nextPosition: UserPosition =
              {
                latitude:
                  position
                    .coords
                    .latitude,

                longitude:
                  position
                    .coords
                    .longitude,
              };

            setUserPosition(
              nextPosition
            );

            setLocationMessage(
              "✅ Ubicación obtenida"
            );

            setLocating(
              false
            );

            if (
              recenter
            ) {
              setPublicViewportRadiusMeters(
                radiusMeters
              );

              setLocationKey(
                (value) =>
                  value + 1
              );
            }
          },

          (error) => {
            if (
              !mountedRef.current
            ) {
              return;
            }

            setLocating(
              false
            );

            switch (
              error.code
            ) {
              case error.PERMISSION_DENIED:
                setLocationMessage(
                  "⚠️ Permiso de ubicación desactivado. Habilitalo desde los permisos del navegador."
                );
                break;

              case error.POSITION_UNAVAILABLE:
                setLocationMessage(
                  "⚠️ No pudimos determinar tu ubicación actual."
                );
                break;

              case error.TIMEOUT:
                setLocationMessage(
                  "⚠️ La ubicación tardó demasiado. Tocá «Mi ubicación» para intentar nuevamente."
                );
                break;

              default:
                setLocationMessage(
                  "⚠️ No pudimos obtener tu ubicación."
                );
            }
          },

          {
            enableHighAccuracy:
              true,

            timeout:
              15_000,

            maximumAge:
              60_000,
          }
        );
      },
      [mode]
    );

  /* =======================================================
     UBICACIÓN AUTOMÁTICA AL ABRIR EL MAPA PÚBLICO
  ======================================================= */

  useEffect(() => {
    if (
      mode !== "public"
    ) {
      return;
    }

    requestUserLocation(
      true,
      PUBLIC_DEFAULT_RADIUS_METERS
    );
  }, [
    mode,
    requestUserLocation,
  ]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      <style jsx global>{`
        @keyframes alertaPulse {
          0% {
            transform: scale(
              0.75
            );
            opacity: 0.55;
          }

          70% {
            transform: scale(
              1.55
            );
            opacity: 0;
          }

          100% {
            transform: scale(
              1.55
            );
            opacity: 0;
          }
        }

        @keyframes usuarioPulse {
          0% {
            transform: scale(
              0.85
            );
            opacity: 0.35;
          }

          70% {
            transform: scale(
              1.35
            );
            opacity: 0;
          }

          100% {
            transform: scale(
              1.35
            );
            opacity: 0;
          }
        }

        .leaflet-container {
          background: #020617;
          font-family: inherit;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 16px;
        }

        .leaflet-popup-content {
          margin: 14px;
        }

        .alerta-marker-wrapper {
          background: transparent !important;
          border: none !important;
        }
      `}</style>

      <div
        className={
          kioskMode
            ? "h-full w-full bg-slate-950"
            : "rounded-3xl border border-slate-800 bg-slate-900/70 p-3 shadow-2xl shadow-black/10"
        }
      >

        {/* UBICACIÓN DEL USUARIO */}

        {mode ===
          "public" && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">

            <div>
              <p className="text-xs font-black text-white">
                📍 Tu zona
              </p>

              <p className="mt-1 max-w-[250px] text-[11px] leading-4 text-slate-400">
                {locating
                  ? "Buscando tu ubicación…"
                  : locationMessage ||
                    "Al abrir, intentamos mostrar tu ubicación con una vista de aproximadamente 1,5 km. Tocá «Mi ubicación» para acercar a 200 m."}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                requestUserLocation(
                  true,
                  PUBLIC_USER_RADIUS_METERS
                )
              }
              disabled={
                locating
              }
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating
                ? "Ubicando…"
                : "📍 Mi ubicación"}
            </button>

          </div>
        )}

        {/* LOCALIDAD / PROVINCIA - SOLO CENTRO DE MONITOREO */}

        {mode === "admin" &&
          !kioskMode && (
            <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">

              <div className="mb-2 flex items-center justify-between gap-3">

                <div>
                  <p className="text-xs font-black text-white">
                    📍 Buscar localidad
                  </p>

                  <p className="mt-1 text-[10px] text-slate-500">
                    Solo modifica la vista del Centro de Monitoreo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void mostrarMiJurisdiccion()
                  }
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white hover:bg-emerald-500"
                  title={
                    primaryJurisdiction?.label ??
                    "Mi jurisdicción"
                  }
                >
                  🎯 Mi jurisdicción
                </button>

                {adminSelectedLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      const currentLevel =
                        adminSelectedLocation.detailLevel ??
                        (adminSelectedLocation.detailZoom
                          ? 1
                          : 0);

                      const currentDirection =
                        adminSelectedLocation.detailDirection ??
                        "in";

                      let nextLevel:
                        | 0
                        | 1
                        | 2
                        | 3;

                      let nextDirection:
                        | "in"
                        | "out" =
                        currentDirection;

                      if (
                        currentDirection ===
                        "in"
                      ) {
                        nextLevel =
                          Math.min(
                            3,
                            currentLevel +
                              1
                          ) as
                            | 0
                            | 1
                            | 2
                            | 3;

                        if (
                          nextLevel ===
                          3
                        ) {
                          nextDirection =
                            "out";
                        }
                      } else {
                        nextLevel =
                          Math.max(
                            0,
                            currentLevel -
                              1
                          ) as
                            | 0
                            | 1
                            | 2
                            | 3;

                        if (
                          nextLevel ===
                          0
                        ) {
                          nextDirection =
                            "in";
                        }
                      }

                      setAdminSelectedLocation(
                        {
                          ...adminSelectedLocation,

                          detailZoom:
                            nextLevel >
                            0,

                          detailLevel:
                            nextLevel,

                          detailDirection:
                            nextDirection,

                          commandKey:
                            Date.now(),
                        }
                      );

                      setAdminLocationKey(
                        (value) =>
                          value + 1
                      );
                    }}
                    className="rounded-xl border border-blue-500/60 bg-blue-950/40 px-3 py-2 text-[11px] font-black text-blue-200 hover:bg-blue-900/60"
                    title={`Cambiar nivel de detalle de ${adminSelectedLocation.label}`}
                  >
                    🔎 Ver detalle
                  </button>
                )}

                {onOpenHistory && (
                  <button
                    type="button"
                    onClick={
                      onOpenHistory
                    }
                    className="rounded-xl border border-violet-500/50 bg-violet-950/30 px-3 py-2 text-[11px] font-black text-violet-200 hover:bg-violet-900/50"
                    title="Abrir historial, estadísticas y zonas calientes"
                  >
                    📊 Historial / Estadísticas
                  </button>
                )}

              </div>

              <div className="grid gap-2 sm:grid-cols-3">

                <select
                  value={
                    provinciaId
                  }
                  onChange={(
                    event
                  ) => {
                    setProvinciaId(
                      event
                        .target
                        .value
                    );

                    setDistrict(
                      ""
                    );

                    setLocalidadId(
                      ""
                    );

                    setSelectedDistrictBoundary(
                      null
                    );

                    setAdminSelectedLocation(
                      null
                    );
                  }}
                  className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
                >
                  <option value="">
                    Seleccionar provincia
                  </option>

                  {provincias.map(
                    (
                      provincia
                    ) => (
                      <option
                        key={
                          provincia.id
                        }
                        value={
                          provincia.id
                        }
                      >
                        {
                          provincia.nombre
                        }
                      </option>
                    )
                  )}
                </select>

                <select
                  value={
                    district
                  }
                  onChange={(
                    event
                  ) =>
                    seleccionarPartido(
                      event
                        .target
                        .value
                    )
                  }
                  disabled={
                    !provinciaId
                  }
                  className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
                >
                  <option value="">
                    {provincias.find(
                      (item) =>
                        item.id ===
                        provinciaId
                    )?.nombre ===
                    "Buenos Aires"
                      ? "Seleccionar partido"
                      : "Seleccionar departamento / municipio"}
                  </option>

                  {districts.map(
                    (item) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={
                    localidadId
                  }
                  onChange={(
                    event
                  ) =>
                    seleccionarLocalidad(
                      event
                        .target
                        .value
                    )
                  }
                  disabled={
                    !district
                  }
                  className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
                >
                  <option value="">
                    Seleccionar localidad (opcional)
                  </option>

                  {localidades.map(
                    (
                      localidad
                    ) => (
                      <option
                        key={
                          localidad.id
                        }
                        value={
                          localidad.id
                        }
                      >
                        {
                          localidad.nombre
                        }
                      </option>
                    )
                  )}
                </select>

              </div>

              {adminSelectedLocation && (
                <p className="mt-2 text-[11px] font-semibold text-emerald-400">
                  ✓ Mostrando{" "}
                  {
                    adminSelectedLocation.label
                  }
                </p>
              )}

            </div>
          )}

        {/* FILTROS */}

        {!kioskMode && (
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">

            {FILTROS.map(
              (item) => (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  onClick={() =>
                    setFiltro(
                      item.value
                    )
                  }
                  className={`shrink-0 rounded-full border px-3 py-2 font-semibold transition ${
                    filtro ===
                    item.value
                      ? "border-white/30 bg-white text-slate-950"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500 hover:bg-slate-900"
                  }`}
                >
                  {
                    item.label
                  }
                </button>
              )
            )}

            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">

              <span className="rounded-full bg-slate-950 px-3 py-2 font-semibold text-slate-400">
                {
                  filteredReports.length
                }{" "}
                visibles
              </span>

              {mode ===
                "admin" &&
                weatherLayerEnabled && (
                  <span className="rounded-full border border-sky-500/40 bg-sky-950/40 px-3 py-2 font-black text-sky-300">
                    🌦️ Zonas SMN
                  </span>
                )}

              {mode ===
                "admin" && (
                <button
                  type="button"
                  onClick={() =>
                    setResetKey(
                      (value) =>
                        value +
                        1
                    )
                  }
                  className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-slate-200 transition hover:bg-slate-800"
                  title="Centrar mapa"
                >
                  ◎ Centrar
                </button>
              )}

            </div>

          </div>
        )}

        {/* MAPA */}

        <div
          className={`${heightClassName} w-full overflow-hidden ${
            kioskMode
              ? "rounded-none"
              : "rounded-2xl"
          } bg-slate-950`}
        >

          <MapContainer
            center={
              OTAMENDI_CENTER
            }
            zoom={14}
            style={{
              height: "100%",
              width: "100%",
            }}
            zoomControl
            scrollWheelZoom
          >

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* CONTROL DE CÁMARA */}

            {mode === "admin" ? (
              <AdminViewport
                reports={
                  filteredReports
                }
                resetKey={
                  resetKey
                }
                selectedLocation={
                  adminSelectedLocation
                }
                locationKey={
                  adminLocationKey
                }
                focusTarget={
                  focusTarget
                }
              />
            ) : (
              <PublicViewport
                userPosition={
                  userPosition
                }
                locationKey={
                  locationKey
                }
                radiusMeters={
                  publicViewportRadiusMeters
                }
              />
            )}

            {/* UBICACIÓN DEL VECINO */}

            {mode ===
              "public" &&
              userPosition && (
                <>
                  <Circle
                    center={[
                      userPosition.latitude,
                      userPosition.longitude,
                    ]}
                    radius={
                      PUBLIC_MAP_RADIUS_METERS
                    }
                    pathOptions={{
                      color:
                        "#3b82f6",

                      weight:
                        1.5,

                      opacity:
                        0.35,

                      fillColor:
                        "#3b82f6",

                      fillOpacity:
                        0.035,
                    }}
                  />

                  <Marker
                    position={[
                      userPosition.latitude,
                      userPosition.longitude,
                    ]}
                    icon={
                      getUserIcon()
                    }
                  >
                    <Popup>
                      <strong>
                        📍 Tu ubicación
                      </strong>

                      <div
                        style={{
                          marginTop:
                            5,

                          fontSize:
                            12,

                          color:
                            "#64748b",
                        }}
                      >
                        Posición aproximada obtenida por GPS.
                      </div>
                    </Popup>
                  </Marker>
                </>
              )}

            {/* LÍMITES DE JURISDICCIÓN */}

            {visibleJurisdictionBoundaries.map(
              (boundary) => (
                <GeoJSON
                  key={
                    boundary.key
                  }
                  data={
                    boundary.data
                  }
                  style={{
                    color:
                      "#ef4444",

                    weight:
                      2.5,

                    opacity:
                      0.72,

                    fillColor:
                      "#ef4444",

                    fillOpacity:
                      0.03,

                    dashArray:
                      "8 8",
                  }}
                >
                  <Popup>
                    <strong>
                      Jurisdicción:{" "}
                      {
                        boundary.label
                      }
                    </strong>

                    <div
                      style={{
                        marginTop:
                          5,

                        fontSize:
                          12,

                        color:
                          "#64748b",
                      }}
                    >
                      Límite territorial de referencia.
                    </div>
                  </Popup>
                </GeoJSON>
              )
            )}

            {/* =================================================
                ZONAS OFICIALES DEL SMN
            ================================================= */}

            {mode ===
              "admin" &&
              weatherLayerEnabled &&
              weatherMapAlerts.map(
                (alert) => {
                  const color =
                    weatherLayerColor(
                      alert.severity
                    );

                  const severityLabel =
                    weatherSeverityLabel(
                      alert.severity
                    );

                  return alert.areas.map(
                    (
                      area,
                      areaIndex
                    ) => (
                      <div
                        key={`weather-area-${alert.id}-${areaIndex}`}
                      >

                        {area.polygons.map(
                          (
                            polygon,
                            polygonIndex
                          ) => (
                            <Polygon
                              key={`weather-polygon-${alert.id}-${areaIndex}-${polygonIndex}`}
                              positions={polygon.map(
                                (
                                  point
                                ) =>
                                  [
                                    point[0],
                                    point[1],
                                  ] as [
                                    number,
                                    number,
                                  ]
                              )}
                              pathOptions={{
                                color,
                                weight:
                                  3,

                                opacity:
                                  0.9,

                                fillColor:
                                  color,

                                fillOpacity:
                                  0.16,

                                dashArray:
                                  "10 6",
                              }}
                            >
                              <Popup
                                minWidth={
                                  280
                                }
                              >
                                <div
                                  style={{
                                    color:
                                      "#0f172a",
                                  }}
                                >
                                  <strong>
                                    🌦️ ALERTA OFICIAL SMN
                                  </strong>

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      fontSize:
                                        15,

                                      fontWeight:
                                        800,
                                    }}
                                  >
                                    {
                                      alert.event
                                    }
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        5,

                                      display:
                                        "inline-block",

                                      borderRadius:
                                        999,

                                      padding:
                                        "4px 8px",

                                      background:
                                        color,

                                      color:
                                        "white",

                                      fontSize:
                                        10,

                                      fontWeight:
                                        800,
                                    }}
                                  >
                                    {
                                      severityLabel
                                    }
                                  </div>

                                  {alert.headline && (
                                    <div
                                      style={{
                                        marginTop:
                                          8,

                                        fontSize:
                                          12,

                                        lineHeight:
                                          1.5,
                                      }}
                                    >
                                      {
                                        alert.headline
                                      }
                                    </div>
                                  )}

                                  {(area.description ||
                                    alert.areaDescription) && (
                                    <div
                                      style={{
                                        marginTop:
                                          8,

                                        fontSize:
                                          12,

                                        color:
                                          "#475569",
                                      }}
                                    >
                                      📍{" "}
                                      {area.description ||
                                        alert.areaDescription}
                                    </div>
                                  )}

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      fontSize:
                                        11,

                                      color:
                                        "#64748b",
                                    }}
                                  >
                                    Vigente hasta:{" "}
                                    {
                                      formatWeatherMapDate(
                                        alert.expiresAt
                                      )
                                    }
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      borderTop:
                                        "1px solid #e2e8f0",

                                      paddingTop:
                                        7,

                                      fontSize:
                                        10,

                                      color:
                                        "#64748b",
                                    }}
                                  >
                                    Fuente oficial: Servicio Meteorológico Nacional
                                  </div>
                                </div>
                              </Popup>
                            </Polygon>
                          )
                        )}

                        {area.circles.map(
                          (
                            circle,
                            circleIndex
                          ) => (
                            <Circle
                              key={`weather-circle-${alert.id}-${areaIndex}-${circleIndex}`}
                              center={[
                                circle.latitude,
                                circle.longitude,
                              ]}
                              radius={
                                circle.radiusKm *
                                1000
                              }
                              pathOptions={{
                                color,
                                weight:
                                  3,

                                opacity:
                                  0.9,

                                fillColor:
                                  color,

                                fillOpacity:
                                  0.16,

                                dashArray:
                                  "10 6",
                              }}
                            >
                              <Popup
                                minWidth={
                                  280
                                }
                              >
                                <div
                                  style={{
                                    color:
                                      "#0f172a",
                                  }}
                                >
                                  <strong>
                                    🌦️ ALERTA OFICIAL SMN
                                  </strong>

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      fontSize:
                                        15,

                                      fontWeight:
                                        800,
                                    }}
                                  >
                                    {
                                      alert.event
                                    }
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        5,

                                      display:
                                        "inline-block",

                                      borderRadius:
                                        999,

                                      padding:
                                        "4px 8px",

                                      background:
                                        color,

                                      color:
                                        "white",

                                      fontSize:
                                        10,

                                      fontWeight:
                                        800,
                                    }}
                                  >
                                    {
                                      severityLabel
                                    }
                                  </div>

                                  {(area.description ||
                                    alert.areaDescription) && (
                                    <div
                                      style={{
                                        marginTop:
                                          8,

                                        fontSize:
                                          12,

                                        color:
                                          "#475569",
                                      }}
                                    >
                                      📍{" "}
                                      {area.description ||
                                        alert.areaDescription}
                                    </div>
                                  )}

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      fontSize:
                                        11,

                                      color:
                                        "#64748b",
                                    }}
                                  >
                                    Vigente hasta:{" "}
                                    {
                                      formatWeatherMapDate(
                                        alert.expiresAt
                                      )
                                    }
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        8,

                                      borderTop:
                                        "1px solid #e2e8f0",

                                      paddingTop:
                                        7,

                                      fontSize:
                                        10,

                                      color:
                                        "#64748b",
                                    }}
                                  >
                                    Fuente oficial: Servicio Meteorológico Nacional
                                  </div>
                                </div>
                              </Popup>
                            </Circle>
                          )
                        )}

                      </div>
                    )
                  );
                }
              )}

            {/* ZONAS CALIENTES */}

            {hotZoneMode &&
              hotZones.map(
                (zone) => {
                  const radius =
                    Math.min(
                      850,
                      220 +
                        zone.count *
                          70
                    );

                  const fillOpacity =
                    Math.min(
                      0.42,
                      0.1 +
                        zone.count *
                          0.035
                    );

                  return (
                    <Circle
                      key={`hot-${zone.key}`}
                      center={[
                        zone.latitude,
                        zone.longitude,
                      ]}
                      radius={
                        radius
                      }
                      pathOptions={{
                        color:
                          zone.count >=
                          8
                            ? "#ef4444"
                            : zone.count >=
                                5
                              ? "#f97316"
                              : "#eab308",

                        weight:
                          2,

                        opacity:
                          0.8,

                        fillColor:
                          zone.count >=
                          8
                            ? "#ef4444"
                            : zone.count >=
                                5
                              ? "#f97316"
                              : "#eab308",

                        fillOpacity,
                      }}
                    >
                      <Popup>
                        <strong>
                          🔥 Zona caliente aproximada
                        </strong>

                        <div
                          style={{
                            marginTop:
                              6,

                            fontSize:
                              12,
                          }}
                        >
                          {
                            zone.count
                          }{" "}
                          reportes concentrados en este sector.
                        </div>
                      </Popup>
                    </Circle>
                  );
                }
              )}

            {/* ALERTAS PREVENTIVAS AGRUPADAS */}

            {preventiveAlerts.map(
              (alert) => {
                if (
                  alert.centerLatitude ===
                    null ||
                  alert.centerLongitude ===
                    null
                ) {
                  return null;
                }

                const isVehicle =
                  alert.category ===
                  "Vehículo sospechoso";

                const color =
                  isVehicle
                    ? "#f59e0b"
                    : "#fb923c";

                const icon =
                  L.divIcon({
                    className:
                      "",

                    html: `<div style="position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center">
                  <div style="position:absolute;width:42px;height:42px;border-radius:50%;background:${color};opacity:.42;animation:alertaPulse 1.25s infinite"></div>
                  <div style="position:relative;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};border:3px solid white;box-shadow:0 0 0 5px ${color}33,0 4px 18px rgba(0,0,0,.5);font-size:21px;z-index:2">⚠️</div>
                </div>`,

                    iconSize: [
                      54,
                      54,
                    ],

                    iconAnchor: [
                      27,
                      27,
                    ],

                    popupAnchor: [
                      0,
                      -29,
                    ],
                  });

                return (
                  <div
                    key={`preventive-${alert.id}`}
                  >
                    <Circle
                      center={[
                        alert.centerLatitude,
                        alert.centerLongitude,
                      ]}
                      radius={Math.max(
                        150,
                        alert.radiusKm *
                          1000
                      )}
                      pathOptions={{
                        color,

                        weight:
                          3,

                        opacity:
                          0.8,

                        fillColor:
                          color,

                        fillOpacity:
                          0.12,

                        dashArray:
                          "8 6",
                      }}
                    />

                    <Marker
                      position={[
                        alert.centerLatitude,
                        alert.centerLongitude,
                      ]}
                      icon={
                        icon
                      }
                    >
                      <Popup
                        minWidth={
                          270
                        }
                      >
                        <div
                          style={{
                            color:
                              "#0f172a",
                          }}
                        >
                          <strong>
                            ⚠️ ALERTA PREVENTIVA ACTIVA
                          </strong>

                          <div
                            style={{
                              marginTop:
                                8,

                              fontSize:
                                13,
                            }}
                          >
                            <b>
                              Tipo:
                            </b>{" "}
                            {
                              alert.category
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                4,

                              fontSize:
                                13,
                            }}
                          >
                            <b>
                              Reportes coincidentes:
                            </b>{" "}
                            {
                              alert.reportCount
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                4,

                              fontSize:
                                13,
                            }}
                          >
                            <b>
                              Radio aproximado:
                            </b>{" "}
                            {Math.round(
                              alert.radiusKm *
                                1000
                            )}{" "}
                            m
                          </div>

                          <div
                            style={{
                              marginTop:
                                8,

                              fontSize:
                                12,

                              color:
                                "#475569",
                            }}
                          >
                            {mode ===
                            "admin"
                              ? alert.summary ||
                                "Varios reportes coincidentes generaron esta alerta preventiva."
                              : "Se recibieron varios reportes coincidentes sobre una situación sospechosa en el sector. Mantenga precaución y utilice los servicios oficiales ante una emergencia."}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                );
              }
            )}

            {/* ALERTAS */}

            {filteredReports.map(
              (report) => {
                const created =
                  new Date(
                    report.createdAt
                  ).getTime();

                const age =
                  Number.isFinite(
                    created
                  )
                    ? Date.now() -
                      created
                    : Infinity;

                const isNew =
                  age >= 0 &&
                  age <=
                    NEW_REPORT_MINUTES *
                      60 *
                      1000;

                const config =
                  MARKER_CONFIG[
                    report.category
                  ] || {
                    color:
                      "#64748b",

                    emoji:
                      "📍",

                    label:
                      "Alerta",
                  };

                return (
                  <Marker
                    key={
                      report.id
                    }
                    position={
                      markerPositions.get(
                        report.id
                      ) ?? [
                        report.latitude!,
                        report.longitude!,
                      ]
                    }
                    icon={getMarkerIcon(
                      report.category,
                      isNew,
                      mode
                    )}
                  >

                    <Popup
                      minWidth={
                        235
                      }
                    >
                      <div
                        style={{
                          color:
                            "#0f172a",
                        }}
                      >

                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap: 9,
                          }}
                        >

                          <span
                            style={{
                              display:
                                "inline-flex",

                              width:
                                32,

                              height:
                                32,

                              alignItems:
                                "center",

                              justifyContent:
                                "center",

                              borderRadius:
                                9,

                              background:
                                config.color,

                              color:
                                "white",

                              fontSize:
                                17,
                            }}
                          >
                            {
                              config.emoji
                            }
                          </span>

                          <div>
                            <strong>
                              {displayCategory(
                                report.category
                              )}
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  2,

                                fontSize:
                                  12,

                                color:
                                  "#64748b",
                              }}
                            >
                              {relativeTime(
                                report.createdAt
                              )}

                              {" · "}

                              {statusLabel(
                                report.status
                              )}
                            </div>
                          </div>

                        </div>

                        {mode ===
                        "admin" ? (
                          <>

                            <div
                              style={{
                                marginTop:
                                  11,

                                fontSize:
                                  13,
                              }}
                            >
                              <strong>
                                Reporte #
                                {
                                  report.id
                                }
                              </strong>
                            </div>

                            {report.description && (
                              <div
                                style={{
                                  marginTop:
                                    7,

                                  fontSize:
                                    13,

                                  lineHeight:
                                    1.4,
                                }}
                              >
                                {report.description
                                  .length >
                                140
                                  ? `${report.description.slice(
                                      0,
                                      140
                                    )}…`
                                  : report.description}
                              </div>
                            )}

                            <div
                              style={{
                                marginTop:
                                  9,

                                fontSize:
                                  11,

                                color:
                                  "#64748b",
                              }}
                            >
                              {privacyMode
                                ? "📍 Sector aproximado · ubicación exacta protegida"
                                : `📍 ${report.latitude?.toFixed(
                                    5
                                  )}, ${report.longitude?.toFixed(
                                    5
                                  )}`}
                            </div>

                            {onSelectReport && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectReport(
                                    report
                                  )
                                }
                                style={{
                                  marginTop:
                                    11,

                                  width:
                                    "100%",

                                  border:
                                    0,

                                  borderRadius:
                                    10,

                                  padding:
                                    "10px",

                                  background:
                                    "#0f172a",

                                  color:
                                    "white",

                                  fontWeight:
                                    700,

                                  cursor:
                                    "pointer",
                                }}
                              >
                                Ver detalle completo
                              </button>
                            )}

                          </>
                        ) : (
                          <div
                            style={{
                              marginTop:
                                11,

                              paddingTop:
                                9,

                              borderTop:
                                "1px solid #e2e8f0",

                              fontSize:
                                12,

                              lineHeight:
                                1.45,

                              color:
                                "#475569",
                            }}
                          >
                            📍 Ubicación aproximada por seguridad.
                            <br />
                            Los datos completos son visibles únicamente para el Centro de Monitoreo.
                          </div>
                        )}

                      </div>
                    </Popup>

                  </Marker>
                );
              }
            )}

          </MapContainer>

        </div>

        {/* PIE MAPA PÚBLICO */}

        {mode ===
          "public" && (
          <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px] leading-4 text-slate-500">

            <span>
              🔒 Ubicaciones públicas aproximadas
            </span>

            <span>
              🔴 Alertas recientes
            </span>

          </div>
        )}

      </div>
    </>
  );
}
