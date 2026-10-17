"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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

function severityInfo(
  value: string | null
) {
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

function formatDate(
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

function relativeTime(
  value: string | null
) {
  if (!value) {
    return "sin sincronización";
  }

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "sin sincronización";
  }

  const minutes =
    Math.max(
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
  const [
    data,
    setData,
  ] =
    useState<WeatherResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    expanded,
    setExpanded,
  ] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    const load =
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

          const json =
            (await response.json()) as WeatherResponse;

          if (
            !cancelled &&
            response.ok &&
            json.success
          ) {
            setData(json);
          }
        } catch (error) {
          console.error(
            "Error cargando panel meteorológico:",
            error
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
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

  const visibleAlerts =
    expanded
      ? alerts
      : alerts.slice(0, 3);

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

  return (
    <div className="rounded-3xl border border-sky-500/25 bg-sky-950/10 p-3">

      <div className="flex items-start justify-between gap-3">

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
            🌦️ Meteorología oficial
          </p>

          <h2 className="mt-1 text-base font-black">
            Alertas SMN
          </h2>
        </div>

        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-black ${
            sourceHealthy
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/15 text-amber-300"
          }`}
        >
          {sourceHealthy
            ? "● SMN CONECTADO"
            : "● REVISAR FUENTE"}
        </span>

      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2">

        <div>
          <p className="text-[10px] uppercase text-slate-500">
            Alertas vigentes
          </p>

          <p className="text-2xl font-black">
            {alerts.length}
          </p>
        </div>

        <div className="text-right text-[10px] text-slate-500">
          <div>
            Última consulta
          </div>

          <div className="font-semibold text-slate-300">
            {relativeTime(
              data?.source
                ?.lastSuccessAt ??
                null
            )}
          </div>
        </div>

      </div>

      {loading && (
        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
          Cargando información del SMN…
        </div>
      )}

      {!loading &&
        alerts.length === 0 && (
          <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-300">
            ✓ No hay alertas meteorológicas oficiales vigentes.
          </div>
        )}

      <div className="mt-3 space-y-2">

        {visibleAlerts.map(
          (alert) => {
            const severity =
              severityInfo(
                alert.severity
              );

            return (
              <div
                key={alert.id}
                className={`rounded-2xl border p-3 ${severity.card}`}
              >

                <div className="flex items-start justify-between gap-2">

                  <p className="text-sm font-black">
                    {severity.icon}{" "}
                    {alert.event}
                  </p>

                  <span
                    className={`rounded-full border px-2 py-1 text-[9px] font-black ${severity.badge}`}
                  >
                    {
                      severity.label
                    }
                  </span>

                </div>

                {alert.headline && (
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {alert.headline}
                  </p>
                )}

                {alert.areaDescription && (
                  <p className="mt-2 text-[11px] leading-4 text-slate-400">
                    📍{" "}
                    {
                      alert.areaDescription
                    }
                  </p>
                )}

                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">

                  <div>
                    <span className="text-slate-500">
                      Inicio
                    </span>

                    <div className="font-semibold text-slate-300">
                      {formatDate(
                        alert.onsetAt ||
                          alert.effectiveAt
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-500">
                      Vence
                    </span>

                    <div className="font-semibold text-slate-300">
                      {formatDate(
                        alert.expiresAt
                      )}
                    </div>
                  </div>

                </div>

                {alert.instruction && (
                  <div className="mt-2 rounded-xl border border-white/5 bg-black/15 p-2 text-[11px] leading-4 text-slate-300">
                    <b>
                      Recomendación oficial:
                    </b>{" "}
                    {
                      alert.instruction
                    }
                  </div>
                )}

              </div>
            );
          }
        )}

      </div>

      {alerts.length > 3 && (
        <button
          type="button"
          onClick={() =>
            setExpanded(
              (value) => !value
            )
          }
          className="mt-3 w-full rounded-xl border border-sky-500/25 bg-sky-950/20 px-3 py-2 text-xs font-black text-sky-200"
        >
          {expanded
            ? "Mostrar menos"
            : `Ver las ${alerts.length} alertas vigentes`}
        </button>
      )}

      <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
        Fuente oficial: Servicio Meteorológico Nacional
      </div>

    </div>
  );
}
