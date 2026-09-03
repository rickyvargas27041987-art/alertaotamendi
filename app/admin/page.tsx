"use client";

import { useEffect, useState } from "react";

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  createdAt: string;
};

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    try {
      const response = await fetch("/api/reports");
      const data = await response.json();

      if (data.success) {
        setReports(data.reports.reverse());
      }
    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();

    const interval = setInterval(() => {
      loadReports();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const total = reports.length;

  const pending = reports.filter(
    (report) => report.status === "pendiente"
  ).length;

  const resolved = reports.filter(
    (report) => report.status === "resuelta"
  ).length;

  function formatDate(date: string) {
    return new Date(date).toLocaleString("es-AR");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-8">

        {/* ENCABEZADO */}
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-2xl">
                🚨
              </div>

              <div>
                <h1 className="text-2xl font-bold">
                  ALERTA OTAMENDI
                </h1>

                <p className="text-sm text-slate-400">
                  Centro de monitoreo
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={loadReports}
            className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
          >
            🔄 Actualizar
          </button>
        </header>

        {/* CONTADORES */}
        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Alertas recibidas
            </p>

            <p className="mt-2 text-4xl font-bold">
              {total}
            </p>
          </div>

          <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-6">
            <p className="text-sm text-orange-300">
              Pendientes
            </p>

            <p className="mt-2 text-4xl font-bold text-orange-400">
              {pending}
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <p className="text-sm text-emerald-300">
              Resueltas
            </p>

            <p className="mt-2 text-4xl font-bold text-emerald-400">
              {resolved}
            </p>
          </div>
        </section>

        {/* TÍTULO LISTA */}
        <section className="mb-4">
          <h2 className="text-xl font-bold">
            Alertas recientes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Los reportes se actualizan automáticamente cada 3 segundos.
          </p>
        </section>

        {/* ESTADO DE CARGA */}
        {loading && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Cargando alertas...
          </div>
        )}

        {/* SIN REPORTES */}
        {!loading && reports.length === 0 && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-lg font-semibold">
              No hay alertas todavía.
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Cuando un vecino envíe una alerta, aparecerá acá.
            </p>
          </div>
        )}

        {/* LISTA DE REPORTES */}
        <section className="space-y-4">
          {reports.map((report) => (
            <article
              key={report.id}
              className="rounded-3xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 text-2xl">
                    🚨
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400">
                        #{report.id}
                      </span>

                      <span className="rounded-lg bg-orange-500/20 px-2 py-1 text-xs font-semibold text-orange-300">
                        {report.status.toUpperCase()}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-bold">
                      {report.category}
                    </h3>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      {report.description}
                    </p>

                    <p className="mt-3 text-xs text-slate-500">
                      {formatDate(report.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700">
                    Ver detalle
                  </button>
                </div>

              </div>
            </article>
          ))}
        </section>

      </div>
    </main>
  );
}