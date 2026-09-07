"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MapaAlertas = dynamic(
  () => import("../components/MapaAlertas"),
  { ssr: false }
);

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

export default function MapaPublicoPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("24h"); 

  async function cargarAlertas() {
    try {
      const response = await fetch("/api/reports");

      if (!response.ok) {
        throw new Error("Error al cargar las alertas");
      }

      const data = await response.json();

      // En el mapa público no mostramos alertas resueltas
const ahora = Date.now();

const activas = data.reports.filter((report: Report) => {
  if (
    ["resuelta", "resuelto"].includes(report.status.toLowerCase()) ||
    report.latitude === null ||
    report.longitude === null
  ) {
    return false;
  }

  if (periodo === "todas") {
    return true;
  }

  const fechaReporte = new Date(report.createdAt).getTime();
  const diferenciaHoras = (ahora - fechaReporte) / (1000 * 60 * 60);

  if (periodo === "12h") return diferenciaHoras <= 12;
  if (periodo === "24h") return diferenciaHoras <= 24;
  if (periodo === "mes") return diferenciaHoras <= 24 * 30;
  if (periodo === "anio") return diferenciaHoras <= 24 * 365;

  return true;
});
      setReports(activas);
    } catch (error) {
      console.error("Error cargando mapa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  cargarAlertas();
}, [periodo]);
  
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-5 py-8">

        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="mb-6 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"
        >
          ← Volver
        </button>

        <div className="mb-6">
          <p className="text-sm text-slate-400">ALERTA OTAMENDI</p>

          <h1 className="mt-1 text-3xl font-bold">
            🗺️ Mapa de alertas
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Situaciones reportadas recientemente por la comunidad.
          </p>
        </div>
<div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
  <div>
    <p className="text-sm font-semibold text-white">
      🕒 Período de alertas
    </p>
    <p className="text-xs text-slate-400">
      Seleccioná qué alertas mostrar en el mapa
    </p>
  </div>

  <select
    value={periodo}
    onChange={(e) => setPeriodo(e.target.value)}
    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
  >
    <option value="12h">Últimas 12 horas</option>
    <option value="24h">Últimas 24 horas</option>
    <option value="mes">Último mes</option>
    <option value="anio">Último año</option>
    <option value="todas">Todas las alertas</option>
  </select>
</div>
        {loading ? (
          <div className="rounded-2xl bg-slate-900 p-8 text-center">
            Cargando alertas...
          </div>
        ) : (
          <MapaAlertas reports={reports} />
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          Por seguridad, el mapa muestra únicamente información general
          de las alertas.
        </p>

      </div>
    </main>
  );
}
