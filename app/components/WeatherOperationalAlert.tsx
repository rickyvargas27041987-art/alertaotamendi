"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

const WEATHER_OPERATIONAL_STATE_KEY =
  "alerta_otamendi_weather_operational_v1";

type WeatherOperationalAlertItem = {
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

type Props = {
  alerts: WeatherOperationalAlertItem[];
  onOpenPanel: () => void;
  onShowZones: () => void;
  onProjectAlert: (
    alert: WeatherOperationalAlertItem
  ) => void;
};

type StoredAlertState = {
  notifiedRank: number;
  acknowledgedRank: number;
  updatedAt: number;
};

type StoredOperationalState = {
  alerts: Record<
    string,
    StoredAlertState
  >;
};

function severityRank(
  severity: string | null
) {
  const value =
    severity?.toLowerCase() ??
    "";

  if (value === "extreme") {
    return 4;
  }

  if (value === "severe") {
    return 3;
  }

  if (value === "moderate") {
    return 2;
  }

  return 1;
}

function severityInfo(
  severity: string | null
) {
  const rank =
    severityRank(severity);

  if (rank === 4) {
    return {
      rank,
      label: "EXTREMA",
      icon: "🚨",
      border:
        "border-red-400",
      background:
        "bg-red-950/95",
      badge:
        "border-red-300 bg-red-500/25 text-red-100",
      accent:
        "text-red-200",
      pulse: true,
    };
  }

  if (rank === 3) {
    return {
      rank,
      label: "SEVERA",
      icon: "⚠️",
      border:
        "border-orange-400",
      background:
        "bg-orange-950/95",
      badge:
        "border-orange-300 bg-orange-500/25 text-orange-100",
      accent:
        "text-orange-200",
      pulse: false,
    };
  }

  if (rank === 2) {
    return {
      rank,
      label: "MODERADA",
      icon: "🟡",
      border:
        "border-yellow-400/80",
      background:
        "bg-slate-950/95",
      badge:
        "border-yellow-400/50 bg-yellow-500/20 text-yellow-100",
      accent:
        "text-yellow-200",
      pulse: false,
    };
  }

  return {
    rank,
    label:
      severity?.toUpperCase() ||
      "ALERTA",
    icon: "🌦️",
    border:
      "border-sky-400/70",
    background:
      "bg-slate-950/95",
    badge:
      "border-sky-400/40 bg-sky-500/20 text-sky-100",
    accent:
      "text-sky-200",
    pulse: false,
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

function emptyState(): StoredOperationalState {
  return {
    alerts: {},
  };
}

function readOperationalState() {
  if (
    typeof window ===
    "undefined"
  ) {
    return emptyState();
  }

  try {
    const raw =
      window.localStorage.getItem(
        WEATHER_OPERATIONAL_STATE_KEY
      );

    if (!raw) {
      return emptyState();
    }

    const parsed =
      JSON.parse(
        raw
      ) as Partial<StoredOperationalState>;

    if (
      !parsed.alerts ||
      typeof parsed.alerts !==
        "object"
    ) {
      return emptyState();
    }

    return {
      alerts:
        parsed.alerts as Record<
          string,
          StoredAlertState
        >,
    };
  } catch (error) {
    console.warn(
      "No se pudo leer el estado operativo del SMN:",
      error
    );

    return emptyState();
  }
}

function writeOperationalState(
  state: StoredOperationalState
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    /*
     * Conservamos como máximo 100 registros para que
     * localStorage no crezca indefinidamente.
     */
    const entries =
      Object.entries(
        state.alerts
      )
        .sort(
          (
            [, a],
            [, b]
          ) =>
            (b.updatedAt ??
              0) -
            (a.updatedAt ??
              0)
        )
        .slice(0, 100);

    window.localStorage.setItem(
      WEATHER_OPERATIONAL_STATE_KEY,
      JSON.stringify({
        alerts:
          Object.fromEntries(
            entries
          ),
      })
    );
  } catch (error) {
    console.warn(
      "No se pudo guardar el estado operativo del SMN:",
      error
    );
  }
}

function playOperationalSound(
  rank: number
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const audioContext =
      new AudioContextClass();

    if (
      audioContext.state ===
      "suspended"
    ) {
      void audioContext
        .resume()
        .catch(() => {});
    }

    const sequence =
      rank >= 4
        ? [
            {
              frequency: 900,
              start: 0,
              duration: 0.24,
            },
            {
              frequency: 1150,
              start: 0.3,
              duration: 0.24,
            },
            {
              frequency: 900,
              start: 0.6,
              duration: 0.24,
            },
            {
              frequency: 1350,
              start: 0.9,
              duration: 0.42,
            },
          ]
        : rank === 3
          ? [
              {
                frequency: 760,
                start: 0,
                duration: 0.25,
              },
              {
                frequency: 960,
                start: 0.34,
                duration: 0.28,
              },
              {
                frequency: 1180,
                start: 0.73,
                duration: 0.38,
              },
            ]
          : rank === 2
            ? [
                {
                  frequency: 620,
                  start: 0,
                  duration: 0.22,
                },
                {
                  frequency: 820,
                  start: 0.32,
                  duration: 0.3,
                },
              ]
            : [
                {
                  frequency: 560,
                  start: 0,
                  duration: 0.26,
                },
              ];

    for (
      const tone of
      sequence
    ) {
      const oscillator =
        audioContext.createOscillator();

      const gain =
        audioContext.createGain();

      oscillator.connect(
        gain
      );

      gain.connect(
        audioContext.destination
      );

      oscillator.type =
        "sine";

      oscillator.frequency.value =
        tone.frequency;

      gain.gain.setValueAtTime(
        0.18,
        audioContext.currentTime +
          tone.start
      );

      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime +
          tone.start +
          tone.duration
      );

      oscillator.start(
        audioContext.currentTime +
          tone.start
      );

      oscillator.stop(
        audioContext.currentTime +
          tone.start +
          tone.duration
      );
    }

    const closeAfter =
      Math.max(
        ...sequence.map(
          (tone) =>
            tone.start +
            tone.duration
        )
      ) +
      0.5;

    window.setTimeout(
      () => {
        void audioContext
          .close()
          .catch(() => {});
      },
      closeAfter * 1000
    );
  } catch (error) {
    console.warn(
      "No se pudo reproducir el aviso meteorológico:",
      error
    );
  }
}

export default function WeatherOperationalAlert({
  alerts,
  onOpenPanel,
  onShowZones,
  onProjectAlert,
}: Props) {
  const [
    activeAlert,
    setActiveAlert,
  ] =
    useState<WeatherOperationalAlertItem | null>(
      null
    );

  const [
    revision,
    setRevision,
  ] =
    useState(0);

  /*
   * Guardamos la última función en un ref para poder
   * encender automáticamente la capa sin convertir
   * cada render del padre en una alerta nueva.
   */
  const showZonesRef =
    useRef(
      onShowZones
    );

  useEffect(() => {
    showZonesRef.current =
      onShowZones;
  }, [onShowZones]);

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    const stored =
      readOperationalState();

    const candidates =
      alerts
        .map(
          (alert) => {
            const rank =
              severityRank(
                alert.severity
              );

            const previous =
              stored.alerts[
                String(
                  alert.id
                )
              ];

            const acknowledgedRank =
              previous
                ?.acknowledgedRank ??
              0;

            return {
              alert,
              rank,
              acknowledgedRank,
              previous,
            };
          }
        )
        .filter(
          (item) =>
            item.rank >
            item.acknowledgedRank
        )
        .sort(
          (a, b) => {
            if (
              b.rank !==
              a.rank
            ) {
              return (
                b.rank -
                a.rank
              );
            }

            const aStart =
              new Date(
                a.alert.onsetAt ||
                  a.alert.effectiveAt ||
                  0
              ).getTime();

            const bStart =
              new Date(
                b.alert.onsetAt ||
                  b.alert.effectiveAt ||
                  0
              ).getTime();

            return (
              bStart -
              aStart
            );
          }
        );

    const next =
      candidates[0];

    if (!next) {
      setActiveAlert(
        null
      );

      return;
    }

    setActiveAlert(
      next.alert
    );

    const notifiedRank =
      next.previous
        ?.notifiedRank ??
      0;

    /*
     * Solo hacemos sonar si esta alerta es nueva para
     * este terminal o aumentó de severidad.
     */
    if (
      next.rank >
      notifiedRank
    ) {
      stored.alerts[
        String(
          next.alert.id
        )
      ] = {
        notifiedRank:
          next.rank,

        acknowledgedRank:
          next.previous
            ?.acknowledgedRank ??
          0,

        updatedAt:
          Date.now(),
      };

      writeOperationalState(
        stored
      );

      playOperationalSound(
        next.rank
      );

      /*
       * En alertas severas o extremas encendemos
       * automáticamente la capa meteorológica para
       * que el operador vea el perímetro afectado.
       */
      if (
        next.rank >= 3
      ) {
        showZonesRef.current();
      }
    }
  }, [
    alerts,
    revision,
  ]);

  function acknowledgeAlert() {
    if (!activeAlert) {
      return;
    }

    const rank =
      severityRank(
        activeAlert.severity
      );

    const stored =
      readOperationalState();

    const previous =
      stored.alerts[
        String(
          activeAlert.id
        )
      ];

    stored.alerts[
      String(
        activeAlert.id
      )
    ] = {
      notifiedRank:
        Math.max(
          previous
            ?.notifiedRank ??
            0,
          rank
        ),

      acknowledgedRank:
        Math.max(
          previous
            ?.acknowledgedRank ??
            0,
          rank
        ),

      updatedAt:
        Date.now(),
    };

    writeOperationalState(
      stored
    );

    setActiveAlert(
      null
    );

    setRevision(
      (value) =>
        value + 1
    );
  }

  if (!activeAlert) {
    return null;
  }

  const severity =
    severityInfo(
      activeAlert.severity
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[99980] flex justify-center px-4">

      <div
        className={`pointer-events-auto w-full max-w-2xl rounded-3xl border-2 ${severity.border} ${severity.background} p-5 text-white shadow-2xl backdrop-blur-xl ${
          severity.pulse
            ? "animate-pulse"
            : ""
        }`}
      >

        <div className="flex items-start justify-between gap-4">

          <div className="min-w-0">

            <p
              className={`text-[11px] font-black uppercase tracking-[0.2em] ${severity.accent}`}
            >
              🌦️ Nueva alerta SMN para tu jurisdicción
            </p>

            <h2 className="mt-2 text-xl font-black leading-6 sm:text-2xl">
              {severity.icon}{" "}
              {activeAlert.event}
            </h2>

          </div>

          <span
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${severity.badge}`}
          >
            {
              severity.label
            }
          </span>

        </div>

        {activeAlert.headline && (
          <p className="mt-3 text-sm font-bold leading-5 text-slate-100">
            {
              activeAlert.headline
            }
          </p>
        )}

        {activeAlert.areaDescription && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">

            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              📍 Zona afectada
            </p>

            <p className="mt-1 text-sm font-semibold leading-5 text-slate-200">
              {
                activeAlert.areaDescription
              }
            </p>

          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">

          <div className="rounded-xl border border-white/10 bg-black/15 p-3">

            <p className="text-[10px] font-bold uppercase text-slate-500">
              Inicio
            </p>

            <p className="mt-1 text-xs font-bold text-slate-200">
              {formatDate(
                activeAlert.onsetAt ||
                  activeAlert.effectiveAt
              )}
            </p>

          </div>

          <div className="rounded-xl border border-white/10 bg-black/15 p-3 text-right">

            <p className="text-[10px] font-bold uppercase text-slate-500">
              Vigente hasta
            </p>

            <p className="mt-1 text-xs font-bold text-slate-200">
              {formatDate(
                activeAlert.expiresAt
              )}
            </p>

          </div>

        </div>

        {activeAlert.instruction && (
          <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-950/25 p-3 text-xs leading-5 text-slate-200">

            <span className="font-black text-sky-200">
              Recomendación oficial:
            </span>{" "}

            {
              activeAlert.instruction
            }

          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">

          <button
            type="button"
            onClick={
              onOpenPanel
            }
            className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
          >
            🌦️ Ver detalle SMN
          </button>

          <button
            type="button"
            onClick={
              onShowZones
            }
            className="rounded-xl border border-sky-400/40 bg-sky-950/50 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-900/60"
          >
            🗺️ Mostrar zona
          </button>

          <button
            type="button"
            onClick={() =>
              onProjectAlert(
                activeAlert
              )
            }
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500"
          >
            📺 Proyectar en mapa grande
          </button>

          <button
            type="button"
            onClick={
              acknowledgeAlert
            }
            className="ml-auto rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500"
          >
            ✓ Marcar como revisada
          </button>

        </div>

        <p className="mt-3 text-[10px] leading-4 text-slate-500">
          El aviso sonoro se reproduce una sola vez por alerta y vuelve a activarse únicamente si aumenta su severidad.
        </p>

      </div>

    </div>
  );
}
