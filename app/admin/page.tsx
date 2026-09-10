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

  aiAnalyzed?: boolean;
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiPossibleSpam?: boolean | null;
  aiReason?: string | null;
  aiAnalyzedAt?: string | null;
};

type AiAnalysisResult = {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  confidence: number;
  possibleSpam: boolean;
  reason: string;
  relatedReports: boolean;
  relatedReportIds: number[];
  relationSummary: string;
};

type RelatedSearchResult = {
  radiusKm: number;
  timeMinutes: number;
  candidatesFound: number;
  candidates: Array<{
    id: number;
    category: string;
    distanceMeters: number;
    createdAt: string;
  }>;
};

type VehicleWatch = {
  id: number;
  sourceReportId: number;
  imageUrl: string;
  plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  distinctive: string | null;
  visualSummary: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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

const CATEGORIES = [
  "todas",
  "Emergencia",
  "Delito / Robo",
  "Accidente",
  "Incendio",
  "Vehículo sospechoso",
  "Persona sospechosa",
];

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

function formatDate(date: string) {
  return new Date(date).toLocaleString("es-AR");
}

function relativeTime(date: string) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
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
      return "border-orange-500/30 bg-orange-500/15 text-orange-300";
    case "en_analisis":
      return "border-blue-500/30 bg-blue-500/15 text-blue-300";
    case "verificada":
      return "border-violet-500/30 bg-violet-500/15 text-violet-300";
    case "resuelta":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
    case "descartada":
      return "border-slate-600 bg-slate-800 text-slate-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-300";
  }
}

function categoryEmoji(category: string) {
  const values: Record<string, string> = {
    "Delito / Robo": "🚨",
    "Persona sospechosa": "👤",
    "Vehículo sospechoso": "🚗",
    Accidente: "⚠️",
    Incendio: "🔥",
    Emergencia: "🆘",
  };
  return values[category] || "📍";
}

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
const [relatedSearch, setRelatedSearch] = useState<RelatedSearchResult | null>(null);
const [aiError, setAiError] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [mapPeriod, setMapPeriod] = useState("24h");
  const [alertaNueva, setAlertaNueva] = useState<Report | null>(null);
  const [alertasCriticasPendientes, setAlertasCriticasPendientes] = useState<number[]>([]);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [listLimit, setListLimit] = useState(12);
  const [vehicleWatches, setVehicleWatches] = useState<VehicleWatch[]>([]);
  const [vehicleWatchLoading, setVehicleWatchLoading] = useState(false);
  const [vehicleWatchActionId, setVehicleWatchActionId] = useState<number | null>(null);

  const ultimaAlertaIdRef = useRef<number | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  async function loadReports() {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const data = await response.json();

      if (!data.success || !Array.isArray(data.reports)) return;

      const nuevosReportes: Report[] = data.reports;
      const masReciente = nuevosReportes[0];

      if (masReciente) {
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
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadVehicleWatches() {
    try {
      setVehicleWatchLoading(true);

      const response = await fetch("/api/vehicle-watch", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success || !Array.isArray(data.vehicles)) {
        return;
      }

      setVehicleWatches(data.vehicles);
    } catch (error) {
      console.error("Error cargando vehículos en seguimiento:", error);
    } finally {
      setVehicleWatchLoading(false);
    }
  }

  async function addVehicleToWatch(reportId: number) {
    try {
      setVehicleWatchActionId(reportId);

      const response = await fetch("/api/vehicle-watch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "No se pudo poner el vehículo en seguimiento.");
        return;
      }

      await loadVehicleWatches();

      alert(
        data.alreadyWatching
          ? "Este vehículo ya estaba en seguimiento."
          : "Vehículo agregado al seguimiento."
      );
    } catch (error) {
      console.error(error);
      alert("Error al agregar el vehículo al seguimiento.");
    } finally {
      setVehicleWatchActionId(null);
    }
  }

  async function finishVehicleWatch(id: number) {
    const confirmed = window.confirm(
      "¿Querés finalizar el seguimiento de este vehículo?"
    );

    if (!confirmed) return;

    try {
      setVehicleWatchActionId(id);

      const response = await fetch("/api/vehicle-watch", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          active: false,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "No se pudo finalizar el seguimiento.");
        return;
      }

      await loadVehicleWatches();
    } catch (error) {
      console.error(error);
      alert("Error al finalizar el seguimiento.");
    } finally {
      setVehicleWatchActionId(null);
    }
  }

  function openVehicleSourceReport(sourceReportId: number) {
    const report = reports.find((item) => item.id === sourceReportId);

    if (!report) {
      alert("El reporte original no está disponible en la lista actual.");
      return;
    }

    openReport(report);
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

      if (!data.success) {
        alert(data.message || "No se pudo actualizar el estado.");
        return;
      }

      if (selectedReport?.id === id) {
        setSelectedReport((prev) => (prev ? { ...prev, status } : prev));
      }

      await loadReports();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    void loadReports();
    void loadVehicleWatches();

    const interval = window.setInterval(() => void loadReports(), 3000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!alertaNueva) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();

    const sonar = (frequency: number, start: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.18, audioContext.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + start + duration
      );
      oscillator.start(audioContext.currentTime + start);
      oscillator.stop(audioContext.currentTime + start + duration);
    };

    if (esCritica(alertaNueva.category)) {
      sonar(880, 0, 0.25);
      sonar(880, 0.35, 0.25);
      sonar(1100, 0.7, 0.4);
    } else if (esAlta(alertaNueva.category)) {
      sonar(760, 0, 0.25);
      sonar(920, 0.3, 0.3);
    }

    return () => {
      void audioContext.close();
    };
  }, [alertaNueva]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function marcarCriticaComoRevisada(report: Report) {
    if (!esCritica(report.category)) return;
    setAlertasCriticasPendientes((prev) => prev.filter((id) => id !== report.id));
  }

 function openReport(report: Report) {
  marcarCriticaComoRevisada(report);
  setSelectedReport(report);
  setAiResult(null);
  setRelatedSearch(null);
  setAiError(null);
}
  async function analyzeReportWithAi(reportId: number) {
  try {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setRelatedSearch(null);

    const response = await fetch("/api/ai/analyze-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setAiError(
        data.error || "No se pudo analizar el reporte con IA."
      );
      return;
    }

    setAiResult(data.analysis ?? null);
    setRelatedSearch(data.relatedSearch ?? null);

    if (data.report) {
      setSelectedReport((prev) =>
        prev
          ? {
              ...prev,
              ...data.report,
            }
          : prev
      );

      setReports((prev) =>
        prev.map((report) =>
          report.id === data.report.id
            ? {
                ...report,
                ...data.report,
              }
            : report
        )
      );
    }
  } catch (error) {
    console.error(error);
    setAiError("Error de conexión al analizar el reporte.");
  } finally {
    setAiLoading(false);
  }
}
  function returnToMap() {
    setSelectedReport(null);
    window.setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  const totals = useMemo(() => {
    return {
      total: reports.length,
      pending: reports.filter((r) => r.status === "pendiente").length,
      inAnalysis: reports.filter((r) => r.status === "en_analisis").length,
      verified: reports.filter((r) => r.status === "verificada").length,
      resolved: reports.filter((r) => r.status === "resuelta").length,
      critical: reports.filter((r) => esActiva(r.status) && esCritica(r.category)).length,
      high: reports.filter((r) => esActiva(r.status) && esAlta(r.category)).length,
      normal: reports.filter((r) => esActiva(r.status) && esNormal(r.category)).length,
    };
  }, [reports]);

  const attentionReports = useMemo(
    () =>
      [...reports]
        .filter((r) => esActiva(r.status))
        .sort((a, b) => {
          const pa = PRIORIDAD_ESTADO[a.status] ?? 99;
          const pb = PRIORIDAD_ESTADO[b.status] ?? 99;
          if (pa !== pb) return pa - pb;

          const ca = PRIORIDAD_CATEGORIA[a.category] ?? 99;
          const cb = PRIORIDAD_CATEGORIA[b.category] ?? 99;
          if (ca !== cb) return ca - cb;

          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, 5),
    [reports]
  );

  const mapReports = useMemo(() => {
    const current = Date.now();

    return reports.filter((report) => {
      if (!esActiva(report.status)) return false;
      if (report.latitude === null || report.longitude === null) return false;
      if (mapPeriod === "todas") return true;

      const createdAt = new Date(report.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;

      const diffHours =
        (current - createdAt) / (1000 * 60 * 60);

      if (mapPeriod === "12h") return diffHours <= 12;
      if (mapPeriod === "24h") return diffHours <= 24;
      if (mapPeriod === "mes") return diffHours <= 24 * 30;
      if (mapPeriod === "anio") return diffHours <= 24 * 365;

      return true;
    });
  }, [reports, mapPeriod]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();

    return reports.filter((report) => {
      if (onlyUnreviewed && !alertasCriticasPendientes.includes(report.id)) return false;
      if (statusFilter !== "todos" && report.status !== statusFilter) return false;
      if (categoryFilter !== "todas" && report.category !== categoryFilter) return false;
      if (!term) return true;

      return (
        report.category.toLowerCase().includes(term) ||
        report.description.toLowerCase().includes(term) ||
        String(report.id).includes(term)
      );
    });
  }, [reports, search, statusFilter, categoryFilter, onlyUnreviewed, alertasCriticasPendientes]);

  const alertVisual =
    alertaNueva && esCritica(alertaNueva.category)
      ? { box: "border-red-500 bg-red-950", badge: "bg-red-600", label: "PRIORIDAD CRÍTICA" }
      : alertaNueva && esAlta(alertaNueva.category)
      ? { box: "border-orange-500 bg-orange-950", badge: "bg-orange-500", label: "PRIORIDAD ALTA" }
      : { box: "border-yellow-500 bg-yellow-950", badge: "bg-yellow-500 text-black", label: "PRIORIDAD NORMAL" };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {alertaNueva && (
        <div
          className={`fixed inset-x-4 top-4 z-[99999] mx-auto max-w-xl rounded-2xl border p-4 shadow-2xl ${alertVisual.box}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
                Nueva alerta recibida
              </p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${alertVisual.badge}`}>
                {alertVisual.label}
              </span>
              <h2 className="mt-2 text-xl font-bold">
                {categoryEmoji(alertaNueva.category)} {alertaNueva.category}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-white/75">
                {alertaNueva.description}
              </p>
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
              openReport(alertaNueva);
              setAlertaNueva(null);
            }}
            className="mt-3 w-full rounded-xl bg-white/10 px-4 py-3 font-bold hover:bg-white/20"
          >
            Abrir alerta
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1920px] px-3 py-3 sm:px-4 lg:px-5">
        <header className="mb-3 flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-3 shadow-xl shadow-black/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-2xl shadow-lg shadow-red-950/40">
              🚨
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">
                Centro de monitoreo
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                ALERTA OTAMENDI
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-right">
              <p className="text-lg font-black tabular-nums">
                {now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="text-[11px] text-slate-500">
                {now.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" })}
              </p>
            </div>
            <button
              onClick={() => void loadReports()}
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold hover:bg-slate-700"
              title="Sincronizar ahora"
            >
              ↻ Sincronizar
            </button>
            <button
              onClick={handleLogout}
              className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold hover:bg-red-500"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <section className="mb-4 grid gap-3 xl:grid-cols-[165px_minmax(0,1fr)_235px]">
          <aside className="min-w-0 space-y-2">
            <div className="rounded-3xl border border-red-500/30 bg-red-950/35 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-red-300">Críticas</p>
                  <p className="mt-1 text-4xl font-black">{totals.critical}</p>
                </div>
                <span className="text-2xl">🔴</span>
              </div>
              <p className="mt-2 text-xs text-red-200/70">Emergencias y delito/robo activos</p>
              {alertasCriticasPendientes.length > 0 && (
                <button
                  onClick={() => {
                    setOnlyUnreviewed(true);
                    window.setTimeout(() => document.getElementById("alert-list")?.scrollIntoView({ behavior: "smooth" }), 30);
                  }}
                  className="mt-3 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-bold hover:bg-red-500"
                >
                  {alertasCriticasPendientes.length} sin revisar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
              <div className="rounded-3xl border border-orange-500/25 bg-orange-950/25 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase text-orange-300">Altas</p>
                  <span>🟠</span>
                </div>
                <p className="mt-1 text-3xl font-black">{totals.high}</p>
                <p className="mt-1 text-[11px] text-slate-500">Accidentes e incendios</p>
              </div>
              <div className="rounded-3xl border border-yellow-500/25 bg-yellow-950/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase text-yellow-300">Normales</p>
                  <span>🟡</span>
                </div>
                <p className="mt-1 text-3xl font-black">{totals.normal}</p>
                <p className="mt-1 text-[11px] text-slate-500">Personas y vehículos</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-3 text-[11px] text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <span>Sistema</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> EN LÍNEA
                </span>
              </div>
              <div className="mt-3 border-t border-slate-800 pt-3">
                Última sincronización: {lastUpdated ? lastUpdated.toLocaleTimeString("es-AR") : "—"}
              </div>
              <div className="mt-1">Actualización automática: 3 s</div>
            </div>
          </aside>

          <div ref={mapSectionRef} className="min-w-0 scroll-mt-4">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Vista principal</p>
                <h2 className="text-xl font-black">🗺️ Mapa operativo</h2>
              </div>
              <select
                value={mapPeriod}
                onChange={(e) => setMapPeriod(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold outline-none"
              >
                <option value="12h">Últimas 12 horas</option>
                <option value="24h">Últimas 24 horas</option>
                <option value="mes">Último mes</option>
                <option value="anio">Último año</option>
                <option value="todas">Todas</option>
              </select>
            </div>
            <MapaAlertas
              reports={mapReports}
              mode="admin"
              onSelectReport={(report) => openReport(report as Report)}
              heightClassName="h-[calc(100vh-285px)] min-h-[360px] max-h-[500px]"
            />
          </div>

          <aside className="min-w-0 space-y-3">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-400">Atención</p>
                  <h2 className="text-sm font-black leading-4">Prioridad inmediata</h2>
                </div>
                <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] text-slate-400">Top 5</span>
              </div>

              <div className="space-y-2">
                {attentionReports.length === 0 && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-300">
                    ✓ No hay alertas activas.
                  </div>
                )}

                {attentionReports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => openReport(report)}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-3 text-left transition hover:border-slate-600 hover:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold leading-4 break-words">
                          {categoryEmoji(report.category)} {report.category}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          #{report.id} · {relativeTime(report.createdAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(report.status)}`}>
                        {statusLabel(report.status)}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-400">
                      {report.description}
                    </p>

                    {alertasCriticasPendientes.includes(report.id) && (
                      <span className="mt-2 inline-flex rounded-full bg-red-600 px-2 py-1 text-[10px] font-black animate-pulse">
                        SIN REVISAR
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/25 bg-cyan-950/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                    🚗 Vehículos
                  </p>
                  <h2 className="text-sm font-black leading-4">
                    En seguimiento
                  </h2>
                </div>

                <span className="rounded-full border border-cyan-500/20 bg-slate-950 px-2 py-1 text-[11px] font-bold text-cyan-300">
                  {vehicleWatches.length}
                </span>
              </div>

              {vehicleWatchLoading && vehicleWatches.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
                  Cargando...
                </div>
              ) : vehicleWatches.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
                  <div className="text-2xl">🚙</div>
                  <p className="mt-2 text-xs font-bold text-slate-300">
                    Sin vehículos en seguimiento
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    Abrí un reporte con foto y agregalo desde el detalle.
                  </p>
                </div>
              ) : (
                <div className="max-h-[290px] space-y-2 overflow-y-auto pr-1">
                  {vehicleWatches.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="rounded-2xl border border-cyan-500/20 bg-slate-950 p-2.5"
                    >
                      <div className="flex gap-2.5">
                        <img
                          src={vehicle.imageUrl}
                          alt={`Vehículo del reporte ${vehicle.sourceReportId}`}
                          className="h-16 w-20 shrink-0 rounded-xl border border-slate-700 bg-black object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-black text-white">
                                Reporte #{vehicle.sourceReportId}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {relativeTime(vehicle.createdAt)}
                              </p>
                            </div>

                            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-black text-emerald-300">
                              ACTIVO
                            </span>
                          </div>

                          <div className="mt-2 space-y-1 text-[10px] leading-4">
                            <p>
                              <span className="text-slate-500">Patente:</span>{" "}
                              <span className="font-bold text-white">
                                {vehicle.plate || "No identificada"}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-500">Tipo:</span>{" "}
                              <span className="text-cyan-200">
                                {vehicle.vehicleType || "No identificado"}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-500">Marca:</span>{" "}
                              <span className="text-cyan-200">
                                {vehicle.make || "No identificada"}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-500">Modelo:</span>{" "}
                              <span className="text-cyan-200">
                                {vehicle.model || "No identificado"}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-500">Color:</span>{" "}
                              <span className="text-cyan-200">
                                {vehicle.color || "No identificado"}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {(vehicle.distinctive || vehicle.visualSummary) && (
                        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-[10px] leading-4">
                          {vehicle.distinctive && (
                            <p className="text-slate-300">
                              <span className="font-bold text-slate-500">Rasgos:</span>{" "}
                              {vehicle.distinctive}
                            </p>
                          )}
                          {vehicle.visualSummary && (
                            <p className={vehicle.distinctive ? "mt-1 text-slate-400" : "text-slate-400"}>
                              <span className="font-bold text-slate-500">Resumen IA:</span>{" "}
                              {vehicle.visualSummary}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openVehicleSourceReport(vehicle.sourceReportId)}
                          className="rounded-lg border border-slate-700 px-2 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
                        >
                          Ver reporte
                        </button>

                        <button
                          onClick={() => void finishVehicleWatch(vehicle.id)}
                          disabled={vehicleWatchActionId === vehicle.id}
                          className="rounded-lg border border-red-500/30 bg-red-950/30 px-2 py-2 text-[10px] font-bold text-red-300 hover:bg-red-950/50 disabled:opacity-50"
                        >
                          Finalizar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Total", totals.total, "text-white"],
            ["Pendientes", totals.pending, "text-orange-300"],
            ["En análisis", totals.inAnalysis, "text-blue-300"],
            ["Verificadas", totals.verified, "text-violet-300"],
            ["Resueltas", totals.resolved, "text-emerald-300"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section id="alert-list" className="scroll-mt-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Gestión</p>
              <h2 className="text-xl font-black">📋 Alertas y seguimiento</h2>
              <p className="mt-1 text-sm text-slate-400">Buscá, filtrá y actualizá el estado de cada reporte.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setListLimit(12);
                }}
                placeholder="Buscar #, tipo o texto"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="todos">Todos los estados</option>
                <option value="pendiente">Pendientes</option>
                <option value="en_analisis">En análisis</option>
                <option value="verificada">Verificadas</option>
                <option value="resuelta">Resueltas</option>
                <option value="descartada">Descartadas</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category === "todas" ? "Todas las categorías" : category}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setOnlyUnreviewed((value) => !value)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  onlyUnreviewed
                    ? "border-red-500 bg-red-600 text-white"
                    : "border-slate-700 bg-slate-950 text-slate-300"
                }`}
              >
                {onlyUnreviewed ? "✓ Sin revisar" : "Solo sin revisar"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl bg-slate-950 p-8 text-center text-slate-400">Cargando alertas…</div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredReports.slice(0, listLimit).map((report) => (
                <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400">#{report.id}</span>
                        <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${statusClass(report.status)}`}>
                          {statusLabel(report.status)}
                        </span>
                        {alertasCriticasPendientes.includes(report.id) && (
                          <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-black animate-pulse">SIN REVISAR</span>
                        )}
                      </div>
                      <h3 className="mt-2 text-lg font-bold">{categoryEmoji(report.category)} {report.category}</h3>
                      <p className="mt-1 max-w-4xl text-sm text-slate-300">{report.description}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{formatDate(report.createdAt)}</span>
                        {report.imageUrl && <span>📷 Foto</span>}
                        {report.videoUrl && <span>🎥 Video</span>}
                        {report.audioUrl && <span>🎤 Audio</span>}
                        {report.latitude !== null && report.longitude !== null && <span>📍 Ubicación</span>}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => openReport(report)}
                        className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
                      >
                        Ver detalle
                      </button>
                      <button
                        onClick={() => setOpenActionsId(openActionsId === report.id ? null : report.id)}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
                      >
                        {openActionsId === report.id ? "Cerrar acciones" : "Acciones"}
                      </button>
                    </div>
                  </div>

                  {openActionsId === report.id && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                      <button onClick={() => void changeStatus(report.id, "en_analisis")} disabled={updatingId === report.id} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">🔎 En análisis</button>
                      <button onClick={() => void changeStatus(report.id, "verificada")} disabled={updatingId === report.id} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">✓ Verificada</button>
                      <button onClick={() => void changeStatus(report.id, "resuelta")} disabled={updatingId === report.id} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">✔ Resuelta</button>
                      <button onClick={() => void changeStatus(report.id, "descartada")} disabled={updatingId === report.id} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">✕ Descartar</button>
                      <button onClick={() => void changeStatus(report.id, "pendiente")} disabled={updatingId === report.id} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">↩ Pendiente</button>
                    </div>
                  )}
                </article>
              ))}

              {filteredReports.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-slate-400">
                  No hay alertas que coincidan con los filtros.
                </div>
              )}

              {filteredReports.length > listLimit && (
                <button
                  onClick={() => setListLimit((value) => value + 12)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-3 text-sm font-semibold hover:bg-slate-800"
                >
                  Mostrar más ({filteredReports.length - listLimit} restantes)
                </button>
              )}
            </div>
          )}
        </section>

        {selectedReport && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Reporte #{selectedReport.id}</p>
                  <h2 className="mt-1 text-2xl font-black">{categoryEmoji(selectedReport.category)} {selectedReport.category}</h2>
                  <p className="mt-1 text-sm text-slate-400">{formatDate(selectedReport.createdAt)}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(selectedReport.status)}`}>
                  {statusLabel(selectedReport.status)}
                </span>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Descripción</p>
                  <p className="mt-2 leading-6 text-slate-200">{selectedReport.description}</p>
                </div>

                {(selectedReport.imageUrl || selectedReport.videoUrl || selectedReport.audioUrl) && (
                  <div className="space-y-4">
                    <h3 className="font-bold">Evidencia recibida</h3>
                    {selectedReport.imageUrl && (
                      <img src={selectedReport.imageUrl} alt="Foto de la alerta" className="max-h-[460px] w-full rounded-2xl border border-slate-700 bg-black object-contain" />
                    )}
                    {selectedReport.videoUrl && (
                      <video src={selectedReport.videoUrl} controls className="max-h-[460px] w-full rounded-2xl border border-slate-700 bg-black" />
                    )}
                    {selectedReport.audioUrl && (
                      <audio src={selectedReport.audioUrl} controls className="w-full" />
                    )}
                  </div>
                )}

                {selectedReport.imageUrl && (
                  <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                          🚗 Seguimiento de vehículo
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          Agrega esta foto a la lista de vehículos que el Centro de Monitoreo debe seguir.
                        </p>
                      </div>

                      {vehicleWatches.some(
                        (vehicle) => vehicle.sourceReportId === selectedReport.id
                      ) && (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-300">
                          EN SEGUIMIENTO
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => void addVehicleToWatch(selectedReport.id)}
                      disabled={
                        vehicleWatchActionId === selectedReport.id ||
                        vehicleWatches.some(
                          (vehicle) => vehicle.sourceReportId === selectedReport.id
                        )
                      }
                      className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {vehicleWatches.some(
                        (vehicle) => vehicle.sourceReportId === selectedReport.id
                      )
                        ? "✓ Vehículo en seguimiento"
                        : vehicleWatchActionId === selectedReport.id
                        ? "Agregando..."
                        : "🚗 Poner vehículo en seguimiento"}
                    </button>
                  </div>
                )}

                {selectedReport.latitude !== null && selectedReport.longitude !== null && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ubicación registrada</p>
                    <p className="mt-2 font-mono text-sm text-slate-300">
                      {selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">La ubicación se visualiza en el mapa operativo principal.</p>
                  </div>
                )}
<div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4">
  <div>
    <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
      🤖 Análisis IA
    </p>

    <p className="mt-1 text-xs text-slate-400">
      Analiza prioridad, categoría, posible spam y alertas relacionadas.
    </p>
  </div>

  {!aiResult && !aiLoading && (
    <button
      onClick={() => void analyzeReportWithAi(selectedReport.id)}
      className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white hover:bg-cyan-500"
    >
      🤖 Analizar reporte con IA
    </button>
  )}

  {aiLoading && (
    <div className="mt-4 rounded-xl border border-cyan-500/20 bg-slate-950 p-4 text-sm text-cyan-200">
      Analizando reporte y buscando posibles alertas relacionadas...
    </div>
  )}

  {aiError && (
    <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">
      {aiError}
    </div>
  )}

  {aiResult && (
    <div className="mt-4 space-y-4">

      <div className="grid gap-3 sm:grid-cols-2">

        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Prioridad IA
          </p>

          <p className="mt-1 font-bold text-cyan-200">
            {aiResult.priority === "critical"
              ? "🔴 CRÍTICA"
              : aiResult.priority === "high"
              ? "🟠 ALTA"
              : aiResult.priority === "medium"
              ? "🟡 MEDIA"
              : "🟢 BAJA"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Confianza
          </p>

          <p className="mt-1 font-bold text-cyan-200">
            {Math.round(aiResult.confidence * 100)}%
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Categoría sugerida
          </p>

          <p className="mt-1 font-bold text-slate-200">
            {aiResult.category}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Posible spam
          </p>

          <p className="mt-1 font-bold text-slate-200">
            {aiResult.possibleSpam ? "⚠️ Sí" : "✓ No"}
          </p>
        </div>

      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Resumen IA
        </p>

        <p className="mt-2 leading-6 text-slate-200">
          {aiResult.summary}
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Evaluación
        </p>

        <p className="mt-2 leading-6 text-slate-300">
          {aiResult.reason}
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 ${
          aiResult.relatedReports
            ? "border-violet-500/40 bg-violet-950/30"
            : "border-slate-700 bg-slate-950"
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-violet-300">
          🔗 Alertas posiblemente relacionadas
        </p>

        {aiResult.relatedReports ? (
          <>
            <p className="mt-3 text-lg font-black text-white">
              {aiResult.relatedReportIds
                .map((id) => `#${id}`)
                .join(" · ")}
            </p>

            <p className="mt-2 leading-6 text-slate-200">
              {aiResult.relationSummary}
            </p>

            {relatedSearch &&
              relatedSearch.candidates.length > 0 && (
                <div className="mt-4 space-y-2">

                  {relatedSearch.candidates
                    .filter((candidate) =>
                      aiResult.relatedReportIds.includes(candidate.id)
                    )
                    .map((candidate) => (
                      <div
                        key={candidate.id}
                        className="rounded-lg border border-violet-500/20 bg-black/20 px-3 py-2 text-sm text-slate-300"
                      >
                        <span className="font-bold text-white">
                          #{candidate.id}
                        </span>

                        {" · "}
                        {candidate.category}

                        {" · "}
                        {candidate.distanceMeters} m
                      </div>
                    ))}

                </div>
              )}
          </>
        ) : (
          <>
            <p className="mt-2 leading-6 text-slate-400">
              {aiResult.relationSummary}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              No se encontraron coincidencias suficientes para relacionar esta alerta con otra.
            </p>
          </>
        )}
      </div>

      <button
        onClick={() => void analyzeReportWithAi(selectedReport.id)}
        className="w-full rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-3 font-bold text-cyan-200 hover:bg-cyan-950/50"
      >
        ↻ Volver a analizar
      </button>

    </div>
  )} 
</div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Cambiar estado</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => void changeStatus(selectedReport.id, "en_analisis")} disabled={updatingId === selectedReport.id} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">🔎 En análisis</button>
                    <button onClick={() => void changeStatus(selectedReport.id, "verificada")} disabled={updatingId === selectedReport.id} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">✓ Verificada</button>
                    <button onClick={() => void changeStatus(selectedReport.id, "resuelta")} disabled={updatingId === selectedReport.id} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">✔ Resuelta</button>
                    <button onClick={() => void changeStatus(selectedReport.id, "descartada")} disabled={updatingId === selectedReport.id} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">✕ Descartar</button>
                  </div>
                </div>

                <button
                  onClick={returnToMap}
                  className="w-full rounded-2xl bg-red-600 py-4 font-black hover:bg-red-500"
                >
                  ← Volver al mapa principal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
