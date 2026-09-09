"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const MapaAlertas = dynamic(() => import("../components/MapaAlertas"), {
  ssr: false,
});

type PublicReport = {
  id: number;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

const PUBLIC_MARKER_HOURS = 2;

export default function MapaPublicoPage() {
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function cargarAlertas() {
    try {
      const response = await fetch("/api/reports", {
        cache: "no-store",
        credentials: "omit",
      });

      if (!response.ok) {
        throw new Error("No se pudieron cargar las alertas públicas.");
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.reports)) {
        // Defensa adicional en el cliente: sólo copiamos los campos públicos.
        const publicReports: PublicReport[] = data.reports.map((report: PublicReport) => ({
          id: report.id,
          category: report.category,
          status: report.status,
          latitude: report.latitude,
          longitude: report.longitude,
          createdAt: report.createdAt,
        }));

        setReports(publicReports);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error cargando mapa público:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarAlertas();

    const interval = window.setInterval(() => {
      void cargarAlertas();
    }, 20_000);

    return () => window.clearInterval(interval);
  }, []);

  const visibleReports = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = PUBLIC_MARKER_HOURS * 60 * 60 * 1000;

    return reports.filter((report) => {
      if (report.latitude === null || report.longitude === null) return false;

      const status = report.status.toLowerCase().trim();
      if (["resuelta", "resuelto", "descartada"].includes(status)) return false;

      const createdAt = new Date(report.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;

      return now - createdAt <= maxAgeMs;
    });
  }, [reports]);

  const importantes = visibleReports.filter((report) =>
    ["Emergencia", "Delito / Robo", "Accidente", "Incendio"].includes(report.category)
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="mb-3 text-sm font-semibold text-slate-400 transition hover:text-white"
            >
              ← Volver al inicio
            </button>

            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
              Alerta Otamendi
            </p>

            <h1 className="mt-1 text-3xl font-black">🗺️ Mapa comunitario</h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Alertas comunitarias recientes. Los marcadores públicos permanecen visibles durante aproximadamente {PUBLIC_MARKER_HOURS} horas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void cargarAlertas()}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold transition hover:bg-slate-800"
          >
            ↻ Actualizar
          </button>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Activas</p>
            <p className="mt-1 text-2xl font-black">{visibleReports.length}</p>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-300">Importantes</p>
            <p className="mt-1 text-2xl font-black">{importantes}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actualizado</p>
            <p className="mt-2 text-sm font-black">
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[430px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Cargando mapa de alertas…
          </div>
        ) : (
          <MapaAlertas
            reports={visibleReports}
            mode="public"
            heightClassName="h-[62vh] min-h-[430px] md:h-[650px]"
          />
        )}

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-400">
          🔒 El mapa comunitario no muestra descripciones, fotografías, videos, audios ni herramientas del centro de monitoreo. Las ubicaciones públicas son aproximadas.
        </div>
      </div>
    </main>
  );
}
