"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const MapaAlertas = dynamic(() => import("../../components/MapaAlertas"), { ssr: false });

type Priority = "critical" | "high" | "medium" | "low";
type Report = {
  id: number; category: string; description?: string; status: string;
  latitude: number | null; longitude: number | null; createdAt: string;
  aiPriority?: string | null; aiSummary?: string | null;
};
type Zone = { province: string; district: string; locality: string | null };
type FocusTarget = { latitude: number; longitude: number; radiusMeters?: number; key: number };
type AlertCard = { report: Report; priority: Priority; address: string; area: string };

function priorityOf(report: Report): Priority {
  if (["critical", "high", "medium", "low"].includes(report.aiPriority ?? "")) return report.aiPriority as Priority;
  if (report.category === "Emergencia" || report.category === "Delito / Robo") return "critical";
  if (report.category === "Accidente" || report.category === "Incendio") return "high";
  return "low";
}

function displayCategory(category: string) {
  return category === "Delito / Robo" ? "Hurto / Robo" : category;
}

function priorityLabel(priority: Priority) {
  return priority === "critical" ? "CRÍTICA" : priority === "high" ? "ALTA" : priority === "medium" ? "MEDIA" : "BAJA";
}

export default function MapaGrandePage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [alertCard, setAlertCard] = useState<AlertCard | null>(null);
  const initializedRef = useRef(false);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const alertTimerRef = useRef<number | null>(null);
  const focusKeyRef = useRef(0);

  const showOperationalAlert = useCallback(async (report: Report) => {
    if (report.latitude === null || report.longitude === null) return;
    const priority = priorityOf(report);
    if (priority !== "high" && priority !== "critical") return;

    focusKeyRef.current += 1;
    setFocusTarget({ latitude: report.latitude, longitude: report.longitude, radiusMeters: 1000, key: focusKeyRef.current });
    const institutional = role === "INSTITUTIONAL";
    setAlertCard({ report, priority, address: institutional ? "Sector aproximado" : "Obteniendo dirección…", area: institutional ? "La ubicación exacta está protegida." : "" });

    if (!institutional) {
      try {
        const response = await fetch(`/api/reverse-geocode?lat=${encodeURIComponent(report.latitude)}&lon=${encodeURIComponent(report.longitude)}`, { cache: "no-store" });
        const data = await response.json();
        if (data?.success) {
          setAlertCard((current) => current?.report.id === report.id ? { ...current, address: data.address || "Ubicación identificada", area: data.area || "" } : current);
        }
      } catch (error) {
        console.warn("No se pudo resolver la dirección de la alerta:", error);
      }
    }

    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => {
      focusKeyRef.current += 1;
      setAlertCard(null);
      // Cambiar la key al quitar el foco hace que el mapa vuelva a su vista operativa habitual.
      setFocusTarget(null);
    }, 30000);
  }, [role]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      const data = await response.json();
      if (!data.success || !Array.isArray(data.reports)) return;
      const incoming: Report[] = data.reports;
      setReports(incoming);

      if (!initializedRef.current) {
        seenIdsRef.current = new Set(incoming.map((r) => r.id));
        initializedRef.current = true;
        return;
      }

      const newImportant = incoming
        .filter((r) => !seenIdsRef.current.has(r.id) && (priorityOf(r) === "high" || priorityOf(r) === "critical"))
        .sort((a, b) => {
          const pa = priorityOf(a) === "critical" ? 2 : 1;
          const pb = priorityOf(b) === "critical" ? 2 : 1;
          return pb - pa || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })[0];

      incoming.forEach((r) => seenIdsRef.current.add(r.id));
      if (newImportant) void showOperationalAlert(newImportant);
    } catch (error) { console.error("Error actualizando mapa grande:", error); }
  }, [router, showOperationalAlert]);

  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("unauthorized"); return r.json(); })
      .then((d) => { if (!d.success) throw new Error("unauthorized"); setZones(d.user?.zones ?? []); setRole(d.user?.role ?? ""); setReady(true); })
      .catch(() => router.replace("/admin/login"));
  }, [load, router]);

  useEffect(() => {
    if (!ready) return;
    void load();
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [ready, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => () => { if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current); }, []);

  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando mapa operativo…</main>;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <MapaAlertas reports={reports} mode="admin" heightClassName="h-screen" monitorZones={zones} kioskMode focusTarget={focusTarget} privacyMode={role === "INSTITUTIONAL"} />

      {alertCard && (
        <aside className="pointer-events-none absolute left-4 top-4 z-[1100] w-[min(390px,calc(100vw-32px))] rounded-2xl border border-red-400/60 bg-slate-950/80 p-4 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">🚨 Nueva alerta operativa</div>
              <div className="mt-1 text-lg font-black">Reporte #{alertCard.report.id}</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${alertCard.priority === "critical" ? "border-red-400 bg-red-500/25 text-red-200" : "border-orange-400 bg-orange-500/25 text-orange-200"}`}>
              {priorityLabel(alertCard.priority)}
            </span>
          </div>
          <div className="mt-3 text-sm font-bold">{displayCategory(alertCard.report.category)}</div>
          <div className="mt-2 rounded-xl border border-slate-700/70 bg-black/20 p-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">📍 Dirección</div>
            <div className="mt-1 text-sm font-semibold">{alertCard.address}</div>
            {alertCard.area && <div className="mt-1 text-[11px] text-slate-400">{alertCard.area}</div>}
          </div>
          <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-200">{alertCard.report.aiSummary || alertCard.report.description || "Sin descripción adicional."}</p>
          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
            <span>{new Date(alertCard.report.createdAt).toLocaleString("es-AR")}</span>
            <span>Vista destacada · 30 s</span>
          </div>
        </aside>
      )}

      <div className="pointer-events-none absolute right-4 top-4 z-[1000] flex items-center gap-2">
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-right text-white shadow-xl backdrop-blur">
          <div className="text-sm font-black">{now.toLocaleTimeString("es-AR")}</div>
          <div className="text-[10px] text-emerald-400">● EN LÍNEA · {reports.filter(r => !["resuelta", "descartada"].includes(r.status)).length} activas</div>
        </div>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-3 text-sm font-bold text-white shadow-xl hover:bg-slate-800" title="Pantalla completa">⛶</button>
      </div>
    </main>
  );
}
