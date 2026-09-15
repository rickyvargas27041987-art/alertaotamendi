"use client";

import { useCallback, useEffect, useState } from "react";

type AccessSession = {
  id: number;
  officerName: string;
  agency: string;
  serviceType: string;
  createdAt: string;
  lastAccessAt: string;
  expiresAt: string;
};

type Zone = { province: string; district: string; locality: string | null };

const serviceLabel: Record<string, string> = {
  POLICE: "Policía",
  FIRE: "Bomberos",
  MEDICAL: "Emergencias médicas",
  CIVIL_DEFENSE: "Defensa Civil",
};

export default function OperationalAccessPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/operational-access", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "No se pudo cargar el acceso operativo.");
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      setSessions(data.sessions || []);
      setZones(data.zones || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el acceso operativo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  async function rotate() {
    if (!window.confirm("¿Generar un código nuevo? El código anterior y todos los accesos activos dejarán de funcionar.")) return;
    setLoading(true);
    const response = await fetch("/api/admin/operational-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate" }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) setError(data.error || "No se pudo renovar el código.");
    await load();
  }

  async function revoke(sessionId: number) {
    const response = await fetch("/api/admin/operational-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_session", sessionId }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) setError(data.error || "No se pudo revocar el acceso.");
    await load();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/50"
        title="Administrar el código para personal operativo"
      >
        🛡️ Acceso operativo
      </button>

      {open && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-cyan-800/60 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Herramienta institucional</p>
                <h2 className="mt-1 text-2xl font-black">🛡️ Acceso operativo</h2>
                <p className="mt-1 text-sm text-slate-400">Compartí este código únicamente con personal autorizado de tu jurisdicción.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800">✕</button>
            </div>

            {error && <div className="mt-4 rounded-2xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}

            <div className="mt-5 rounded-3xl border border-cyan-500/30 bg-cyan-950/20 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Código vigente</p>
              <p className="mt-2 font-mono text-5xl font-black tracking-[0.18em] text-white">{loading && !code ? "••••••" : code}</p>
              <p className="mt-3 text-xs text-slate-400">Cambia automáticamente cada 12 horas.</p>
              {expiresAt && <p className="mt-1 text-xs font-semibold text-cyan-200">Vence: {new Date(expiresAt).toLocaleString("es-AR")}</p>}
              <button type="button" disabled={loading} onClick={() => void rotate()} className="mt-4 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black hover:bg-cyan-500 disabled:opacity-50">↻ Cambiar código ahora</button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="font-bold">📍 Jurisdicción habilitada</p>
              <div className="mt-2 space-y-1 text-sm text-slate-300">
                {zones.length ? zones.map((zone, index) => <p key={`${zone.province}-${zone.district}-${zone.locality}-${index}`}>{[zone.locality, zone.district, zone.province].filter(Boolean).join(" · ")}</p>) : <p className="text-amber-300">No hay una jurisdicción asignada.</p>}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black">Dispositivos con acceso ({sessions.length})</h3>
                <button type="button" onClick={() => void load()} className="text-xs font-bold text-cyan-300">Actualizar</button>
              </div>
              <div className="mt-3 space-y-2">
                {!sessions.length && <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-500">No hay accesos activos.</div>}
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-bold text-white">{session.officerName}</p>
                      <p className="truncate text-slate-400">{session.agency} · {serviceLabel[session.serviceType] || session.serviceType}</p>
                      <p className="mt-1 text-xs text-slate-600">Última consulta: {new Date(session.lastAccessAt).toLocaleString("es-AR")}</p>
                    </div>
                    <button type="button" onClick={() => void revoke(session.id)} className="shrink-0 rounded-xl border border-red-800 px-3 py-2 text-xs font-bold text-red-300">Revocar</button>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">El acceso no muestra la identidad del vecino. Todos los ingresos, consultas y aperturas de navegación quedan registrados.</p>
          </div>
        </div>
      )}
    </>
  );
}
