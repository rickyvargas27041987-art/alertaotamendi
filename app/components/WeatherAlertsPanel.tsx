"use client";

import { useEffect, useMemo, useState } from "react";

const WEATHER_PROJECTION_KEY =
  "alerta_otamendi_weather_projection_v1";

type WeatherAlert = {
  id: number;
  event: string;
  severity: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  onsetAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  areaDescription: string | null;
};

type WeatherResponse = {
  success: boolean;

  alerts?: WeatherAlert[];

  source?: {
    lastSuccessAt: string | null;
    consecutiveFailures: number;
  } | null;
};

/* =========================================================
   LIMPIEZA DE TEXTO DEL SMN

   Algunos mensajes llegan con entidades HTML, por ejemplo:
   &#xE1;  -> á
   &#xE9;  -> é

   También puede ocurrir doble codificación:
   &amp;#xE1; -> &#xE1; -> á
========================================================= */

function decodeWeatherText(value: string | null) {
  if (!value) return value;

  let result = value;

  for (let i = 0; i < 3; i++) {
    const previous = result;

    result = result
      .replace(
        /&#x([0-9a-f]+);?/gi,
        (_, code) => {
          const number = parseInt(code, 16);

          return Number.isFinite(number)
            ? String.fromCodePoint(number)
            : _;
        }
      )
      .replace(
        /&#([0-9]+);?/g,
        (_, code) => {
          const number = parseInt(code, 10);

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
      .replace(/&Aacute;/g, "Á")
      .replace(/&Eacute;/g, "É")
      .replace(/&Iacute;/g, "Í")
      .replace(/&Oacute;/g, "Ó")
      .replace(/&Uacute;/g, "Ú")
      .replace(/&ntilde;/gi, "ñ")
      .replace(/&Ntilde;/g, "Ñ")
      .replace(/&uuml;/gi, "ü")
      .replace(/&Uuml;/g, "Ü")
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

function severityInfo(value: string | null) {
  const severity =
    value?.toLowerCase() || "";

  if (severity === "extreme") {
    return {
      label: "EXTREMA",
      icon: "🚨",
      badge:
        "border-red-400/50 bg-red-500/20 text-red-200",
      card:
        "border-red-500/35 bg-red-950/20",
    };
  }

  if (severity === "severe") {
    return {
      label: "SEVERA",
      icon: "⚠️",
      badge:
        "border-orange-400/50 bg-orange-500/20 text-orange-200",
      card:
        "border-orange-500/30 bg-orange-950/15",
    };
  }

  if (severity === "moderate") {
    return {
      label: "MODERADA",
      icon: "🟡",
      badge:
        "border-yellow-400/50 bg-yellow-500/15 text-yellow-200",
      card:
        "border-yellow-500/25 bg-yellow-950/10",
    };
  }

  return {
    label:
      value?.toUpperCase() ||
      "SIN CLASIFICAR",

    icon: "🌦️",

    badge:
      "border-slate-600 bg-slate-800 text-slate-300",

    card:
      "border-slate-800 bg-slate-950",
  };
}

function formatDate(value: string | null) {
  if (!value) return "Sin dato";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
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

function relativeTime(value: string | null) {
  if (!value) {
    return "sin sincronización";
  }

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "sin sincronización";
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) /
        60000
    )
  );

  if (minutes < 1) {
    return "hace menos de 1 min";
  }

  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours =
    Math.floor(minutes / 60);

  return `hace ${hours} h`;
}

export default function WeatherAlertsPanel() {
  const [data, setData] =
    useState<WeatherResponse | null>(
      null
    );

  const [open, setOpen] =
    useState(false);

  const [
    projectedId,
    setProjectedId,
  ] =
    useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response =
          await fetch(
            "/api/weather/active",
            {
              cache: "no-store",
            }
          );

        const json =
          (await response.json()) as WeatherResponse;

        if (
          !cancelled &&
          response.ok &&
          json.success
        ) {
          setData({
            ...json,

            alerts:
              json.alerts?.map(
                (alert) => ({
                  ...alert,

                  event:
                    decodeWeatherText(
                      alert.event
                    ) ||
                    alert.event,

                  headline:
                    decodeWeatherText(
                      alert.headline
                    ),

                  description:
                    decodeWeatherText(
                      alert.description
                    ),

                  instruction:
                    decodeWeatherText(
                      alert.instruction
                    ),

                  areaDescription:
                    decodeWeatherText(
                      alert.areaDescription
                    ),
                })
              ),
          });
        }
      } catch (error) {
        console.error(
          "Error cargando alertas meteorológicas:",
          error
        );
      }
    };

    void load();

    const interval =
      window.setInterval(
        () => void load(),
        60_000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        interval
      );
    };
  }, []);

  const alerts =
    data?.alerts ?? [];

  const sourceHealthy =
    useMemo(() => {
      const source =
        data?.source;

      if (
        !source?.lastSuccessAt ||
        source.consecutiveFailures > 0
      ) {
        return false;
      }

      const last =
        new Date(
          source.lastSuccessAt
        ).getTime();

      return (
        Number.isFinite(last) &&
        Date.now() - last <=
          25 * 60 * 1000
      );
    }, [data]);

  function projectAlert(
    alert: WeatherAlert
  ) {
    const command = {
      action: "SHOW",
      timestamp: Date.now(),

      alert: {
        id: alert.id,
        event: alert.event,
        severity: alert.severity,
        headline: alert.headline,
        description: alert.description,
        instruction: alert.instruction,

        areaDescription:
          alert.areaDescription,

        onsetAt:
          alert.onsetAt ||
          alert.effectiveAt,

        expiresAt:
          alert.expiresAt,
      },
    };

    window.localStorage.setItem(
      WEATHER_PROJECTION_KEY,
      JSON.stringify(command)
    );

    setProjectedId(alert.id);
  }

  function hideProjection() {
    window.localStorage.setItem(
      WEATHER_PROJECTION_KEY,
      JSON.stringify({
        action: "HIDE",
        timestamp: Date.now(),
      })
    );

    setProjectedId(null);
  }

  return (
    <>
      {/* BOTÓN DEL CENTRO DE MONITOREO */}

      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
          alerts.length > 0
            ? "border-sky-400/40 bg-sky-950/40 text-sky-100 hover:bg-sky-900/50"
            : "border-emerald-500/30 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-900/30"
        }`}
        title="Alertas meteorológicas oficiales del SMN"
      >
        🌦️ SMN ·{" "}
        {alerts.length > 0
          ? alerts.length
          : "Sin alertas"}
      </button>

      {/* MENÚ FLOTANTE */}

      {open && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-sm">

          <div className="flex max-h-[calc(100vh-100px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-sky-500/30 bg-slate-950 shadow-2xl">

            {/* ENCABEZADO */}

            <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                  🌦️ Meteorología oficial
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  Alertas del Servicio Meteorológico Nacional
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-black text-slate-300 hover:bg-slate-800"
              >
                ✕
              </button>

            </div>

            {/* ESTADO */}

            <div className="grid grid-cols-2 gap-3 border-b border-slate-800 p-4">

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">

                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Alertas vigentes
                </p>

                <p className="mt-1 text-3xl font-black text-white">
                  {alerts.length}
                </p>

              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">

                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Estado de la fuente
                </p>

                <p
                  className={`mt-1 text-sm font-black ${
                    sourceHealthy
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {sourceHealthy
                    ? "● SMN conectado"
                    : "● Revisar fuente"}
                </p>

                <p className="mt-1 text-[10px] text-slate-500">
                  Última consulta{" "}
                  {relativeTime(
                    data?.source
                      ?.lastSuccessAt ??
                      null
                  )}
                </p>

              </div>

            </div>

            {/* LISTA */}

            <div className="flex-1 overflow-y-auto p-4">

              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6 text-center text-emerald-300">
                  ✓ No hay alertas meteorológicas oficiales vigentes.
                </div>
              ) : (
                <div className="space-y-3">

                  {alerts.map(
                    (alert) => {
                      const severity =
                        severityInfo(
                          alert.severity
                        );

                      const isProjected =
                        projectedId ===
                        alert.id;

                      return (
                        <div
                          key={alert.id}
                          className={`rounded-2xl border p-4 ${severity.card}`}
                        >

                          <div className="flex items-start justify-between gap-3">

                            <div className="min-w-0">

                              <p className="text-base font-black text-white">
                                {
                                  severity.icon
                                }{" "}
                                {
                                  alert.event
                                }
                              </p>

                              {alert.headline && (
                                <p className="mt-2 text-sm leading-5 text-slate-300">
                                  {
                                    alert.headline
                                  }
                                </p>
                              )}

                            </div>

                            <span
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${severity.badge}`}
                            >
                              {
                                severity.label
                              }
                            </span>

                          </div>

                          {alert.areaDescription && (
                            <div className="mt-3 rounded-xl border border-white/5 bg-black/15 p-3 text-xs leading-5 text-slate-300">
                              📍{" "}
                              {
                                alert.areaDescription
                              }
                            </div>
                          )}

                          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">

                            <div>
                              <p className="text-[10px] uppercase text-slate-500">
                                Inicio
                              </p>

                              <p className="mt-1 font-semibold text-slate-300">
                                {formatDate(
                                  alert.onsetAt ||
                                    alert.effectiveAt
                                )}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-[10px] uppercase text-slate-500">
                                Vence
                              </p>

                              <p className="mt-1 font-semibold text-slate-300">
                                {formatDate(
                                  alert.expiresAt
                                )}
                              </p>
                            </div>

                          </div>

                          {alert.instruction && (
                            <div className="mt-3 rounded-xl border border-white/5 bg-black/20 p-3 text-xs leading-5 text-slate-300">

                              <span className="font-black text-white">
                                Recomendación oficial:
                              </span>{" "}

                              {
                                alert.instruction
                              }

                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                projectAlert(
                                  alert
                                )
                              }
                              className={`rounded-xl px-3 py-2 text-xs font-black ${
                                isProjected
                                  ? "bg-emerald-600 text-white"
                                  : "bg-blue-600 text-white hover:bg-blue-500"
                              }`}
                            >
                              {isProjected
                                ? "📺 Proyectada"
                                : "📺 Proyectar en mapa"}
                            </button>

                            {isProjected && (
                              <button
                                type="button"
                                onClick={
                                  hideProjection
                                }
                                className="rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-950/50"
                              >
                                ✕ Quitar de pantalla
                              </button>
                            )}

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>
              )}

            </div>

            <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
              Fuente oficial: Servicio Meteorológico Nacional · actualización automática cada 10 minutos.
            </div>

          </div>

        </div>
      )}
    </>
  );
}
