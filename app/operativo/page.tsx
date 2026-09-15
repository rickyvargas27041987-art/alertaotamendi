"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type OperationalSession = {
  officerName: string;
  agency: string;
  serviceType: string;
  expiresAt: string;
};

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
  province: string | null;
  district: string | null;
  locality: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
};

const serviceLabels: Record<string, string> = {
  POLICE: "Policía",
  FIRE: "Bomberos",
  MEDICAL: "Emergencias médicas",
  CIVIL_DEFENSE: "Defensa Civil",
};

const categoryIcon: Record<string, string> = {
  "Delito / Robo": "🚨",
  "Persona sospechosa": "👤",
  "Vehículo sospechoso": "🚗",
  Accidente: "⚠️",
  Incendio: "🔥",
  Emergencia: "🆘",
};

function priorityStyle(report: Report) {
  const priority = report.aiPriority || (["Emergencia", "Delito / Robo"].includes(report.category) ? "critical" : ["Accidente", "Incendio"].includes(report.category) ? "high" : "low");
  if (priority === "critical") return "border-red-500/60 bg-red-950/30";
  if (priority === "high") return "border-orange-500/50 bg-orange-950/20";
  return "border-slate-700 bg-slate-900";
}

export default function OperationalPage() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<OperationalSession | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [code, setCode] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [agency, setAgency] = useState("");
  const [serviceType, setServiceType] = useState("POLICE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [address, setAddress] = useState("");

  const loadReports = useCallback(async () => {
    const response = await fetch("/api/operational/reports", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "No se pudieron cargar las alertas.");
    setReports(data.reports || []);
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/operational/session", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setSession(null);
        return;
      }
      setSession(data.session);
      await loadReports();
    } catch {
      setSession(null);
    } finally {
      setChecking(false);
    }
  }, [loadReports]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkSession(), 0);
    return () => window.clearTimeout(timer);
  }, [checkSession]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => void loadReports().catch(() => undefined), 30_000);
    return () => window.clearInterval(interval);
  }, [session, loadReports]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/operational/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, officerName, agency, serviceType }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "No se pudo habilitar el acceso.");
      setCode("");
      await checkSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo habilitar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/operational/session", { method: "DELETE" });
    setSession(null);
    setReports([]);
    setSelected(null);
  }

  async function openReport(report: Report) {
    setSelected(report);
    setAddress("");
    void fetch("/api/operational/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: report.id, action: "view" }),
    });
    if (report.latitude !== null && report.longitude !== null) {
      try {
        const response = await fetch(`/api/reverse-geocode?lat=${report.latitude}&lon=${report.longitude}`, { cache: "no-store" });
        const data = await response.json();
        if (data.success) setAddress([data.address, data.area].filter(Boolean).join(" · "));
      } catch {
        // La navegación por coordenadas continúa disponible aunque no haya calle.
      }
    }
  }

  function navigate(report: Report, app: "google" | "waze") {
    if (report.latitude === null || report.longitude === null) return;
    void fetch("/api/operational/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: report.id, action: "navigate" }),
    });
    const destination = `${report.latitude},${report.longitude}`;
    window.location.href = app === "waze"
      ? `https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><p className="font-bold text-slate-400">Verificando acceso…</p></main>;
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="text-sm font-bold text-slate-400">← Volver a Alerta Otamendi</Link>
          <div className="mt-6 rounded-[32px] border border-cyan-800/60 bg-slate-900 p-6 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-600 text-3xl">🛡️</div>
            <p className="mt-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Acceso restringido</p>
            <h1 className="mt-2 text-center text-2xl font-black">Acceso operativo</h1>
            <p className="mt-2 text-center text-sm leading-5 text-slate-400">Herramienta destinada exclusivamente a personal autorizado.</p>

            <form onSubmit={login} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold">Código de 6 dígitos
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-center font-mono text-3xl font-black tracking-[0.25em] outline-none focus:border-cyan-500" placeholder="000000" required />
              </label>
              <label className="block text-sm font-semibold">Nombre y apellido
                <input value={officerName} onChange={(event) => setOfficerName(event.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-500" required />
              </label>
              <label className="block text-sm font-semibold">Dependencia o institución
                <input value={agency} onChange={(event) => setAgency(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-500" placeholder="Ej.: Comisaría local" required />
              </label>
              <label className="block text-sm font-semibold">Servicio
                <select value={serviceType} onChange={(event) => setServiceType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
                  <option value="POLICE">Policía</option>
                  <option value="FIRE">Bomberos</option>
                  <option value="MEDICAL">Emergencias médicas</option>
                  <option value="CIVIL_DEFENSE">Defensa Civil</option>
                </select>
              </label>
              {error && <div className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
              <button disabled={busy || code.length !== 6} className="w-full rounded-2xl bg-cyan-600 py-4 font-black hover:bg-cyan-500 disabled:opacity-40">{busy ? "VERIFICANDO…" : "INGRESAR DE FORMA SEGURA"}</button>
            </form>
            <p className="mt-5 text-center text-xs leading-5 text-slate-500">El ingreso queda registrado. El código vence automáticamente y el Centro puede revocar el acceso en cualquier momento.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <header className="sticky top-0 z-20 rounded-3xl border border-slate-800 bg-slate-950/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">🛡️ Acceso operativo activo</p>
              <h1 className="mt-1 text-xl font-black">{session.officerName}</h1>
              <p className="text-xs text-slate-400">{session.agency} · {serviceLabels[session.serviceType] || session.serviceType}</p>
            </div>
            <button type="button" onClick={() => void logout()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold">Salir</button>
          </div>
        </header>

        <section className="mt-4 flex items-center justify-between gap-3">
          <div><h2 className="text-2xl font-black">Alertas activas</h2><p className="text-sm text-slate-500">Actualización automática cada 30 segundos</p></div>
          <button type="button" onClick={() => void loadReports().catch((err: Error) => setError(err.message))} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold">↻ Actualizar</button>
        </section>

        {error && <div className="mt-4 rounded-2xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
        <section className="mt-4 space-y-3">
          {!reports.length && <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-bold">No hay alertas activas para este servicio y jurisdicción.</p></div>}
          {reports.map((report) => (
            <button key={report.id} type="button" onClick={() => void openReport(report)} className={`w-full rounded-3xl border p-4 text-left shadow-lg ${priorityStyle(report)}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-black">{categoryIcon[report.category] || "📍"} {report.category === "Delito / Robo" ? "Hurto / Robo" : report.category}</p><p className="mt-1 text-xs text-slate-400">{new Date(report.createdAt).toLocaleString("es-AR")}</p></div>
                <span className="rounded-full bg-black/25 px-2 py-1 text-[10px] font-bold uppercase">{report.status.replace("_", " ")}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-200">{report.description}</p>
              <p className="mt-2 text-xs text-slate-500">📍 {[report.locality, report.district, report.province].filter(Boolean).join(" · ") || "Ubicación disponible por coordenadas"}</p>
            </button>
          ))}
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/80 p-3 sm:items-center" onClick={() => setSelected(null)}>
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-slate-700 bg-slate-950 p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Alerta #{selected.id}</p><h2 className="mt-1 text-2xl font-black">{categoryIcon[selected.category]} {selected.category === "Delito / Robo" ? "Hurto / Robo" : selected.category}</h2></div><button type="button" onClick={() => setSelected(null)} className="h-9 w-9 rounded-full bg-slate-800">✕</button></div>
            <div className="mt-4 rounded-2xl bg-slate-900 p-4"><p className="text-xs font-bold uppercase text-slate-500">Descripción</p><p className="mt-2 leading-6 text-slate-100">{selected.description}</p></div>
            {selected.aiSummary && <div className="mt-3 rounded-2xl border border-violet-800/50 bg-violet-950/30 p-4"><p className="text-xs font-bold uppercase text-violet-300">Resumen inteligente</p><p className="mt-2 text-sm text-slate-200">{selected.aiSummary}</p></div>}
            <div className="mt-3 rounded-2xl bg-slate-900 p-4"><p className="text-xs font-bold uppercase text-slate-500">Ubicación</p><p className="mt-2 font-semibold">{address || [selected.locality, selected.district, selected.province].filter(Boolean).join(" · ") || "Buscando dirección…"}</p><p className="mt-1 text-xs text-slate-500">{selected.latitude !== null && selected.longitude !== null ? `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : "Sin coordenadas"}</p></div>
            {(selected.imageUrl || selected.videoUrl || selected.audioUrl) && <div className="mt-3 grid grid-cols-3 gap-2">{selected.imageUrl && <a href={selected.imageUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 p-3 text-center text-xs font-bold">📷 Foto</a>}{selected.videoUrl && <a href={selected.videoUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 p-3 text-center text-xs font-bold">🎥 Video</a>}{selected.audioUrl && <a href={selected.audioUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-800 p-3 text-center text-xs font-bold">🎙️ Audio</a>}</div>}
            {selected.latitude !== null && selected.longitude !== null && <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => navigate(selected, "google")} className="rounded-2xl bg-blue-600 py-4 font-black">🗺️ Google Maps</button><button type="button" onClick={() => navigate(selected, "waze")} className="rounded-2xl bg-cyan-600 py-4 font-black">🚙 Waze</button></div>}
            <p className="mt-4 text-xs leading-5 text-amber-200/80">Información reservada para uso operativo. No compartir públicamente ni utilizar fuera de la función autorizada.</p>
          </div>
        </div>
      )}
    </main>
  );
}
