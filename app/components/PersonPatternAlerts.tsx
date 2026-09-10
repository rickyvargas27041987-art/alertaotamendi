"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PersonPatternAlert = {
  id: number;
  triggerReportId: number;
  reportIds: number[];
  reportCount: number;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusKm: number;
  timeWindowMinutes: number;
  summary: string;
  reason: string | null;
  confidence: number | null;
  status: string;
  lastReportAt: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  onOpenReport: (reportId: number) => void;
};

export default function PersonPatternAlerts({
  onOpenReport,
}: Props) {
  const [alerts, setAlerts] = useState<PersonPatternAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  const initializedRef = useRef(false);
  const latestSignatureRef = useRef<string | null>(null);

  const playPatternAlarm = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();

      const tone = (
        frequency: number,
        start: number,
        duration: number
      ) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        gain.gain.setValueAtTime(
          0.2,
          audioContext.currentTime + start
        );

        gain.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + start + duration
        );

        oscillator.start(
          audioContext.currentTime + start
        );

        oscillator.stop(
          audioContext.currentTime + start + duration
        );
      };

      tone(880, 0, 0.22);
      tone(660, 0.28, 0.22);
      tone(880, 0.56, 0.22);
      tone(1100, 0.84, 0.4);

      window.setTimeout(() => {
        void audioContext.close();
      }, 1600);
    } catch (error) {
      console.error(
        "No se pudo reproducir la alarma de patrón:",
        error
      );
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/person-pattern-alerts",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (
        !response.ok ||
        !data.success ||
        !Array.isArray(data.alerts)
      ) {
        return;
      }

      const nextAlerts =
        data.alerts as PersonPatternAlert[];

      setAlerts(nextAlerts);

      const latest = nextAlerts[0] ?? null;

      const signature = latest
        ? `${latest.id}:${latest.reportCount}:${latest.updatedAt}`
        : null;

      if (!initializedRef.current) {
        initializedRef.current = true;
        latestSignatureRef.current = signature;
        return;
      }

      if (
        signature &&
        latestSignatureRef.current &&
        signature !== latestSignatureRef.current
      ) {
        playPatternAlarm();
      }

      latestSignatureRef.current = signature;
    } catch (error) {
      console.error(
        "Error cargando alertas de patrón:",
        error
      );
    } finally {
      setLoading(false);
    }
  }, [playPatternAlarm]);

  useEffect(() => {
    void loadAlerts();

    const interval = window.setInterval(
      () => void loadAlerts(),
      3000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [loadAlerts]);

  async function changeStatus(
    id: number,
    status:
      | "pendiente"
      | "en_revision"
      | "resuelta"
      | "descartada"
  ) {
    try {
      setActionId(id);

      const response = await fetch(
        "/api/person-pattern-alerts",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id,
            status,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        window.alert(
          data.error ||
            "No se pudo actualizar la alerta de patrón."
        );
        return;
      }

      await loadAlerts();
    } catch (error) {
      console.error(error);
      window.alert(
        "Error al actualizar la alerta de patrón."
      );
    } finally {
      setActionId(null);
    }
  }

  if (loading || alerts.length === 0) {
    return null;
  }

  const alert = alerts[0];

  return (
    <div className="fixed bottom-4 right-4 z-[99998] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border-2 border-amber-400 bg-slate-950 shadow-2xl shadow-black/50">
      <div className="border-b border-amber-400/30 bg-amber-500/15 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-black">
              ⚠️ Patrón repetido detectado
            </div>

            <h2 className="mt-3 text-xl font-black text-white">
              👤 {alert.reportCount} reportes posiblemente relacionados
            </h2>

            <p className="mt-1 text-sm font-semibold text-amber-100">
              Persona sospechosa · misma zona
            </p>
          </div>

          <span className="rounded-xl border border-amber-400/30 bg-black/30 px-3 py-2 text-xs font-bold text-amber-200">
            IA
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm leading-5 text-slate-200">
          {alert.summary}
        </p>

        {alert.reason && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Motivo de la coincidencia
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {alert.reason}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <span className="text-slate-500">Zona:</span>{" "}
            <strong>hasta {alert.radiusKm} km</strong>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <span className="text-slate-500">Ventana:</span>{" "}
            <strong>{alert.timeWindowMinutes} min</strong>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Reportes relacionados
          </p>

          <div className="flex flex-wrap gap-2">
            {alert.reportIds.map((reportId) => (
              <button
                key={reportId}
                onClick={() => onOpenReport(reportId)}
                className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
              >
                #{reportId}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            onClick={() =>
              onOpenReport(alert.triggerReportId)
            }
            className="rounded-xl bg-amber-400 px-3 py-3 text-xs font-black text-black hover:bg-amber-300"
          >
            Abrir último reporte
          </button>

          <button
            disabled={actionId === alert.id}
            onClick={() =>
              void changeStatus(
                alert.id,
                "en_revision"
              )
            }
            className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-3 text-xs font-bold text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
          >
            En revisión
          </button>

          <button
            disabled={actionId === alert.id}
            onClick={() =>
              void changeStatus(
                alert.id,
                "resuelta"
              )
            }
            className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            Resolver
          </button>
        </div>

        <button
          disabled={actionId === alert.id}
          onClick={() =>
            void changeStatus(
              alert.id,
              "descartada"
            )
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 disabled:opacity-50"
        >
          Descartar coincidencia
        </button>

        <p className="text-[10px] leading-4 text-slate-500">
          La coincidencia es una ayuda de IA para el operador y no una identificación definitiva de una persona.
        </p>
      </div>
    </div>
  );
}
