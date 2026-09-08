"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const MapaAlertas = dynamic(() => import("../components/MapaAlertas"), {
  ssr: false,
});

type Report = {
  id: number;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

export default function MapaPublicoPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("24h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function cargarAlertas() {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (!response.ok) throw new Error("Error al cargar las alertas");
      const data = await response.json();
      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error cargando mapa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarAlertas();
    const interval = window.setInterval(() => void cargarAlertas(), 20_000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleReports = useMemo(() => {
    const now = Date.now();

    return reports.filter((report) => {
      if (
        ["resuelta", "descartada"].includes(report.status.toLowerCase()) ||
        report.latitude === null ||
        report.longitude === null
      ) {
        return false;
      }

      if (periodo === "todas") return true;
      const hours = (now - new Date(report.createdAt).getTime()) / (1000 * 60 * 60);
      if (periodo === "12h") return hours <= 12;
      if (periodo === "24h") return hours <= 24;
      if (periodo === "mes") return hours <= 24 * 30;
      if (periodo === "anio") return hours <= 24 * 365;
      return true;
    });
  }, [reports, periodo]);

  const important = visibleReports.filter((report) =>
    ["Emergencia", "Delito / Robo", "Accidente", "Incendio"].includes(report.category)
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              onClick={() => (window.location.href = "/")}
              className="mb-3 text-sm font-semibold text-slate-400 hover:text-white"
            >
              ← Volver al inicio
            </button>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
              Alerta Otamendi
            </p>
            <h1 className="mt-1 text-3xl font-black">🗺️ Mapa comunitario</h1>
            <p className="mt-2 text-sm text-slate-400">
              Vista general de situaciones activas reportadas por la comunidad.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void cargarAlertas()}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold"
            >
              ↻ Actualizar
            </button>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold"
            >
              <option value="12h">12 horas</option>
              <option value="24h">24 horas</option>
              <option value="mes">Último mes</option>
              <option value="anio">Último año</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[11px] text-slate-500">Activas visibles</p>
            <p className="mt-1 text-2xl font-black">{visibleReports.length}</p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-3">
            <p className="text-[11px] text-red-300">Importantes</p>
            <p className="mt-1 text-2xl font-black">{important}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[11px] text-slate-500">Actualizado</p>
            <p className="mt-1 text-sm font-bold">
              {lastUpdated ? lastUpdated.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
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
          🔒 Por seguridad, el mapa público muestra ubicaciones aproximadas y datos generales. Las descripciones completas y la evidencia multimedia quedan reservadas para el centro de monitoreo.
        </div>
      </div>
    </main>
  );
}
