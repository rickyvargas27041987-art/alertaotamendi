"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const MapaAlertas = dynamic(() => import("../../components/MapaAlertas"), { ssr: false });

type Report = {
  id: number; category: string; description?: string; status: string;
  latitude: number | null; longitude: number | null; createdAt: string;
};
type Zone = { province: string; district: string; locality: string | null };

export default function MapaGrandePage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      const data = await response.json();
      if (data.success && Array.isArray(data.reports)) setReports(data.reports);
    } catch (error) { console.error("Error actualizando mapa grande:", error); }
  }, [router]);

  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("unauthorized"); return r.json(); })
      .then((d) => { if (!d.success) throw new Error("unauthorized"); setZones(d.user?.zones ?? []); setReady(true); void load(); })
      .catch(() => router.replace("/admin/login"));
  }, [load, router]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [ready, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando mapa operativo…</main>;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <MapaAlertas reports={reports} mode="admin" heightClassName="h-screen" monitorZones={zones} kioskMode />
      <div className="pointer-events-none absolute right-4 top-4 z-[1000] flex items-center gap-2">
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-right text-white shadow-xl backdrop-blur">
          <div className="text-sm font-black">{now.toLocaleTimeString("es-AR")}</div>
          <div className="text-[10px] text-emerald-400">● EN LÍNEA · {reports.filter(r => !["resuelta", "descartada"].includes(r.status)).length} activas</div>
        </div>
        <button
          type="button"
          onClick={() => document.documentElement.requestFullscreen?.()}
          className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-3 text-sm font-bold text-white shadow-xl hover:bg-slate-800"
          title="Pantalla completa"
        >⛶</button>
      </div>
    </main>
  );
}
