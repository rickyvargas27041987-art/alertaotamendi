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

import "leaflet/dist/leaflet.css";

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

type Props = {
  reports: Report[];
  mode?: "admin" | "public";
  onSelectReport?: (report: Report) => void;
  heightClassName?: string;
};

type UserPosition = {
  latitude: number;
  longitude: number;
};

type ProvinciaGeoref = {
  id: string;
  nombre: string;
};

type LocalidadGeoref = {
  id: string;
  nombre: string;
  centroide: {
    lat: number;
    lon: number;
  };
};

/* =========================================================
   CONFIGURACIÓN GENERAL
========================================================= */

const OTAMENDI_CENTER: [number, number] = [
  -38.112,
  -57.84,
];

/*
 * Vista pública:
 * - Predeterminada: 2 km alrededor de Otamendi.
 * - Al tocar "Mi ubicación": 200 m alrededor del usuario.
 *
 * Esto afecta solamente la cámara del mapa.
 * NO modifica el radio de notificaciones push.
 */
const PUBLIC_DEFAULT_RADIUS_METERS = 2_000;
const PUBLIC_USER_RADIUS_METERS = 200;

/*
 * Círculo visual alrededor de la ubicación del usuario.
 */
const PUBLIC_MAP_RADIUS_METERS = 200;

/*
 * Las alertas nuevas tienen animación durante 10 minutos.
 */
const NEW_REPORT_MINUTES = 10;

const GEOREF_BASE_URL =
  "https://apis.datos.gob.ar/georef/api/v2.0";

const DEFAULT_PROVINCIA_NAME = "Buenos Aires";
const DEFAULT_LOCALIDAD_NAME = "Comandante Nicanor Otamendi";

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
    label: "Delito / Robo",
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

const FILTROS = [
  {
    label: "Todos",
    value: "Todos",
  },

  {
    label: "🚨 Robo",
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
  isNew: boolean
) {
  const item =
    MARKER_CONFIG[category] || {
      color: "#64748b",
      emoji: "📍",
      label: "Alerta",
    };

  const glow = isCritical(category)
    ? `0 0 0 5px ${item.color}33,
       0 0 22px ${item.color}66,
       0 7px 20px rgba(0,0,0,.55)`
    : "0 7px 20px rgba(0,0,0,.50)";

  return L.divIcon({
    className: "alerta-marker-wrapper",

    html: `
      <div
        style="
          position:relative;
          width:52px;
          height:56px;
          display:flex;
          align-items:center;
          justify-content:center;
        "
      >

        ${
          isNew
            ? `
          <div
            style="
              position:absolute;
              top:5px;
              left:6px;
              width:40px;
              height:40px;
              border-radius:999px;
              background:${item.color};
              opacity:.40;
              animation:alertaPulse 1.35s infinite;
            "
          ></div>
        `
            : ""
        }

        <div
          style="
            position:relative;
            width:40px;
            height:40px;
            border-radius:14px 14px 14px 3px;
            transform:rotate(-45deg);
            background:${item.color};
            border:3px solid white;
            box-shadow:${glow};
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:2;
          "
        >
          <span
            style="
              transform:rotate(45deg);
              font-size:18px;
              line-height:1;
            "
          >
            ${item.emoji}
          </span>
        </div>

      </div>
    `,

    iconSize: [52, 56],
    iconAnchor: [26, 48],
    popupAnchor: [0, -45],
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
}: {
  reports: Report[];
  resetKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    const validReports = reports.filter(
      (report) =>
        report.latitude !== null &&
        report.longitude !== null
    );

    const timer = window.setTimeout(() => {
      map.invalidateSize();

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
    reports,
    resetKey,
  ]);

  return null;
}

/* =========================================================
   VIEWPORT PÚBLICO
========================================================= */

function PublicViewport({
  userPosition,
  locationKey,
}: {
  userPosition: UserPosition | null;
  locationKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      /*
       * Si todavía no se pidió la ubicación:
       * mostramos una vista de aproximadamente
       * 2 km a la redonda de Otamendi.
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
       * Cuando el vecino toca "Mi ubicación":
       * mostramos aproximadamente 200 m
       * a la redonda de su posición.
       */
      const userBounds = L.latLng(
        userPosition.latitude,
        userPosition.longitude
      ).toBounds(PUBLIC_USER_RADIUS_METERS * 2);

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
  ]);

  return null;
}

/* =========================================================
   VIEWPORT POR LOCALIDAD SELECCIONADA
========================================================= */

function LocalidadViewport({
  localidad,
  selectionKey,
}: {
  localidad: LocalidadGeoref | null;
  selectionKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!localidad) return;

    const lat = Number(localidad.centroide?.lat);
    const lon = Number(localidad.centroide?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize();
      map.flyTo([lat, lon], 14, {
        animate: true,
        duration: 0.8,
      });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [map, localidad, selectionKey]);

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
}: Props) {
  const [filtro, setFiltro] =
    useState("Todos");

  const [resetKey, setResetKey] =
    useState(0);

  const [locationKey, setLocationKey] =
    useState(0);

  const [
    userPosition,
    setUserPosition,
  ] =
    useState<UserPosition | null>(
      null
    );

  const [locating, setLocating] =
    useState(false);

  const [provincias, setProvincias] =
    useState<ProvinciaGeoref[]>([]);

  const [localidades, setLocalidades] =
    useState<LocalidadGeoref[]>([]);

  const [provinciaId, setProvinciaId] =
    useState("");

  const [localidadId, setLocalidadId] =
    useState("");

  const [localidadSeleccionada, setLocalidadSeleccionada] =
    useState<LocalidadGeoref | null>(null);

  const [localidadKey, setLocalidadKey] =
    useState(0);

  const [cargandoProvincias, setCargandoProvincias] =
    useState(true);

  const [cargandoLocalidades, setCargandoLocalidades] =
    useState(false);

  const [georefError, setGeorefError] =
    useState("");

  const [
    locationMessage,
    setLocationMessage,
  ] = useState("");

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
     PROVINCIAS Y LOCALIDADES DE ARGENTINA
  ======================================================= */

  useEffect(() => {
    let activo = true;

    async function cargarProvincias() {
      setCargandoProvincias(true);
      setGeorefError("");

      try {
        const response = await fetch(
          `${GEOREF_BASE_URL}/provincias?max=100&orden=nombre`,
          { cache: "force-cache" }
        );

        if (!response.ok) {
          throw new Error("No se pudieron cargar las provincias.");
        }

        const data = await response.json();
        const lista: ProvinciaGeoref[] =
          Array.isArray(data.provincias) ? data.provincias : [];

        lista.sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        );

        if (!activo) return;

        setProvincias(lista);

        const guardada =
          window.localStorage.getItem(
            "alerta_otamendi_provincia"
          );

        const inicial =
          lista.find((item) => item.id === guardada) ||
          lista.find(
            (item) =>
              item.nombre.toLowerCase() ===
              DEFAULT_PROVINCIA_NAME.toLowerCase()
          );

        if (inicial) {
          setProvinciaId(inicial.id);
        }
      } catch (error) {
        console.error("Error cargando provincias:", error);
        if (activo) {
          setGeorefError(
            "No pudimos cargar las provincias. Podés seguir usando el mapa normalmente."
          );
        }
      } finally {
        if (activo) setCargandoProvincias(false);
      }
    }

    void cargarProvincias();

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!provinciaId) {
      setLocalidades([]);
      setLocalidadId("");
      setLocalidadSeleccionada(null);
      return;
    }

    let activo = true;

    async function cargarLocalidades() {
      setCargandoLocalidades(true);
      setGeorefError("");
      setLocalidades([]);
      setLocalidadId("");
      setLocalidadSeleccionada(null);

      try {
        /*
         * La descarga JSON del recurso devuelve el conjunto
         * completo y luego filtramos por provincia en el cliente.
         * Evita quedarnos cortos con el límite de resultados.
         */
        const response = await fetch(
          `${GEOREF_BASE_URL}/localidades.json`,
          { cache: "force-cache" }
        );

        if (!response.ok) {
          throw new Error("No se pudieron cargar las localidades.");
        }

        const data = await response.json();
        const todas = Array.isArray(data.localidades)
          ? data.localidades
          : [];

        const lista: LocalidadGeoref[] = todas
          .filter(
            (item: {
              provincia?: { id?: string };
              centroide?: { lat?: number; lon?: number };
            }) =>
              item.provincia?.id === provinciaId &&
              Number.isFinite(Number(item.centroide?.lat)) &&
              Number.isFinite(Number(item.centroide?.lon))
          )
          .map(
            (item: {
              id: string;
              nombre: string;
              centroide: { lat: number; lon: number };
            }) => ({
              id: item.id,
              nombre: item.nombre,
              centroide: {
                lat: Number(item.centroide.lat),
                lon: Number(item.centroide.lon),
              },
            })
          );

        lista.sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        );

        if (!activo) return;

        setLocalidades(lista);
        window.localStorage.setItem(
          "alerta_otamendi_provincia",
          provinciaId
        );

        const localidadGuardada =
          window.localStorage.getItem(
            `alerta_otamendi_localidad_${provinciaId}`
          );

        const inicial =
          lista.find((item) => item.id === localidadGuardada) ||
          lista.find(
            (item) =>
              item.nombre.toLowerCase() ===
              DEFAULT_LOCALIDAD_NAME.toLowerCase()
          );

        if (inicial) {
          setLocalidadId(inicial.id);
          setLocalidadSeleccionada(inicial);
          setLocalidadKey((value) => value + 1);
        }
      } catch (error) {
        console.error("Error cargando localidades:", error);
        if (activo) {
          setGeorefError(
            "No pudimos cargar las localidades. Podés seguir usando el mapa normalmente."
          );
        }
      } finally {
        if (activo) setCargandoLocalidades(false);
      }
    }

    void cargarLocalidades();

    return () => {
      activo = false;
    };
  }, [provinciaId]);

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

  /* =======================================================
     SOLICITAR UBICACIÓN
  ======================================================= */

  const requestUserLocation =
    useCallback(
      (
        recenter = true
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

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-3 shadow-2xl shadow-black/10">

        {/* NAVEGACIÓN POR PROVINCIA Y LOCALIDAD */}

        <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-2">
            <p className="text-xs font-black text-white">
              🇦🇷 Ir a una localidad
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Elegí una provincia y después una localidad para centrar el mapa.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Provincia
              </span>

              <select
                value={provinciaId}
                onChange={(event) => {
                  setProvinciaId(event.target.value);
                  setLocalidadId("");
                  setLocalidadSeleccionada(null);
                }}
                disabled={cargandoProvincias}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">
                  {cargandoProvincias
                    ? "Cargando provincias…"
                    : "Seleccionar provincia"}
                </option>

                {provincias.map((provincia) => (
                  <option
                    key={provincia.id}
                    value={provincia.id}
                  >
                    {provincia.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Localidad
              </span>

              <select
                value={localidadId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setLocalidadId(nextId);

                  const localidad =
                    localidades.find(
                      (item) => item.id === nextId
                    ) || null;

                  setLocalidadSeleccionada(localidad);

                  if (localidad) {
                    window.localStorage.setItem(
                      `alerta_otamendi_localidad_${provinciaId}`,
                      localidad.id
                    );
                    setLocalidadKey((value) => value + 1);
                  }
                }}
                disabled={
                  !provinciaId ||
                  cargandoLocalidades ||
                  localidades.length === 0
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">
                  {cargandoLocalidades
                    ? "Cargando localidades…"
                    : "Seleccionar localidad"}
                </option>

                {localidades.map((localidad) => (
                  <option
                    key={localidad.id}
                    value={localidad.id}
                  >
                    {localidad.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {georefError && (
            <p className="mt-2 text-[10px] leading-4 text-amber-300">
              ⚠️ {georefError}
            </p>
          )}
        </div>

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
                    "Vista general de aproximadamente 2 km. Tocá «Mi ubicación» para ver 200 m a tu alrededor."}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                requestUserLocation(
                  true
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

        {/* FILTROS */}

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

        {/* MAPA */}

        <div
          className={`${heightClassName} w-full overflow-hidden rounded-2xl bg-slate-950`}
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

            {/* LOCALIDAD SELECCIONADA */}

            {localidadSeleccionada && (
              <LocalidadViewport
                localidad={localidadSeleccionada}
                selectionKey={localidadKey}
              />
            )}

            {/* CONTROL DE CÁMARA */}

            {mode === "admin" ? (
              <AdminViewport
                reports={
                  filteredReports
                }
                resetKey={
                  resetKey
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
                      isNew
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
                              {
                                report.category
                              }
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
                              📍{" "}
                              {report.latitude?.toFixed(
                                5
                              )}
                              ,{" "}
                              {report.longitude?.toFixed(
                                5
                              )}
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