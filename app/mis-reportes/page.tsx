"use client";

import { useEffect, useState } from "react";

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  createdAt?: string;
};

export default function MisReportesPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarReportes() {
      try {
        const ids: number[] = JSON.parse(
          localStorage.getItem("mis_reportes") || "[]"
        );

        if (ids.length === 0) {
          setLoading(false);
          return;
        }

        const response = await fetch("/api/reports");
        const data = await response.json();

        const todosLosReportes: Report[] = Array.isArray(data)
          ? data
          : data.reports || [];

        const misReportes = todosLosReportes.filter((report) =>
          ids.includes(report.id)
        );

        setReports(misReportes);
      } catch (error) {
        console.error("Error cargando mis reportes:", error);
      } finally {
        setLoading(false);
      }
    }

    cargarReportes();
  }, []);

  function estadoTexto(status: string) {
    if (status === "pendiente") return "🟡 Pendiente";
    if (status === "en_analisis") return "🔵 En análisis";
    if (status === "resuelta") return "🟢 Resuelto";
    return status;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="mb-6 text-sm text-slate-400 hover:text-white"
        >
          ← Volver
        </button>

        <h1 className="text-2xl font-bold">📄 Mis reportes</h1>

        <p className="mt-2 text-sm text-slate-400">
          Acá podrás consultar el estado de las alertas que enviaste.
        </p>

        {loading && (
          <div className="mt-8 rounded-2xl bg-slate-900 p-5">
            Cargando reportes...
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="font-semibold">Todavía no hay reportes guardados.</p>

            <p className="mt-2 text-sm text-slate-400">
              Las alertas que envíes desde este dispositivo aparecerán acá.
            </p>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div className="mt-8 space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      REPORTE #{report.id}
                    </p>

                    <h2 className="mt-1 text-lg font-bold">
                      {report.category}
                    </h2>
                  </div>

                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold">
                    {estadoTexto(report.status)}
                  </span>
                </div>

                <p className="mt-4 text-sm text-slate-300">
                  {report.description || "Sin descripción"}
                </p>

                {report.createdAt && (
                  <p className="mt-4 text-xs text-slate-500">
                    {new Date(report.createdAt).toLocaleString("es-AR")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
