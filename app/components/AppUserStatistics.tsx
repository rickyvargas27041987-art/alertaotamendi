"use client";

import { useCallback, useEffect, useState } from "react";

type LocationCount = {
  province: string | null;
  district: string | null;
  locality: string | null;
  count: number;
};

type UserStatistics = {
  newUsers: { today: number; thisWeek: number };
  locations: LocationCount[];
  withoutLocation: number;
};

export default function AppUserStatistics() {
  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/app-users", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "No se pudieron cargar los usuarios.");
      }

      setStatistics({
        newUsers: data.newUsers,
        locations: Array.isArray(data.locations) ? data.locations : [],
        withoutLocation: Number(data.withoutLocation) || 0,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los usuarios."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatistics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatistics]);

  return (
    <div className="rounded-3xl border border-violet-500/25 bg-violet-950/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
            👥 Usuarios de la app
          </p>
          <h2 className="text-sm font-black">Altas y ubicación</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadStatistics()}
          disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          title="Actualizar estadísticas"
        >
          ↻
        </button>
      </div>

      {loading && !statistics ? (
        <p className="mt-3 text-xs text-slate-500">Cargando…</p>
      ) : error ? (
        <p className="mt-3 rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-xs text-red-300">
          {error}
        </p>
      ) : statistics ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-violet-500/20 bg-slate-950 p-3">
              <p className="text-[10px] uppercase text-slate-500">Nuevos hoy</p>
              <p className="mt-1 text-2xl font-black text-violet-200">
                {statistics.newUsers.today}
              </p>
            </div>
            <div className="rounded-2xl border border-violet-500/20 bg-slate-950 p-3">
              <p className="text-[10px] uppercase text-slate-500">Esta semana</p>
              <p className="mt-1 text-2xl font-black text-violet-200">
                {statistics.newUsers.thisWeek}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Por localidad / partido
            </p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {statistics.locations.length === 0 ? (
                <p className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
                  Todavía no hay ubicaciones registradas.
                </p>
              ) : (
                statistics.locations.map((location) => (
                  <div
                    key={`${location.province}-${location.district}-${location.locality}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-200">
                        {location.locality || location.district}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {[location.district, location.province]
                          .filter((value, index, values) =>
                            value && values.indexOf(value) === index
                          )
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-1 text-xs font-black text-violet-200">
                      {location.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {statistics.withoutLocation > 0 && (
            <p className="mt-2 text-[10px] text-slate-500">
              Ubicación pendiente: {statistics.withoutLocation}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
