"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const MapaAlertas = dynamic(() => import("../components/MapaAlertas"), {
  ssr: false,
});

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createdAt: string;
};

const PRIORIDAD_ESTADO: Record<string, number> = {
  pendiente: 1,
  en_analisis: 2,
  verificada: 3,
  resuelta: 4,
  descartada: 5,
};

const PRIORIDAD_CATEGORIA: Record<string, number> = {
  Emergencia: 1,
  "Delito / Robo": 2,
  Accidente: 3,
  Incendio: 4,
  "Vehículo sospechoso": 5,
  "Persona sospechosa": 6,
};

function esCritica(category: string) {
  return category === "Emergencia" || category === "Delito / Robo";
}

function esAlta(category: string) {
  return category === "Accidente" || category === "Incendio";
}

function esNormal(category: string) {
  return category === "Vehículo sospechoso" || category === "Persona sospechosa";
}

function esActiva(status: string) {
  return !["resuelta", "descartada"].includes(status);
}

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const [showAllReports, setShowAllReports] = useState(false);
  const [showCriticalPending, setShowCriticalPending] = useState(false);
  const [mapPeriod, setMapPeriod] = useState("24h");

  const [alertaNueva, setAlertaNueva] = useState<Report | null>(null);
  const [alertasCriticasPendientes, setAlertasCriticasPendientes] = useState<number[]>([]);

  const ultimaAlertaIdRef = useRef<number | null>(null);

  async function loadReports() {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const data = await response.json();

      if (!data.success || !Array.isArray(data.reports)) return;

      const nuevosReportes: Report[] = data.reports;

      if (nuevosReportes.length > 0) {
        const masReciente = [...nuevosReportes].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        if (
          ultimaAlertaIdRef.current !== null &&
          masReciente.id !== ultimaAlertaIdRef.current
        ) {
          setAlertaNueva(masReciente);

          if (esCritica(masReciente.category)) {
            setAlertasCriticasPendientes((prev) =>
              prev.includes(masReciente.id) ? prev : [...prev, masReciente.id]
            );
          }
        }

        ultimaAlertaIdRef.current = masReciente.id;
      }

      setReports(nuevosReportes);
    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id: number, status: string) {
    try {
      setUpdatingId(id);

      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      const data = await response.json();

      if (data.success) {
        await loadReports();
      } else {
        alert("No se pudo actualizar el estado.");
      }
    } catch (error) {
      console.error(error);
      alert("Error al actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    loadReports();
    const interval = setInterval(loadReports, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!alertaNueva) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();

    const sonar = (frecuencia: number, inicio: number, duracion: number) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = frecuencia;
      oscillator.type = "sine";

      gain.gain.setValueAtTime(0.18, audioContext.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + inicio + duracion
      );

      oscillator.start(audioContext.currentTime + inicio);
      oscillator.stop(audioContext.currentTime + inicio + duracion);
    };

    if (esCritica(alertaNueva.category)) {
      sonar(880, 0, 0.25);
      sonar(880, 0.35, 0.25);
      sonar(1100, 0.7, 0.4);
    } else if (esAlta(alertaNueva.category)) {
      sonar(760, 0, 0.25);
      sonar(920, 0.3, 0.3);
    } else {
      sonar(700, 0, 0.2);
    }

    return () => {
      void audioContext.close();
    };
  }, [alertaNueva]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString("es-AR");
  }

  function statusLabel(status: string) {
    switch (status) {
      case "pendiente":
        return "PENDIENTE";
      case "en_analisis":
        return "EN ANÁLISIS";
      case "verificada":
        return "VERIFICADA";
      case "resuelta":
        return "RESUELTA";
      case "descartada":
        return "DESCARTADA";
      default:
        return status.toUpperCase();
    }
  }

  function statusClass(status: string) {
    switch (status) {
      case "pendiente":
        return "bg-orange-500/20 text-orange-300";
      case "en_analisis":
        return "bg-blue-500/20 text-blue-300";
      case "verificada":
        return "bg-violet-500/20 text-violet-300";
      case "resuelta":
        return "bg-emerald-500/20 text-emerald-300";
      case "descartada":
        return "bg-slate-700 text-slate-300";
      default:
        return "bg-slate-800 text-slate-300";
    }
  }

  function marcarCriticaComoRevisada(report: Report) {
    if (!esCritica(report.category)) return;
    setAlertasCriticasPendientes((prev) => prev.filter((id) => id !== report.id));
  }

  const totals = useMemo(() => {
    const total = reports.length;
    const pending = reports.filter((r) => r.status === "pendiente").length;
    const inAnalysis = reports.filter((r) => r.status === "en_analisis").length;
    const verified = reports.filter((r) => r.status === "verificada").length;
    const resolved = reports.filter((r) => r.status === "resuelta").length;
    const critical = reports.filter((r) => esActiva(r.status) && esCritica(r.category)).length;
    const high = reports.filter((r) => esActiva(r.status) && esAlta(r.category)).length;
    const normal = reports.filter((r) => esActiva(r.status) && esNormal(r.category)).length;
    return { total, pending, inAnalysis, verified, resolved, critical, high, normal };
  }, [reports]);

  const attentionReports = useMemo(() => {
    return [...reports]
      .filter((r) => esActiva(r.status))
      .sort((a, b) => {
        const estadoA = PRIORIDAD_ESTADO[a.status] ?? 99;
        const estadoB = PRIORIDAD_ESTADO[b.status] ?? 99;
        if (estadoA !== estadoB) return estadoA - estadoB;

        const categoriaA = PRIORIDAD_CATEGORIA[a.category] ?? 99;
        const categoriaB = PRIORIDAD_CATEGORIA[b.category] ?? 99;
        if (categoriaA !== categoriaB) return categoriaA - categoriaB;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 3);
  }, [reports]);

  const mapReports = useMemo(() => {
    const ahora = Date.now();
    return reports.filter((report) => {
      if (report.latitude === null || report.longitude === null) return false;
      if (mapPeriod === "todas") return true;

      const fechaReporte = new Date(report.createdAt).getTime();
      const diferenciaHoras = (ahora - fechaReporte) / (1000 * 60 * 60);

      if (mapPeriod === "12h") return diferenciaHoras <= 12;
      if (mapPeriod === "24h") return diferenciaHoras <= 24;
      if (mapPeriod === "mes") return diferenciaHoras <= 24 * 30;
      if (mapPeriod === "anio") return diferenciaHoras <= 24 * 365;
      return true;
    });
  }, [reports, mapPeriod]);

  const visibleReports = useMemo(() => {
    if (!showCriticalPending) return reports;
    return reports.filter((report) => alertasCriticasPendientes.includes(report.id));
  }, [reports, showCriticalPending, alertasCriticasPendientes]);

  const alertVisual =
    alertaNueva && esCritica(alertaNueva.category)
      ? {
          box: "border-red-500 bg-red-950 animate-pulse",
          badge: "bg-red-600",
          label: "🔴 PRIORIDAD CRÍTICA",
        }
      : alertaNueva && esAlta(alertaNueva.category)
      ? {
          box: "border-orange-500 bg-orange-950",
          badge: "bg-orange-500",
          label: "🟠 PRIORIDAD ALTA",
        }
      : {
          box: "border-yellow-500 bg-yellow-950",
          badge: "bg-yellow-500 text-black",
          label: "🟡 PRIORIDAD NORMAL",
        };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {alertaNueva && (
        <div
          className={`fixed inset-x-4 top-4 z-[99999] mx-auto max-w-xl rounded-2xl border p-4 shadow-2xl ${alertVisual.box}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                🚨 Nueva alerta
              </p>
              <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-white ${alertVisual.badge}`}>
                {alertVisual.label}
              </span>
              <h2 className="mt-2 text-xl font-bold">{alertaNueva.category}</h2>
              <p className="mt-1 text-sm text-white/80">{alertaNueva.description}</p>
            </div>

            <button
              onClick={() => setAlertaNueva(null)}
              className="rounded-lg bg-black/20 px-3 py-2 text-sm font-bold hover:bg-black/30"
            >
              ✕
            </button>
          </div>

          <button
            onClick={() => {
              marcarCriticaComoRevisada(alertaNueva);
              setSelectedReport(alertaNueva);
              setAlertaNueva(null);
            }}
            className="mt-3 w-full rounded-xl bg-white/10 px-4 py-3 font-bold hover:bg-white/20"
          >
            👁 Ver alerta
          </button>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-5 py-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-2xl">🚨</div>
            <div>
              <h1 className="text-2xl font-bold">ALERTA OTAMENDI</h1>
              <p className="text-sm text-slate-400">Centro de monitoreo</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={loadReports} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold hover:bg-slate-700">
              🔄 Actualizar
            </button>
            <button onClick={handleLogout} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold hover:bg-red-700">
              🚪 Cerrar sesión
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-300">🔴 Críticas</p>
                <p className="mt-1 text-3xl font-bold">{totals.critical}</p>
              </div>
              {alertasCriticasPendientes.length > 0 && (
                <div className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold animate-pulse">
                  {alertasCriticasPendientes.length} sin revisar
                </div>
              )}
            </div>

            {alertasCriticasPendientes.length > 0 && (
              <button
                onClick={() => {
                  setShowCriticalPending(true);
                  setShowAllReports(true);
                }}
                className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-500"
              >
                Ver pendientes
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-orange-500/30 bg-orange-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-300">🟠 Altas</p>
            <p className="mt-1 text-3xl font-bold">{totals.high}</p>
          </div>

          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">🟡 Normales</p>
            <p className="mt-1 text-3xl font-bold">{totals.normal}</p>
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-red-500/20 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">🚨 Atención prioritaria</h2>
              <p className="text-xs text-slate-400">Primero pendientes y categorías más urgentes</p>
            </div>
            <span className="text-xs text-slate-400">Top 3</span>
          </div>

          <div className="space-y-2">
            {attentionReports.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                No hay alertas activas.
              </div>
            )}

            {attentionReports.map((report) => (
              <button
                key={`prioritaria-${report.id}`}
                onClick={() => {
                  marcarCriticaComoRevisada(report);
                  setSelectedReport(report);
                }}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-left hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">#{report.id}</span>
                    <span className="font-semibold">{report.category}</span>
                    {alertasCriticasPendientes.includes(report.id) && (
                      <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold">SIN REVISAR</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{report.description}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusClass(report.status)}`}>
                    {statusLabel(report.status)}
                  </span>
                  <p className="mt-2 text-xs text-slate-500">Ver detalle ›</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">🗺️ Mapa de alertas</h2>
              <p className="mt-1 text-sm text-slate-400">Vista operativa por período y categoría</p>
            </div>

            <select
              value={mapPeriod}
              onChange={(e) => setMapPeriod(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold"
            >
              <option value="12h">Últimas 12 horas</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="mes">Último mes</option>
              <option value="anio">Último año</option>
              <option value="todas">Todas las alertas</option>
            </select>
          </div>

          <MapaAlertas reports={mapReports} />
        </section>

        <section className="mb-8">
          <div className="mb-3">
            <h2 className="text-xl font-bold">📊 Estado general</h2>
            <p className="mt-1 text-sm text-slate-400">Actualización automática cada 3 segundos</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Total</p>
              <p className="mt-1 text-2xl font-bold">{totals.total}</p>
            </div>
            <div className="rounded-2xl border border-orange-500/20 bg-slate-900 p-4">
              <p className="text-xs text-orange-300">Pendientes</p>
              <p className="mt-1 text-2xl font-bold text-orange-300">{totals.pending}</p>
            </div>
            <div className="rounded-2xl border border-blue-500/20 bg-slate-900 p-4">
              <p className="text-xs text-blue-300">En análisis</p>
              <p className="mt-1 text-2xl font-bold text-blue-300">{totals.inAnalysis}</p>
            </div>
            <div className="rounded-2xl border border-violet-500/20 bg-slate-900 p-4">
              <p className="text-xs text-violet-300">Verificadas</p>
              <p className="mt-1 text-2xl font-bold text-violet-300">{totals.verified}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900 p-4">
              <p className="text-xs text-emerald-300">Resueltas</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{totals.resolved}</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">📋 Alertas</h2>
              <p className="mt-1 text-sm text-slate-400">
                {showCriticalPending ? "Mostrando críticas sin revisar" : "Listado completo de reportes"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {showCriticalPending && (
                <button
                  onClick={() => {
                    setShowCriticalPending(false);
                    setShowAllReports(true);
                  }}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
                >
                  Ver todas
                </button>
              )}

              <button
                onClick={() => {
                  setShowCriticalPending(false);
                  setShowAllReports(!showAllReports);
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
              >
                {showAllReports ? "Ocultar alertas" : `Ver todas (${reports.length})`}
              </button>
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
              Cargando alertas...
            </div>
          )}

          {showAllReports && (
            <div className="space-y-3">
              {visibleReports.length === 0 && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
                  No hay alertas para mostrar.
                </div>
              )}

              {visibleReports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400">#{report.id}</span>
                          <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusClass(report.status)}`}>
                            {statusLabel(report.status)}
                          </span>
                          {alertasCriticasPendientes.includes(report.id) && (
                            <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold animate-pulse">SIN REVISAR</span>
                          )}
                        </div>

                        <h3 className="mt-2 text-lg font-bold">{report.category}</h3>
                        <p className="mt-1 truncate text-sm text-slate-300">{report.description}</p>
                        <p className="mt-2 text-xs text-slate-500">{formatDate(report.createdAt)}</p>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                          {report.imageUrl && <span>📷 Foto</span>}
                          {report.videoUrl && <span>🎥 Video</span>}
                          {report.audioUrl && <span>🎤 Audio</span>}
                          {report.latitude !== null && report.longitude !== null && <span>📍 Ubicación</span>}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => {
                            marcarCriticaComoRevisada(report);
                            setSelectedReport(report);
                          }}
                          className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold hover:bg-slate-500"
                        >
                          👁 Ver detalle
                        </button>

                        <button
                          onClick={() => setOpenActionsId(openActionsId === report.id ? null : report.id)}
                          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
                        >
                          ⚙️ {openActionsId === report.id ? "Ocultar" : "Acciones"}
                        </button>
                      </div>
                    </div>

                    {openActionsId === report.id && (
                      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                        <button onClick={() => changeStatus(report.id, "en_analisis")} disabled={updatingId === report.id} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">🔎 En análisis</button>
                        <button onClick={() => changeStatus(report.id, "verificada")} disabled={updatingId === report.id} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">✅ Verificada</button>
                        <button onClick={() => changeStatus(report.id, "resuelta")} disabled={updatingId === report.id} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">✔ Resuelta</button>
                        <button onClick={() => changeStatus(report.id, "descartada")} disabled={updatingId === report.id} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-50">✖ Descartar</button>
                        <button onClick={() => changeStatus(report.id, "pendiente")} disabled={updatingId === report.id} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">↩ Pendiente</button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {selectedReport && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-bold">🚨 Detalle de alerta</h2>
                <button onClick={() => setSelectedReport(null)} className="rounded-xl bg-slate-700 px-4 py-2 hover:bg-slate-600">✕ Cerrar</button>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-slate-400">Reporte N.º</span>
                    <p className="font-bold">#{selectedReport.id}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Estado</span>
                    <p className="font-semibold">{statusLabel(selectedReport.status)}</p>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">Tipo de alerta</span>
                  <p className="text-lg font-bold">{selectedReport.category}</p>
                </div>

                <div>
                  <span className="text-slate-400">Descripción</span>
                  <p>{selectedReport.description}</p>
                </div>

                <div>
                  <span className="text-slate-400">Fecha y hora</span>
                  <p>{formatDate(selectedReport.createdAt)}</p>
                </div>

                {selectedReport.imageUrl && (
                  <div>
                    <span className="text-slate-400">📷 Foto de la alerta</span>
                    <img src={selectedReport.imageUrl} alt="Foto de la alerta" className="mt-2 max-h-96 w-full rounded-xl border border-slate-700 object-contain" />
                  </div>
                )}

                {selectedReport.videoUrl && (
                  <div>
                    <span className="text-slate-400">🎥 Video de la alerta</span>
                    <video src={selectedReport.videoUrl} controls className="mt-2 max-h-96 w-full rounded-xl border border-slate-700">Tu navegador no puede reproducir este video.</video>
                  </div>
                )}

                {selectedReport.audioUrl && (
                  <div>
                    <span className="text-slate-400">🎤 Audio de la alerta</span>
                    <audio src={selectedReport.audioUrl} controls className="mt-2 w-full">Tu navegador no puede reproducir este audio.</audio>
                  </div>
                )}

                {selectedReport.latitude !== null && selectedReport.longitude !== null && (
                  <div>
                    <span className="text-slate-400">📍 Ubicación</span>
                    <p className="mb-3">{selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}</p>

                    <div className="overflow-hidden rounded-2xl border border-slate-700">
                      <iframe
                        title="Ubicación de la alerta"
                        width="100%"
                        height="260"
                        loading="lazy"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedReport.longitude - 0.005}%2C${selectedReport.latitude - 0.003}%2C${selectedReport.longitude + 0.005}%2C${selectedReport.latitude + 0.003}&layer=mapnik&marker=${selectedReport.latitude}%2C${selectedReport.longitude}`}
                      />
                    </div>

                    <a
                      href={`https://www.openstreetmap.org/?mlat=${selectedReport.latitude}&mlon=${selectedReport.longitude}#map=18/${selectedReport.latitude}/${selectedReport.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                    >
                      🗺️ Ver mapa grande
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
