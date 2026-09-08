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
imageUrl: string | null;
videoUrl: string | null;
audioUrl: string | null;
  createdAt: string;
};

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [showAllReports, setShowAllReports] = useState(false);
  const [showCriticalPending, setShowCriticalPending] = useState(false);
  const [mapPeriod, setMapPeriod] = useState("24h");
  const [ultimaAlertaId, setUltimaAlertaId] = useState<number | null>(null);
const [alertaNueva, setAlertaNueva] = useState<Report | null>(null);
  const [alertaCriticaRevisada, setAlertaCriticaRevisada] = useState(false);
  const [alertasCriticasPendientes, setAlertasCriticasPendientes] = useState<number[]>([]);
  async function loadReports() {
    try {  
      const response = await fetch("/api/reports");
      const data = await response.json();

      if (data.success) {
  const nuevosReportes: Report[] = data.reports;

  if (nuevosReportes.length > 0) {
    const masReciente = [...nuevosReportes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    )[0];

 if (ultimaAlertaId !== null && masReciente.id !== ultimaAlertaId) {
  setAlertaNueva(masReciente);

  if (
    masReciente.category === "Emergencia" ||
    masReciente.category === "Delito / Robo"
  ) {
    setAlertaCriticaRevisada(false);
  }
   setAlertasCriticasPendientes((prev) =>
  prev.includes(masReciente.id)
    ? prev
    : [...prev, masReciente.id]
);
}

    setUltimaAlertaId(masReciente.id);
  }

  setReports(nuevosReportes);
} 
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status,
        }),
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

    const interval = setInterval(() => {
      loadReports();
    }, 3000);

    return () => clearInterval(interval);
 }, [ultimaAlertaId]); 
  useEffect(() => {
  if (!alertaNueva) return;

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();

  const sonar = (
    frecuencia: number,
    inicio: number,
    duracion: number
  ) => {
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

  const critica =
    alertaNueva.category === "Emergencia" ||
    alertaNueva.category === "Delito / Robo";

  if (critica) {
    sonar(880, 0, 0.25);
    sonar(880, 0.35, 0.25);
    sonar(1100, 0.7, 0.4);
  } else {
    sonar(700, 0, 0.25);
    sonar(900, 0.3, 0.3);
  }

  return () => {
    audioContext.close();
  };
}, [alertaNueva]); 
async function handleLogout() {
  await fetch("/api/admin/logout", {
    method: "POST",
  });

  window.location.href = "/admin/login";
}
  
  const total = reports.length;

  const pending = reports.filter(
    (report) => report.status === "pendiente"
  ).length;

  const inAnalysis = reports.filter(
    (report) => report.status === "en_analisis"
  ).length;

  const resolved = reports.filter(
    (report) => report.status === "resuelta"
  ).length;
const criticalAlerts = reports.filter(
  (report) =>
    report.status !== "resuelta" &&
    report.status !== "descartada" &&
    (report.category === "Emergencia" ||
      report.category === "Delito / Robo")
).length;

const highAlerts = reports.filter(
  (report) =>
    report.status !== "resuelta" &&
    report.status !== "descartada" &&
    (report.category === "Accidente" ||
      report.category === "Incendio")
).length;

const normalAlerts = reports.filter(
  (report) =>
    report.status !== "resuelta" &&
    report.status !== "descartada" &&
    (report.category === "Vehículo sospechoso" ||
      report.category === "Persona sospechosa")
).length;
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
const mapReports = reports.filter((report) => {
  if (report.latitude === null || report.longitude === null) {
    return false;
  }

  if (mapPeriod === "todas") {
    return true;
  }

  const ahora = Date.now();
  const fechaReporte = new Date(report.createdAt).getTime();
  const diferenciaHoras = (ahora - fechaReporte) / (1000 * 60 * 60);

  if (mapPeriod === "12h") return diferenciaHoras <= 12;
  if (mapPeriod === "24h") return diferenciaHoras <= 24;
  if (mapPeriod === "mes") return diferenciaHoras <= 24 * 30;
  if (mapPeriod === "anio") return diferenciaHoras <= 24 * 365;

  return true;
}); 
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {alertaNueva && ( 
  <div
  className={`fixed inset-x-4 top-4 z-[99999] mx-auto max-w-xl rounded-2xl border p-4 shadow-2xl ${
    alertaNueva.category === "Emergencia" ||
    alertaNueva.category === "Delito / Robo"
      ? "border-red-500 bg-red-950 animate-pulse"
      : alertaNueva.category === "Accidente" ||
        alertaNueva.category === "Incendio"
      ? "border-orange-500 bg-orange-950"
      : "border-yellow-500 bg-yellow-950"
  }`}
> 
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-red-300">
          🚨 Nueva alerta
          <span
  className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-white ${
    alertaNueva.category === "Emergencia" ||
    alertaNueva.category === "Delito / Robo"
      ? "bg-red-600"
      : alertaNueva.category === "Accidente" ||
        alertaNueva.category === "Incendio"
      ? "bg-orange-500"
      : "bg-yellow-500 text-black"
  }`}
> 
  {alertaNueva.category === "Emergencia" ||
  alertaNueva.category === "Delito / Robo"
    ? "🔴 PRIORIDAD CRÍTICA"
    : alertaNueva.category === "Accidente" ||
      alertaNueva.category === "Incendio"
    ? "🟠 PRIORIDAD ALTA"
    : "🟡 PRIORIDAD NORMAL"}
</span> 
        </p>

        <h2 className="mt-1 text-xl font-bold text-white">
          {alertaNueva.category}
        </h2>

        <p className="mt-1 text-sm text-red-100">
          {alertaNueva.description}
        </p>
      </div>

      <button
        onClick={() => setAlertaNueva(null)}
        className="rounded-lg bg-red-900 px-3 py-2 text-sm font-bold text-white"
      >
        ✕
      </button>
    </div>

    <button
     onClick={() => {
  setSelectedReport(alertaNueva);

  if (
    alertaNueva.category === "Emergencia" ||
    alertaNueva.category === "Delito / Robo"
  ) {
    setAlertasCriticasPendientes((prev) =>
  prev.filter((id) => id !== alertaNueva.id)
);

setAlertaCriticaRevisada(
  alertasCriticasPendientes.filter((id) => id !== alertaNueva.id).length === 0
);
  }

  setAlertaNueva(null);
}} 
      className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-500"
    >
      👁 Ver alerta
    </button>
  </div>
)} 
      <div className="mx-auto max-w-7xl px-5 py-8">
<div className="mb-6 grid gap-3 md:grid-cols-3">
  <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-red-300">
      🔴 Críticas
    </p>
    <p className="mt-1 text-3xl font-bold text-white">
      {criticalAlerts}
    </p>
    {alertasCriticasPendientes.length > 0 && (
  <p className="mt-2 text-sm font-bold text-red-300">
    {alertasCriticasPendientes.length} sin revisar
  </p>
)} 
    {alertasCriticasPendientes.length > 0 && (
  <button
   onClick={() => {
  setShowCriticalPending(true);
  setShowAllReports(true);
}} 
    className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
  >
    Ver pendientes
  </button>
)} 
    {!alertaCriticaRevisada && criticalAlerts > 0 && (
  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white animate-pulse">
    🔴 SIN REVISAR
  </div>
)}
  </div>

  <div className="rounded-2xl border border-orange-500/30 bg-orange-950/40 p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-orange-300">
      🟠 Altas
    </p>
    <p className="mt-1 text-3xl font-bold text-white">
      {highAlerts}
    </p>
  </div>

  <div className="rounded-2xl border border-yellow-500/30 bg-yellow-950/40 p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">
      🟡 Normales
    </p>
    <p className="mt-1 text-3xl font-bold text-white">
      {normalAlerts}
    </p>
  </div>
</div> 
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
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

          <button
            onClick={loadReports}
            className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
          >
            🔄 Actualizar
          </button>
          <button
  onClick={handleLogout}
  className="ml-3 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold hover:bg-red-700"
> 
  🚪 Cerrar sesión
</button>
        </header>
            <section className="mb-6 rounded-3xl border border-red-500/20 bg-slate-900 p-4">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-lg font-bold">🚨 Atención prioritaria</h2>
    <span className="text-xs text-slate-400">Últimas 3</span>
  </div>

  <div className="space-y-2">
    {[...reports]
  .sort((a, b) => {
    const prioridad = {
      pendiente: 1,
      en_analisis: 2,
      verificada: 3,
      resuelta: 4,
      descartada: 5,
    };
const prioridadCategoria = {
  Emergencia: 1,
  "Delito / Robo": 2,
  Accidente: 3,
  Incendio: 4,
  "Vehículo sospechoso": 5,
  "Persona sospechosa": 6,
}; 
    const pa = prioridad[a.status as keyof typeof prioridad] ?? 99;
    const pb = prioridad[b.status as keyof typeof prioridad] ?? 99;

    if (pa !== pb) return pa - pb;
const ca =
  prioridadCategoria[a.category as keyof typeof prioridadCategoria] ?? 99;

const cb =
  prioridadCategoria[b.category as keyof typeof prioridadCategoria] ?? 99;

if (ca !== cb) return ca - cb; 
    return (  
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
    );
  }) 
  .slice(0, 3)
  .map((report) => (
      <button
        key={`destacada-${report.id}`}
        onClick={() => setSelectedReport(report)}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3 text-left hover:bg-slate-800"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">#{report.id}</span>
            <span className="font-semibold">{report.category}</span>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            {formatDate(report.createdAt)}
          </p>
        </div>

        <div className="text-right">
          <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs">
            {statusLabel(report.status)}
          </span>
          <p className="mt-2 text-xs text-slate-500">Ver detalle ›</p>
        </div>
      </button>
    ))}
  </div> 
</section>
        <section className="mb-8">
  <h2 className="mb-4 text-xl font-bold">
    🗺️ Mapa de alertas
  </h2>
         <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
  <div>
    <p className="text-sm font-semibold text-white">
      🕒 Período del mapa
    </p>
    <p className="text-xs text-slate-400">
      Seleccioná qué alertas mostrar
    </p>
  </div>

  <select
    value={mapPeriod}
    onChange={(e) => setMapPeriod(e.target.value)}
    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
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

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Total
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

          <div className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-6">
            <p className="text-sm text-blue-300">
              En análisis
            </p>

            <p className="mt-2 text-4xl font-bold text-blue-400">
              {inAnalysis}
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

        <section className="mb-4">
          <h2 className="text-xl font-bold">
            Alertas recientes
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Actualización automática cada 3 segundos.
          </p>
        </section>

        {loading && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Cargando alertas...
          </div>
        )}
<div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
  <div className="rounded-2xl border border-orange-500/20 bg-slate-900 p-4">
    <p className="text-xs text-slate-400">Pendientes</p>
    <p className="mt-1 text-2xl font-bold text-orange-300">
      {reports.filter((r) => r.status === "pendiente").length}
    </p>
  </div>

  <div className="rounded-2xl border border-blue-500/20 bg-slate-900 p-4">
    <p className="text-xs text-slate-400">En análisis</p>
    <p className="mt-1 text-2xl font-bold text-blue-300">
      {reports.filter((r) => r.status === "en_analisis").length}
    </p>
  </div>

  <div className="rounded-2xl border border-violet-500/20 bg-slate-900 p-4">
    <p className="text-xs text-slate-400">Verificadas</p>
    <p className="mt-1 text-2xl font-bold text-violet-300">
      {reports.filter((r) => r.status === "verificada").length}
    </p>
  </div>

  <div className="rounded-2xl border border-emerald-500/20 bg-slate-900 p-4">
    <p className="text-xs text-slate-400">Resueltas</p>
    <p className="mt-1 text-2xl font-bold text-emerald-300">
      {reports.filter((r) => r.status === "resuelta").length}
    </p>
  </div>
</div>  
   
        <button
  onClick={() => {
  setShowCriticalPending(false);
  setShowAllReports(!showAllReports);
}} 
  className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold hover:bg-slate-800"
> 
  📋 {showAllReports
    ? "Ocultar todas las alertas"
    : `Ver todas las alertas (${reports.length})`}
</button> 
       {showAllReports && (
  <section className="space-y-4">
        {reports
  .filter((report) =>
    showCriticalPending
      ? alertasCriticasPendientes.includes(report.id)
      : true
  )
  .map((report) => ( 
            <article
              key={report.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
            >
              <div className="flex flex-col gap-3">

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400">
                      #{report.id}
                    </span>

                    <span className="rounded-lg bg-orange-500/20 px-2 py-1 text-xs font-semibold text-orange-300">
                      {statusLabel(report.status)}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-bold">
                    {report.category}
                  </h3>

                 <p className="mt-2 truncate text-sm text-slate-300">
                   {report.description}
                       </p>

                  <p className="mt-3 text-xs text-slate-500">
                    {formatDate(report.createdAt)}
                  </p>
                </div>
                     <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                      {report.imageUrl && <span>📷 Foto</span>}
                      {report.videoUrl && <span>🎥 Video</span>}
                      {report.audioUrl && <span>🎤 Audio</span>}
                      {report.latitude !== null && report.longitude !== null && (
                     <span>📍 Ubicación</span>
                      )}
                 </div>
                <button
  onClick={() =>
    setOpenActionsId(openActionsId === report.id ? null : report.id)
  }
  className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
>
  ⚙️ {openActionsId === report.id ? "Ocultar acciones" : "Acciones"}
</button> 
                {openActionsId === report.id && (
  <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() =>
                      changeStatus(report.id, "en_analisis")
                    }
                    disabled={updatingId === report.id}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >   
                    🔎 En análisis
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(report.id, "verificada")
                    }
                    disabled={updatingId === report.id}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                  >
                    ✅ Verificada
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(report.id, "resuelta")
                    }
                    disabled={updatingId === report.id}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✔ Resuelta
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(report.id, "descartada")
                    }
                    disabled={updatingId === report.id}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
                  >
                    ✖ Descartar
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(report.id, "pendiente")
                    }
                    disabled={updatingId === report.id}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    ↩ Pendiente
                  </button>
                  <button
                   onClick={() => setSelectedReport(report)}
                   className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold hover:bg-slate-500"
                   > 
                  👁 Ver detalle
                     </button>
                </div>
              )}

              </div>
            </article>
          ))}
        </section>
       )}
{selectedReport && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
    <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">

      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          🚨 Detalle de alerta
        </h2>

        <button
          onClick={() => setSelectedReport(null)}
          className="rounded-xl bg-slate-700 px-4 py-2 hover:bg-slate-600"
        >
          ✕ Cerrar
        </button>
      </div>

      <div className="space-y-4">

        <div>
          <span className="text-slate-400">Reporte N.º</span>
          <p className="font-bold">#{selectedReport.id}</p>
        </div>

        <div>
          <span className="text-slate-400">Tipo de alerta</span>
          <p className="text-lg font-bold">
            {selectedReport.category}
          </p>
        </div>

        <div>
          <span className="text-slate-400">Descripción</span>
          <p>{selectedReport.description}</p>
        </div>

        <div>
          <span className="text-slate-400">Estado</span>
          <p className="font-semibold">
            {statusLabel(selectedReport.status)}
          </p>
        </div>

        <div>
          <span className="text-slate-400">Fecha y hora</span>
          <p>{formatDate(selectedReport.createdAt)}</p>
        </div>
        {selectedReport.imageUrl && (
  <div>
    <span className="text-slate-400">📷 Foto de la alerta</span>

    <img
      src={selectedReport.imageUrl}
      alt="Foto de la alerta"
      className="mt-2 w-full max-h-96 object-contain rounded-xl border border-slate-700"
    />
  </div>
)}
{selectedReport.videoUrl && (
  <div>
    <span className="text-slate-400">🎥 Video de la alerta</span>

    <video
      src={selectedReport.videoUrl}
      controls
      className="mt-2 w-full max-h-96 rounded-xl border border-slate-700"
    >
      Tu navegador no puede reproducir este video.
    </video>
  </div>
)}
{selectedReport.audioUrl && (
  <div>
    <span className="text-slate-400">🎤 Audio de la alerta</span>

    <audio
      src={selectedReport.audioUrl}
      controls
      className="mt-2 w-full"
    >
      Tu navegador no puede reproducir este audio.
    </audio>
  </div>
)}
     {selectedReport.latitude !== null &&
  selectedReport.longitude !== null && (
    <div>
      <span className="text-slate-400">📍 Ubicación</span>

      <p className="mb-3">
        {selectedReport.latitude.toFixed(5)},{" "}
        {selectedReport.longitude.toFixed(5)}
      </p>

      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <iframe
          title="Ubicación de la alerta"
          width="100%"
          height="260"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${
            selectedReport.longitude - 0.005
          }%2C${
            selectedReport.latitude - 0.003
          }%2C${
            selectedReport.longitude + 0.005
          }%2C${
            selectedReport.latitude + 0.003
          }&layer=mapnik&marker=${
            selectedReport.latitude
          }%2C${
            selectedReport.longitude
          }`}
        />
      </div>
      <a
  href={`https://www.openstreetmap.org/?mlat=${selectedReport.latitude}&mlon=${selectedReport.longitude}#map=18/${selectedReport.latitude}/${selectedReport.longitude}`}
  target="_blank"
  rel="noopener noreferrer"
  className="mt-3 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
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
