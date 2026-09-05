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
};

export default function MapaPublicoPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  async function cargarAlertas() {
    try {
      const response = await fetch("/api/reports");

      if (!response.ok) {
        throw new Error("Error al cargar las alertas");
      }

      const data = await response.json();

      // En el mapa público no mostramos alertas resueltas
const activas = data.reports.filter(
  (report: Report) =>
    !["resuelta", "resuelto"].includes(report.status.toLowerCase()) &&
    report.latitude !== null &&
    report.longitude !== null
);
      setReports(activas);
    } catch (error) {
      console.error("Error cargando mapa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarAlertas();
  }, []);

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