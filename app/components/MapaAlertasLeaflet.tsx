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
  id: number; category: string; reportIds?: number[]; reportCount: number;
  centerLatitude: number | null; centerLongitude: number | null; radiusKm: number;
  summary?: string; status?: string; createdAt: string; updatedAt?: string;
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
  properties: { province: string; district: string; label?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

type UserPosition = {
  latitude: number;
  longitude: number;
};

type Provincia = { id: string; nombre: string };
type Localidad = LocalidadArgentina;
type AdminSelectedLocation = {
  latitude: number;
  longitude: number;
  label: string;
  localityId?: string;
  bounds?: [[number, number], [number, number]];
  detailZoom?: boolean;
  detailLevel?: 0 | 1 | 2;
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

const ADMIN_LAST_LOCATION_STORAGE_KEY = "alerta_otamendi_admin_last_location_v2";

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
};

function displayCategory(category: string) {
  return category === "Delito / Robo" ? "Hurto / Robo" : category;
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
];

/* =========================================================
   FUNCIONES AUXILIARES
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

  // En monitoreo, una sospecha aislada debe verse pero sin competir
  // visualmente con una alerta preventiva ya confirmada (3+ reportes).
  const isSuspicion =
    category === "Persona sospechosa" ||
    category === "Vehículo sospechoso";
  const compact = mode === "admin" && isSuspicion;
  const critical = isCritical(category);

  const markerSize = compact ? 27 : critical ? 44 : 40;
  const wrapperWidth = compact ? 38 : 56;
  const wrapperHeight = compact ? 42 : 60;
  const anchorX = Math.round(wrapperWidth / 2);
  const anchorY = compact ? 35 : 51;
  const borderWidth = compact ? 2 : 3;
  const radius = compact ? "9px 9px 9px 2px" : "14px 14px 14px 3px";
  const fontSize = compact ? 13 : critical ? 20 : 18;
  const pulseSize = markerSize;
  const pulseLeft = Math.round((wrapperWidth - pulseSize) / 2);
  const pulseTop = compact ? 4 : 5;

  // Alta prioridad: pulso permanente para que destaque incluso después
  // de los primeros minutos. El resto conserva el pulso de "reporte nuevo".
  const shouldPulse = critical || (!compact && isNew);

  const glow = critical
    ? `0 0 0 6px ${item.color}38,
       0 0 28px ${item.color}88,
       0 8px 22px rgba(0,0,0,.58)`
    : compact
      ? "0 4px 10px rgba(0,0,0,.38)"
      : "0 7px 20px rgba(0,0,0,.50)";

  return L.divIcon({
    className: "alerta-marker-wrapper",
    html: `
      <div style="position:relative;width:${wrapperWidth}px;height:${wrapperHeight}px;display:flex;align-items:center;justify-content:center;">
        ${shouldPulse ? `
          <div style="position:absolute;top:${pulseTop}px;left:${pulseLeft}px;width:${pulseSize}px;height:${pulseSize}px;border-radius:999px;background:${item.color};opacity:.42;animation:alertaPulse ${critical ? "1.15s" : "1.35s"} infinite;"></div>
        ` : ""}
        <div style="position:relative;width:${markerSize}px;height:${markerSize}px;border-radius:${radius};transform:rotate(-45deg);background:${item.color};border:${borderWidth}px solid white;box-shadow:${glow};display:flex;align-items:center;justify-content:center;z-index:2;">
          <span style="transform:rotate(45deg);font-size:${fontSize}px;line-height:1;">${item.emoji}</span>
        </div>
      </div>
    `,
    iconSize: [wrapperWidth, wrapperHeight],
    iconAnchor: [anchorX, anchorY],
    popupAnchor: [0, -anchorY + 5],
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
  switch (status.toLowerCase()) {
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
  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const diff = Math.max(
    0,
    Date.now() - timestamp
  );

  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return "Ahora";
  }

  const minutes = Math.floor(
    seconds / 60
  );

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  const days = Math.floor(
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
  focusTarget: MapFocusTarget | null;
}) {
  const map = useMap();

  /*
   * Guardamos siempre la lista más reciente de reportes,
   * pero NO usamos sus cambios para mover la cámara.
   *
   * Esto evita que el mapa del Centro de Monitoreo vuelva
   * solo a su posición cada vez que se actualizan los reportes.
   */
  const reportsRef = useRef(reports);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  useEffect(() => {
    const validReports = reportsRef.current.filter(
      (report) =>
        report.latitude !== null &&
        report.longitude !== null
    );

    const timer = window.setTimeout(() => {
      map.invalidateSize();

      // Una orden explícita (por ejemplo «Volver al mapa» desde un reporte)
      // siempre tiene prioridad sobre la localidad seleccionada.
      if (focusTarget) {
        const bounds = L.latLng(
          focusTarget.latitude,
          focusTarget.longitude
        ).toBounds((focusTarget.radiusMeters ?? 1500) * 2);

        map.fitBounds(bounds, {
          padding: [24, 24],
          animate: true,
          duration: 0.6,
        });
        return;
      }

      if (selectedLocation) {
        // «Ver detalle» funciona en 3 pasos sobre la localidad seleccionada:
        // 0 = vista normal, 1 = calles, 2 = detalle cercano.
        const detailLevel = selectedLocation.detailLevel ?? (selectedLocation.detailZoom ? 1 : 0);
        if (detailLevel > 0) {
          const detailDiameterMeters = detailLevel === 2 ? 1400 : 3200;
          const detailBounds = L.latLng(
            selectedLocation.latitude,
            selectedLocation.longitude
          ).toBounds(detailDiameterMeters);
          map.fitBounds(detailBounds, {
            padding: [24, 24],
            maxZoom: detailLevel === 2 ? 18 : 17,
            animate: true,
            duration: 0.6,
          });
          return;
        }

        if (selectedLocation.bounds) {
          map.fitBounds(selectedLocation.bounds, {
            padding: [34, 34],
            maxZoom: 17,
            animate: true,
            duration: 0.6,
          });
        } else {
          // Respaldo mientras no haya límites oficiales disponibles.
          const fallbackBounds = L.latLng(
            selectedLocation.latitude,
            selectedLocation.longitude
          ).toBounds(3000);
          map.fitBounds(fallbackBounds, { padding: [34, 34], maxZoom: 16, animate: true });
        }
        return;
      }

      if (validReports.length === 0) {
        map.setView(
          OTAMENDI_CENTER,
          14,
          {
            animate: true,
          }
        );

        return;
      }

      if (validReports.length === 1) {
        map.setView(
          [
            validReports[0].latitude!,
            validReports[0].longitude!,
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
            ] as [number, number]
        ) as LatLngBoundsExpression;

      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 16,
        animate: true,
      });
    }, 100);

    return () => {
      window.clearTimeout(timer);
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
  userPosition: UserPosition | null;
  locationKey: number;
  radiusMeters: number;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      /*
       * Si todavía no tenemos la ubicación:
       * usamos Otamendi como respaldo y mostramos
       * aproximadamente 1,5 km a la redonda.
       */
      if (!userPosition) {
        const defaultBounds = L.latLng(
          OTAMENDI_CENTER[0],
          OTAMENDI_CENTER[1]
        ).toBounds(PUBLIC_DEFAULT_RADIUS_METERS * 2);

        map.fitBounds(defaultBounds, {
          padding: [24, 24],
          animate: false,
        });

        return;
      }

      /*
       * Con la ubicación disponible:
       * usamos 1,5 km al abrir automáticamente
       * y 200 m al tocar "Mi ubicación".
       */
      const userBounds = L.latLng(
        userPosition.latitude,
        userPosition.longitude
      ).toBounds(radiusMeters * 2);

      map.fitBounds(userBounds, {
        padding: [24, 24],
        animate: true,
        duration: 0.6,
      });
    }, 100);

    return () => {
      window.clearTimeout(timer);
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
  const [filtro, setFiltro] =
    useState("Todos");

  const [resetKey, setResetKey] =
    useState(0);

  const [locationKey, setLocationKey] =
    useState(0);

  const [
    publicViewportRadiusMeters,
    setPublicViewportRadiusMeters,
  ] = useState(PUBLIC_DEFAULT_RADIUS_METERS);

  const [
    userPosition,
    setUserPosition,
  ] =
    useState<UserPosition | null>(
      null
    );

  const [locating, setLocating] =
    useState(false);

  const [preventiveAlerts, setPreventiveAlerts] = useState<PreventiveAlert[]>([]);
  const [jurisdictionBoundaries, setJurisdictionBoundaries] = useState<Array<{ key: string; label: string; data: GeoJsonObject }>>([]);
  const [selectedDistrictBoundary, setSelectedDistrictBoundary] = useState<{ key: string; label: string; data: GeoJsonObject } | null>(null);

  const [
    locationMessage,
    setLocationMessage,
  ] = useState("");

  const [provincias] = useState<Provincia[]>(provinciasArgentina);
  const [provinciaId, setProvinciaId] = useState("");
  const [district, setDistrict] = useState("");
  const [localidadId, setLocalidadId] = useState("");
  const [adminSelectedLocation, setAdminSelectedLocation] = useState<AdminSelectedLocation>(null);
  const [adminLocationKey, setAdminLocationKey] = useState(0);

  const districts = useMemo(() => Array.from(new Set(
    localidadesPorProvincia(provinciaId)
      .map((item) => item.municipio || item.departamento)
      .filter((item): item is string => Boolean(item))
  )).sort((a, b) => a.localeCompare(b, "es")), [provinciaId]);

  const localidades = useMemo<Localidad[]>(() => localidadesPorProvincia(provinciaId)
    .filter((item) => (item.municipio || item.departamento) === district)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [district, provinciaId]);

  const primaryZone = useMemo<MonitorZone>(() => monitorZones[0] ?? {
    province: "Buenos Aires",
    district: "General Alvarado",
    locality: null,
  }, [monitorZones]);

  // Zona principal del usuario. Para el administrador legado, que no tiene
  // zonas asignadas en la base, usamos Otamendi como jurisdicción principal.
  const primaryJurisdiction = useMemo<AdminSelectedLocation>(() => {
    const zone = primaryZone;

    const zoneLocality = zone.locality;
    if (zoneLocality) {
      const normalized = (value: string) => value.trim().toLocaleLowerCase("es-AR");
      for (const provincia of provinciasArgentina) {
        const localidades = localidadesPorProvincia(provincia.id);
        const match = localidades.find((item) => normalized(item.nombre) === normalized(zoneLocality));
        if (match) {
          return {
            latitude: match.lat,
            longitude: match.lon,
            label: `${zoneLocality}, ${zone.district}`,
            localityId: match.id,
          };
        }
      }
    }

    const boundary = jurisdictionBoundaries.find((item) => item.key === `${zone.province}|${zone.district}`);
    if (boundary) {
      const leafletBounds = L.geoJSON(boundary.data).getBounds();
      if (leafletBounds.isValid()) {
        const center = leafletBounds.getCenter();
        return {
          latitude: center.lat,
          longitude: center.lng,
          label: `Partido / departamento de ${zone.district}`,
          bounds: [
            [leafletBounds.getSouth(), leafletBounds.getWest()],
            [leafletBounds.getNorth(), leafletBounds.getEast()],
          ],
        };
      }
    }

    return { latitude: OTAMENDI_CENTER[0], longitude: OTAMENDI_CENTER[1], label: zone.district || "Mi jurisdicción" };
  }, [primaryZone, jurisdictionBoundaries]);

  const mountedRef =
    useRef(true);

  /* =======================================================
     MONTAJE / DESMONTAJE
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =======================================================
     RECORDAR ÚLTIMA PROVINCIA / LOCALIDAD - SOLO ADMIN
  ======================================================= */

  useEffect(() => {
    if (mode !== "admin" || typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        ADMIN_LAST_LOCATION_STORAGE_KEY
      );

      if (!raw) {
        return;
      }

      const saved = JSON.parse(raw) as {
        provinciaId?: string;
        district?: string;
        localidadId?: string;
        latitude?: number;
        longitude?: number;
        label?: string;
      };

      if (saved.provinciaId) {
        setProvinciaId(saved.provinciaId);
      }

      if (saved.district) setDistrict(saved.district);
      if (saved.localidadId) setLocalidadId(saved.localidadId);

      if (
        typeof saved.latitude === "number" &&
        typeof saved.longitude === "number" &&
        typeof saved.label === "string"
      ) {
        setAdminSelectedLocation({
          latitude: saved.latitude,
          longitude: saved.longitude,
          label: saved.label,
        });

        setAdminLocationKey(
          (value) => value + 1
        );
      }
    } catch (error) {
      console.error(
        "No se pudo recuperar la última localidad del Centro de Monitoreo:",
        error
      );
    }
  }, [mode]);

  function targetFromBoundary(data: GeoJsonObject, label: string): NonNullable<AdminSelectedLocation> | null {
    const leafletBounds = L.geoJSON(data).getBounds();
    if (!leafletBounds.isValid()) return null;
    const center = leafletBounds.getCenter();
    return {
      latitude: center.lat,
      longitude: center.lng,
      label,
      bounds: [
        [leafletBounds.getSouth(), leafletBounds.getWest()],
        [leafletBounds.getNorth(), leafletBounds.getEast()],
      ],
      detailZoom: false,
      detailLevel: 0,
    };
  }

  async function mostrarPartido(provinceIdValue: string, districtValue: string) {
    const province = provincias.find((item) => item.id === provinceIdValue);
    if (!province || !districtValue) return;

    const districtLocalities = localidadesPorProvincia(provinceIdValue)
      .filter((item) => (item.municipio || item.departamento) === districtValue);
    if (districtLocalities.length) {
      const latitude = districtLocalities.reduce((sum, item) => sum + item.lat, 0) / districtLocalities.length;
      const longitude = districtLocalities.reduce((sum, item) => sum + item.lon, 0) / districtLocalities.length;
      setAdminSelectedLocation({ latitude, longitude, label: `${districtValue}, ${province.nombre}` });
      setAdminLocationKey((value) => value + 1);
    }

    try {
      const params = new URLSearchParams({ province: province.nombre, district: districtValue });
      const response = await fetch(`/api/admin/jurisdiction-boundary?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !data.boundary) return;
      const boundary = {
        key: `${province.nombre}|${districtValue}`,
        label: districtValue,
        data: data.boundary as GeoJsonObject,
      };
      setSelectedDistrictBoundary(boundary);
      const target = targetFromBoundary(boundary.data, `Partido / departamento de ${districtValue}`);
      if (target) {
        setAdminSelectedLocation(target);
        setAdminLocationKey((value) => value + 1);
      }
    } catch (error) {
      console.warn("No se pudo cargar el límite del partido o departamento:", error);
    }
  }

  function seleccionarPartido(value: string) {
    setDistrict(value);
    setLocalidadId("");
    setSelectedDistrictBoundary(null);
    if (!value) {
      setAdminSelectedLocation(null);
      return;
    }
    void mostrarPartido(provinciaId, value);
    try {
      window.localStorage.setItem(ADMIN_LAST_LOCATION_STORAGE_KEY, JSON.stringify({ provinciaId, district: value }));
    } catch (error) {
      console.error("No se pudo guardar el último partido del Centro de Monitoreo:", error);
    }
  }

  function seleccionarLocalidad(id: string) {
    setLocalidadId(id);

    const localidad =
      localidades.find(
        (item) => item.id === id
      );

    const provincia =
      provincias.find(
        (item) => item.id === provinciaId
      );

    if (!localidad) {
      return;
    }

    const label =
      `${localidad.nombre}${provincia ? `, ${provincia.nombre}` : ""}`;

    const baseLocation: NonNullable<AdminSelectedLocation> = {
      latitude: localidad.lat,
      longitude: localidad.lon,
      label,
      localityId: localidad.id,
    };

    setAdminSelectedLocation(baseLocation);
    setAdminLocationKey((value) => value + 1);

    // Pedimos los límites oficiales de la localidad censal. Leaflet calcula
    // automáticamente el zoom más cercano que permite verla completa.
    fetch(`/api/georef?tipo=limites-localidad&id=${encodeURIComponent(localidad.id)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.success || !Array.isArray(data.bounds)) return;
        setAdminSelectedLocation({ ...baseLocation, bounds: data.bounds });
        setAdminLocationKey((value) => value + 1);
      })
      .catch((error) => console.warn("No se pudieron cargar límites de localidad:", error));

    try {
      window.localStorage.setItem(
        ADMIN_LAST_LOCATION_STORAGE_KEY,
        JSON.stringify({
          provinciaId,
          district,
          localidadId: id,
          latitude: localidad.lat,
          longitude: localidad.lon,
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
    const zone = primaryZone;
    const province = provincias.find((item) => item.nombre === zone.province);
    if (!province) {
      if (primaryJurisdiction) {
        setAdminSelectedLocation({ ...primaryJurisdiction, detailZoom: false, detailLevel: 0 });
        setAdminLocationKey((value) => value + 1);
      }
      return;
    }

    setProvinciaId(province.id);
    setDistrict(zone.district);
    setSelectedDistrictBoundary(null);

    if (!zone.locality) {
      setLocalidadId("");
      await mostrarPartido(province.id, zone.district);
      return;
    }

    const locality = localidadesPorProvincia(province.id).find((item) =>
      (item.municipio || item.departamento) === zone.district &&
      item.nombre.trim().toLocaleLowerCase("es-AR") === zone.locality?.trim().toLocaleLowerCase("es-AR")
    );
    if (!locality) return;

    setLocalidadId(locality.id);
    const baseLocation: NonNullable<AdminSelectedLocation> = {
      latitude: locality.lat,
      longitude: locality.lon,
      label: `${locality.nombre}, ${zone.district}`,
      localityId: locality.id,
      detailZoom: false,
      detailLevel: 0,
    };
    setAdminSelectedLocation(baseLocation);
    setAdminLocationKey((value) => value + 1);

    try {
      const response = await fetch(`/api/georef?tipo=limites-localidad&id=${encodeURIComponent(locality.id)}`);
      const data = response.ok ? await response.json() : null;
      if (data?.success && Array.isArray(data.bounds)) {
        setAdminSelectedLocation({ ...baseLocation, bounds: data.bounds });
        setAdminLocationKey((value) => value + 1);
      }
    } catch (error) {
      console.warn("No se pudieron cargar los límites de la localidad asignada:", error);
    }
  }

  // Cargamos solamente alertas preventivas ya generadas (3+).
  // El monitoreo usa el endpoint privado; la app pública recibe solo datos seguros.
  useEffect(() => {
    if (mode !== "admin") {
      setJurisdictionBoundaries([]);
      return;
    }
    let cancelled = false;
    const zonesToLoad = monitorZones.length ? monitorZones : [primaryZone];
    const uniqueZones = Array.from(new Map(zonesToLoad.map((zone) => [`${zone.province}|${zone.district}`, zone])).values());
    Promise.all(uniqueZones.map(async (zone) => {
      const params = new URLSearchParams({ province: zone.province, district: zone.district });
      const response = await fetch(`/api/admin/jurisdiction-boundary?${params}`, { cache: "no-store" });
      const data = await response.json();
      return response.ok && data.success ? { key: `${zone.province}|${zone.district}`, label: zone.district, data: data.boundary as GeoJsonObject } : null;
    })).then((items) => {
      if (!cancelled) setJurisdictionBoundaries(items.filter((item): item is NonNullable<typeof item> => Boolean(item)));
    }).catch((error) => console.warn("No se pudieron cargar los límites de jurisdicción:", error));
    return () => { cancelled = true; };
  }, [mode, monitorZones, primaryZone]);

  const visibleJurisdictionBoundaries = useMemo(() => {
    if (!selectedDistrictBoundary || jurisdictionBoundaries.some((item) => item.key === selectedDistrictBoundary.key)) {
      return jurisdictionBoundaries;
    }
    return [...jurisdictionBoundaries, selectedDistrictBoundary];
  }, [jurisdictionBoundaries, selectedDistrictBoundary]);

  useEffect(() => {
    if (privacyMode) {
      setPreventiveAlerts([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const endpoint = mode === "admin" ? "/api/person-pattern-alerts" : "/api/preventive-alerts";
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok && data.success && Array.isArray(data.alerts)) {
          setPreventiveAlerts(data.alerts.filter((alert: PreventiveAlert) => alert.reportCount >= 3));
        }
      } catch (error) {
        console.error("Error cargando perímetros preventivos:", error);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), mode === "admin" ? 3000 : 12000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [mode, privacyMode]);

  /* =======================================================
     REPORTES FILTRADOS
  ======================================================= */

  const filteredReports =
    useMemo(() => {
      return reports.filter(
        (report) => {
          if (
            report.latitude === null ||
            report.longitude === null
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
            ["Persona sospechosa", "Vehículo sospechoso"].includes(report.category)
          ) {
            return false;
          }

          if (
            filtro !== "Todos" &&
            report.category !== filtro
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

  const hotZones = useMemo(() => {
    if (!hotZoneMode) return [] as Array<{ key: string; latitude: number; longitude: number; count: number }>;
    const groups = new Map<string, { latitude: number; longitude: number; count: number }>();
    for (const report of filteredReports) {
      if (report.latitude === null || report.longitude === null) continue;
      // Cuadrícula aproximada de 1 km. Suficiente para detectar concentración operativa sin afirmar un punto exacto.
      const latBucket = Math.round(report.latitude * 100) / 100;
      const lonBucket = Math.round(report.longitude * 100) / 100;
      const key = `${latBucket.toFixed(2)}:${lonBucket.toFixed(2)}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key, { latitude: latBucket, longitude: lonBucket, count: 1 });
    }
    return [...groups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
  }, [filteredReports, hotZoneMode]);

  /* =======================================================
     SOLICITAR UBICACIÓN
  ======================================================= */

  const requestUserLocation =
    useCallback(
      (
        recenter = true,
        radiusMeters = PUBLIC_USER_RADIUS_METERS
      ) => {
        if (mode !== "public") {
          return;
        }

        if (
          typeof navigator ===
            "undefined" ||
          !navigator.geolocation
        ) {
          setLocating(false);

          setLocationMessage(
            "Tu dispositivo no permite obtener la ubicación."
          );

          return;
        }

        setLocating(true);

        setLocationMessage(
          "Buscando tu ubicación…"
        );

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!mountedRef.current) {
              return;
            }

            const nextPosition: UserPosition =
              {
                latitude:
                  position.coords.latitude,

                longitude:
                  position.coords.longitude,
              };

            setUserPosition(
              nextPosition
            );

            setLocationMessage(
              "✅ Ubicación obtenida"
            );

            setLocating(false);

            if (recenter) {
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
            if (!mountedRef.current) {
              return;
            }

            setLocating(false);

            switch (error.code) {
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
            enableHighAccuracy: true,
            timeout: 15_000,
            maximumAge: 60_000,
          }
        );
      },
      [mode]
    );


  /* =======================================================
     UBICACIÓN AUTOMÁTICA AL ABRIR EL MAPA PÚBLICO
     - Intenta centrar en la ubicación actual.
     - Vista inicial aproximada: 1,5 km.
     - Si falla o no hay permiso, queda Otamendi como respaldo.
  ======================================================= */

  useEffect(() => {
    if (mode !== "public") {
      return;
    }

    requestUserLocation(
      true,
      PUBLIC_DEFAULT_RADIUS_METERS
    );
  }, [mode, requestUserLocation]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      {/* Animaciones de los marcadores */}

      <style jsx global>{`
        @keyframes alertaPulse {
          0% {
            transform: scale(0.75);
            opacity: 0.55;
          }

          70% {
            transform: scale(1.55);
            opacity: 0;
          }

          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }

        @keyframes usuarioPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.35;
          }

          70% {
            transform: scale(1.35);
            opacity: 0;
          }

          100% {
            transform: scale(1.35);
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

      <div className={kioskMode ? "h-full w-full bg-slate-950" : "rounded-3xl border border-slate-800 bg-slate-900/70 p-3 shadow-2xl shadow-black/10"}>

        {/* UBICACIÓN DEL USUARIO */}

        {mode === "public" && (
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
              disabled={locating}
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating
                ? "Ubicando…"
                : "📍 Mi ubicación"}
            </button>

          </div>
        )}

        {/* LOCALIDAD / PROVINCIA - SOLO CENTRO DE MONITOREO */}

        {mode === "admin" && !kioskMode && (
          <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-white">📍 Buscar localidad</p>
                <p className="mt-1 text-[10px] text-slate-500">Solo modifica la vista del Centro de Monitoreo.</p>
              </div>
              <button
                type="button"
                onClick={() => void mostrarMiJurisdiccion()}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white hover:bg-emerald-500"
                title={primaryJurisdiction?.label ?? "Mi jurisdicción"}
              >
                🎯 Mi jurisdicción
              </button>
              {adminSelectedLocation && (
                <button
                  type="button"
                  onClick={() => {
                    // Ciclo: vista normal -> calles -> detalle cercano -> vista normal.
                    const currentLevel = adminSelectedLocation.detailLevel ?? (adminSelectedLocation.detailZoom ? 1 : 0);
                    const nextLevel = ((currentLevel + 1) % 3) as 0 | 1 | 2;
                    setAdminSelectedLocation({
                      ...adminSelectedLocation,
                      detailZoom: nextLevel > 0,
                      detailLevel: nextLevel,
                    });
                    setAdminLocationKey((value) => value + 1);
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
                  onClick={onOpenHistory}
                  className="rounded-xl border border-violet-500/50 bg-violet-950/30 px-3 py-2 text-[11px] font-black text-violet-200 hover:bg-violet-900/50"
                  title="Abrir historial, estadísticas y zonas calientes"
                >
                  📋 Historial
                </button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={provinciaId}
                onChange={(event) => {
                  setProvinciaId(event.target.value);
                  setDistrict("");
                  setLocalidadId("");
                  setSelectedDistrictBoundary(null);
                  setAdminSelectedLocation(null);
                }}
                                className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
              >
                <option value="">"Seleccionar provincia"</option>
                {provincias.map((provincia) => (
                  <option key={provincia.id} value={provincia.id}>{provincia.nombre}</option>
                ))}
              </select>

              <select
                value={district}
                onChange={(event) => seleccionarPartido(event.target.value)}
                disabled={!provinciaId}
                className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
              >
                <option value="">{provincias.find((item) => item.id === provinciaId)?.nombre === "Buenos Aires" ? "Seleccionar partido" : "Seleccionar departamento / municipio"}</option>
                {districts.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>

              <select
                value={localidadId}
                onChange={(event) => seleccionarLocalidad(event.target.value)}
                disabled={!district}
                className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
              >
                <option value="">Seleccionar localidad (opcional)</option>
                {localidades.map((localidad) => (
                  <option key={localidad.id} value={localidad.id}>{localidad.nombre}</option>
                ))}
              </select>
            </div>

            {adminSelectedLocation && (
              <p className="mt-2 text-[11px] font-semibold text-emerald-400">✓ Mostrando {adminSelectedLocation.label}</p>
            )}
          </div>
        )}

        {/* FILTROS */}

        {!kioskMode && (
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">

          {FILTROS.map(
            (item) => (
              <button
                key={item.value}
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
                {item.label}
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

            {mode === "admin" && (
              <button
                type="button"
                onClick={() =>
                  setResetKey(
                    (value) =>
                      value + 1
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
          className={`${heightClassName} w-full overflow-hidden ${kioskMode ? "rounded-none" : "rounded-2xl"} bg-slate-950`}
        >

          <MapContainer
            center={
              OTAMENDI_CENTER
            }
            zoom={
              mode === "public"
                ? 14
                : 14
            }
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
                selectedLocation={adminSelectedLocation}
                locationKey={adminLocationKey}
                focusTarget={focusTarget}
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

            {mode === "public" &&
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
                      weight: 1.5,
                      opacity: 0.35,
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
                        📍 Tu
                        ubicación
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
                        Posición
                        aproximada
                        obtenida por
                        GPS.
                      </div>
                    </Popup>
                  </Marker>
                </>
              )}

            {visibleJurisdictionBoundaries.map((boundary) => (
              <GeoJSON
                key={boundary.key}
                data={boundary.data}
                style={{
                  color: "#ef4444",
                  weight: 2.5,
                  opacity: 0.72,
                  fillColor: "#ef4444",
                  fillOpacity: 0.03,
                  dashArray: "8 8",
                }}
              >
                <Popup>
                  <strong>Jurisdicción: {boundary.label}</strong>
                  <div style={{ marginTop: 5, fontSize: 12, color: "#64748b" }}>
                    Límite territorial de referencia.
                  </div>
                </Popup>
              </GeoJSON>
            ))}

            {hotZoneMode && hotZones.map((zone) => {
              const radius = Math.min(850, 220 + zone.count * 70);
              const fillOpacity = Math.min(0.42, 0.10 + zone.count * 0.035);
              return (
                <Circle
                  key={`hot-${zone.key}`}
                  center={[zone.latitude, zone.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: zone.count >= 8 ? "#ef4444" : zone.count >= 5 ? "#f97316" : "#eab308",
                    weight: 2,
                    opacity: 0.8,
                    fillColor: zone.count >= 8 ? "#ef4444" : zone.count >= 5 ? "#f97316" : "#eab308",
                    fillOpacity,
                  }}
                >
                  <Popup>
                    <strong>🔥 Zona caliente aproximada</strong>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {zone.count} reportes concentrados en este sector.
                    </div>
                  </Popup>
                </Circle>
              );
            })}

            {/* ALERTAS PREVENTIVAS AGRUPADAS: marcador + perímetro dinámico */}
            {preventiveAlerts.map((alert) => {
              if (alert.centerLatitude === null || alert.centerLongitude === null) return null;
              const isVehicle = alert.category === "Vehículo sospechoso";
              const color = isVehicle ? "#f59e0b" : "#fb923c";
              const icon = L.divIcon({
                className: "",
                html: `<div style="position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center">
                  <div style="position:absolute;width:42px;height:42px;border-radius:50%;background:${color};opacity:.42;animation:alertaPulse 1.25s infinite"></div>
                  <div style="position:relative;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};border:3px solid white;box-shadow:0 0 0 5px ${color}33,0 4px 18px rgba(0,0,0,.5);font-size:21px;z-index:2">⚠️</div>
                </div>`,
                iconSize: [54,54], iconAnchor: [27,27], popupAnchor: [0,-29]
              });
              return (
                <div key={`preventive-${alert.id}`}>
                  <Circle center={[alert.centerLatitude, alert.centerLongitude]} radius={Math.max(150, alert.radiusKm * 1000)} pathOptions={{ color, weight: 3, opacity: 0.8, fillColor: color, fillOpacity: 0.12, dashArray: "8 6" }} />
                  <Marker position={[alert.centerLatitude, alert.centerLongitude]} icon={icon}>
                    <Popup minWidth={270}>
                      <div style={{ color: "#0f172a" }}>
                        <strong>⚠️ ALERTA PREVENTIVA ACTIVA</strong>
                        <div style={{ marginTop: 8, fontSize: 13 }}><b>Tipo:</b> {alert.category}</div>
                        <div style={{ marginTop: 4, fontSize: 13 }}><b>Reportes coincidentes:</b> {alert.reportCount}</div>
                        <div style={{ marginTop: 4, fontSize: 13 }}><b>Radio aproximado:</b> {Math.round(alert.radiusKm * 1000)} m</div>
                        <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                          {mode === "admin"
                            ? alert.summary || "Varios reportes coincidentes generaron esta alerta preventiva."
                            : "Se recibieron varios reportes coincidentes sobre una situación sospechosa en el sector. Mantenga precaución y utilice los servicios oficiales ante una emergencia."}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </div>
              );
            })}

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
                    emoji: "📍",
                    label:
                      "Alerta",
                  };

                return (
                  <Marker
                    key={
                      report.id
                    }
                    position={[
                      report.latitude!,
                      report.longitude!,
                    ]}
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

                              width: 32,
                              height: 32,

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
                              {displayCategory(report.category)}
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

                        {/* ADMIN */}

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
                                {report
                                  .description
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
                                : `📍 ${report.latitude?.toFixed(5)}, ${report.longitude?.toFixed(5)}`}
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
                                Ver detalle
                                completo
                              </button>
                            )}

                          </>
                        ) : (
                          /* PÚBLICO */
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
                            📍 Ubicación
                            aproximada por
                            seguridad.
                            <br />
                            Los datos
                            completos son
                            visibles únicamente
                            para el Centro de
                            Monitoreo.
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

        {mode === "public" && (
          <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px] leading-4 text-slate-500">

            <span>
              🔒 Ubicaciones
              públicas aproximadas
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
