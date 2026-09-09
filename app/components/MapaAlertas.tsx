"use client";

import {
  useEffect,
  useMemo,
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

import "leaflet/dist/leaflet.css";

import L, {
  LatLngBoundsExpression,
} from "leaflet";

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

const OTAMENDI_CENTER: [number, number] = [
  -38.112,
  -57.84,
];

const PUBLIC_INITIAL_ZOOM = 11;

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

function isCritical(category: string) {
  return (
    category === "Emergencia" ||
    category === "Delito / Robo"
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
    ? `0 0 0 5px ${item.color}33, 0 6px 18px rgba(0,0,0,.5)`
    : "0 6px 18px rgba(0,0,0,.45)";

  return L.divIcon({
    className: "alerta-marker-wrapper",

    html: `
      <div style="
        position:relative;
        width:48px;
        height:52px;
        display:flex;
        align-items:center;
        justify-content:center;
      ">

        ${
          isNew
            ? `
            <div style="
              position:absolute;
              top:5px;
              width:40px;
              height:40px;
              border-radius:999px;
              background:${item.color};
              opacity:.35;
              animation:alertaPulse 1.35s infinite;
            "></div>
          `
            : ""
        }

        <div style="
          position:relative;
          width:38px;
          height:38px;
          border-radius:14px 14px 14px 3px;
          transform:rotate(-45deg);
          background:${item.color};
          border:3px solid #fff;
          box-shadow:${glow};
          display:flex;
          align-items:center;
          justify-content:center;
          z-index:2;
        ">
          <span style="
            transform:rotate(45deg);
            font-size:17px;
            line-height:1;
          ">
            ${item.emoji}
          </span>
        </div>

      </div>
    `,

    iconSize: [48, 52],
    iconAnchor: [24, 45],
    popupAnchor: [0, -42],
  });
}

function getUserIcon() {
  return L.divIcon({
    className: "",

    html: `
      <div style="
        position:relative;
        width:30px;
        height:30px;
      ">
        <div style="
          position:absolute;
          inset:0;
          border-radius:999px;
          background:#3b82f6;
          opacity:.25;
        "></div>

        <div style="
          position:absolute;
          left:7px;
          top:7px;
          width:16px;
          height:16px;
          border-radius:999px;
          background:#2563eb;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,.45);
        "></div>
      </div>
    `,

    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function statusLabel(status: string) {
  switch (status) {
    case "pendiente":
      return "Pendiente";

    case "en_analisis":
      return "En análisis";

    case "verificada":
      return "Verificada";

    case "resuelta":
      return "Resuelta";

    case "descartada":
      return "Descartada";

    default:
      return status;
  }
}

function relativeTime(date: string) {
  const diff = Math.max(
    0,
    Date.now() - new Date(date).getTime()
  );

  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return "Ahora";
  }

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);

  return `Hace ${days} d`;
}

/*
 * El mapa del administrador conserva su comportamiento:
 * encuadra las alertas visibles.
 */
function AdminViewport({
  reports,
  resetKey,
}: {
  reports: Report[];
  resetKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    const valid = reports.filter(
      (report) =>
        report.latitude !== null &&
        report.longitude !== null
    );

    window.setTimeout(() => {
      if (valid.length === 0) {
        map.setView(
          OTAMENDI_CENTER,
          14,
          {
            animate: true,
          }
        );

        return;
      }

      if (valid.length === 1) {
        map.setView(
          [
            valid[0].latitude!,
            valid[0].longitude!,
          ],
          16,
          {
            animate: true,
          }
        );

        return;
      }

      const bounds = valid.map(
        (report) =>
          [
            report.latitude!,
            report.longitude!,
          ] as [number, number]
      ) as LatLngBoundsExpression;

      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 16,
        animate: true,
      });
    }, 0);
  }, [map, reports, resetKey]);

  return null;
}

/*
 * El mapa público NO se centra en todos los marcadores.
 * Arranca en la posición del vecino.
 */
function PublicViewport({
  userPosition,
  locationKey,
}: {
  userPosition: UserPosition | null;
  locationKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!userPosition) {
      return;
    }

    map.setView(
      [
        userPosition.latitude,
        userPosition.longitude,
      ],
      PUBLIC_INITIAL_ZOOM,
      {
        animate: true,
      }
    );
  }, [
    map,
    userPosition,
    locationKey,
  ]);

  return null;
}

export default function MapaAlertas({
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
  ] = useState<UserPosition | null>(
    null
  );

  const [
    locating,
    setLocating,
  ] = useState(
    mode === "public"
  );

  const [
    locationMessage,
    setLocationMessage,
  ] = useState("");

  const filteredReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.latitude !== null &&
          report.longitude !== null &&
          (filtro === "Todos" ||
            report.category === filtro)
      ),

    [reports, filtro]
  );

  function requestUserLocation(
    recenter = true
  ) {
    if (
      mode !== "public" ||
      !navigator.geolocation
    ) {
      if (mode === "public") {
        setLocationMessage(
          "Tu dispositivo no permite obtener la ubicación."
        );
      }

      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude,
        };

        setUserPosition(nextPosition);

        setLocationMessage(
          "Ubicación obtenida"
        );

        setLocating(false);

        if (recenter) {
          setLocationKey(
            (value) => value + 1
          );
        }
      },

      () => {
        setLocating(false);

        setLocationMessage(
          "No pudimos obtener tu ubicación. Podés habilitarla desde los permisos del teléfono."
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  useEffect(() => {
    if (mode === "public") {
      requestUserLocation(true);
    }
    // Se ejecuta únicamente al montar el mapa público.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-3 shadow-2xl shadow-black/10">

      {mode === "public" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">

          <div>
            <p className="text-xs font-bold text-white">
              📍 Tu zona
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {locating
                ? "Buscando tu ubicación…"
                : locationMessage ||
                  "Vista aproximada de 15 km alrededor tuyo"}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              requestUserLocation(true)
            }
            disabled={locating}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {locating
              ? "Ubicando…"
              : "📍 Mi ubicación"}
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">

        {FILTROS.map((item) => (
          <button
            key={item.value}
            onClick={() =>
              setFiltro(item.value)
            }
            className={`shrink-0 rounded-full border px-3 py-2 font-semibold transition ${
              filtro === item.value
                ? "border-white/30 bg-white text-slate-950"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">

          <span className="rounded-full bg-slate-950 px-3 py-2 text-slate-400">
            {filteredReports.length} visibles
          </span>

          {mode === "admin" && (
            <button
              onClick={() =>
                setResetKey(
                  (value) => value + 1
                )
              }
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-800"
              title="Centrar el mapa en las alertas visibles"
            >
              ◎ Centrar
            </button>
          )}

        </div>
      </div>

      <div
        className={`${heightClassName} w-full overflow-hidden rounded-2xl bg-slate-950`}
      >
        <MapContainer
          center={OTAMENDI_CENTER}
          zoom={
            mode === "public"
              ? PUBLIC_INITIAL_ZOOM
              : 14
          }
          style={{
            height: "100%",
            width: "100%",
          }}
          zoomControl
        >

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mode === "admin" ? (
            <AdminViewport
              reports={filteredReports}
              resetKey={resetKey}
            />
          ) : (
            <PublicViewport
              userPosition={userPosition}
              locationKey={locationKey}
            />
          )}

          {mode === "public" &&
            userPosition && (
              <>
                <Circle
                  center={[
                    userPosition.latitude,
                    userPosition.longitude,
                  ]}
                  radius={15000}
                  pathOptions={{
                    color: "#3b82f6",
                    weight: 1,
                    opacity: 0.25,
                    fillOpacity: 0.025,
                  }}
                />

                <Marker
                  position={[
                    userPosition.latitude,
                    userPosition.longitude,
                  ]}
                  icon={getUserIcon()}
                >
                  <Popup>
                    <strong>
                      📍 Tu ubicación
                    </strong>
                  </Popup>
                </Marker>
              </>
            )}

          {filteredReports.map(
            (report) => {
              const age =
                Date.now() -
                new Date(
                  report.createdAt
                ).getTime();

              const isNew =
                age >= 0 &&
                age <=
                  10 * 60 * 1000;

              const config =
                MARKER_CONFIG[
                  report.category
                ] || {
                  color: "#64748b",
                  emoji: "📍",
                  label: "Alerta",
                };

              return (
                <Marker
                  key={report.id}
                  position={[
                    report.latitude!,
                    report.longitude!,
                  ]}
                  icon={getMarkerIcon(
                    report.category,
                    isNew
                  )}
                >
                  <Popup minWidth={235}>
                    <div
                      style={{
                        color: "#0f172a",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            display:
                              "inline-flex",
                            width: 28,
                            height: 28,
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            borderRadius: 8,
                            background:
                              config.color,
                            color: "white",
                          }}
                        >
                          {config.emoji}
                        </span>

                        <div>
                          <strong>
                            {
                              report.category
                            }
                          </strong>

                          <div
                            style={{
                              fontSize: 12,
                              color:
                                "#64748b",
                            }}
                          >
                            {relativeTime(
                              report.createdAt
                            )}{" "}
                            ·{" "}
                            {statusLabel(
                              report.status
                            )}
                          </div>
                        </div>
                      </div>

                      {mode === "admin" ? (
                        <>
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 13,
                            }}
                          >
                            <strong>
                              Reporte #
                              {report.id}
                            </strong>
                          </div>

                          {report.description && (
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 13,
                              }}
                            >
                              {report
                                .description
                                .length > 120
                                ? `${report.description.slice(
                                    0,
                                    120
                                  )}…`
                                : report.description}
                            </div>
                          )}

                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
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
                                marginTop: 10,
                                width: "100%",
                                border: 0,
                                borderRadius: 10,
                                padding:
                                  "9px 10px",
                                background:
                                  "#0f172a",
                                color:
                                  "white",
                                fontWeight: 700,
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
                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 13,
                            color:
                              "#475569",
                          }}
                        >
                          📍 Ubicación
                          aproximada por
                          seguridad.
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
    </div>
  );
}
