"use client";

import { useEffect, useState } from "react";

type Report = {
  id: number;
  category: string;
  status: string;
  createdAt: string;
};

function estadoTexto(status: string) {
  if (status === "pendiente") return "Pendiente";
  if (status === "en_analisis") return "En análisis";
  if (status === "verificada") return "Verificada";
  if (status === "resuelta") return "Resuelta";
  if (status === "descartada") return "Descartada";
  return status;
}

function estadoClass(status: string) {
  if (status === "pendiente") return "bg-yellow-500/15 text-yellow-300 border-yellow-500/20";
  if (status === "en_analisis") return "bg-blue-500/15 text-blue-300 border-blue-500/20";
  if (status === "verificada") return "bg-violet-500/15 text-violet-300 border-violet-500/20";
  if (status === "resuelta") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

export default function MisReportesPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarReportes() {
      try {
        const ids: number[] = JSON.parse(localStorage.getItem("mis_reportes") || "[]");
        if (ids.length === 0) return;

        const response = await fetch("/api/reports/mine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.reports)) setReports(data.reports);
      } catch (error) {
        console.error("Error cargando mis reportes:", error);
      } finally {
        setLoading(false);
      }
    }

    void cargarReportes();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5">
        <button onClick={() => (window.location.href = "/")} className="mb-5 text-sm font-semibold text-slate-400 hover:text-white">
          ← Volver al inicio
        </button>

        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">Seguimiento</p>
        <h1 className="mt-1 text-3xl font-black">📄 Mis reportes</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Consultá el avance de las alertas enviadas desde este dispositivo. No se muestra información de otros vecinos.
        </p>

        {loading && <div className="mt-6 rounded-2xl bg-slate-900 p-6 text-center text-slate-400">Cargando reportes…</div>}

        {!loading && reports.length === 0 && (
          <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-lg font-bold">Todavía no hay reportes guardados.</p>
            <p className="mt-2 text-sm text-slate-400">Las alertas que envíes desde este dispositivo aparecerán acá.</p>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div className="mt-6 space-y-4">
            {reports.map((report) => {
              const analysisReached = ["en_analisis", "verificada", "resuelta"].includes(report.status);
              const resolvedReached = report.status === "resuelta";

              return (
                <article key={report.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Reporte #{report.id}</p>
                      <h2 className="mt-1 text-lg font-black">{report.category}</h2>
                      <p className="mt-1 text-xs text-slate-500">{new Date(report.createdAt).toLocaleString("es-AR")}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${estadoClass(report.status)}`}>
                      {estadoTexto(report.status)}
                    </span>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Estado del reporte</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
                      <div className="rounded-xl bg-yellow-500/15 px-2 py-3 text-yellow-300">✓ Recibido</div>
                      <div className={`rounded-xl px-2 py-3 ${analysisReached ? "bg-blue-500/15 text-blue-300" : "bg-slate-950 text-slate-600"}`}>🔎 En análisis</div>
                      <div className={`rounded-xl px-2 py-3 ${resolvedReached ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-950 text-slate-600"}`}>✓ Resuelto</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
