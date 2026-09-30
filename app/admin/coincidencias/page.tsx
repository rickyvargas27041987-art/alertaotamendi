"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Target = {
  id: number;
  type: "PERSON" | "VEHICLE";
  title: string;
  reason: string;
  imageUrl: string | null;
  province: string | null;
  district: string | null;
  locality: string | null;
};

type Match = {
  id: number;
  trackingTargetId: number;
  reportId: number;
  confidence: number;
  reason: string;
  status: string;
  reportImageUrl: string | null;
  reportCategory: string;
  reportProvince: string | null;
  reportDistrict: string | null;
  reportLocality: string | null;
  outsideJurisdiction: boolean;
  createdAt: string;
  target: Target | null;
};

export default function CoincidenciasPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState("pendiente");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load(selectedStatus = status) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/tracking-matches?status=${encodeURIComponent(selectedStatus)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }

      if (!response.ok || !data.success) {
        setError(data.error || "No se pudieron cargar las coincidencias.");
        return;
      }

      setMatches(Array.isArray(data.matches) ? data.matches : []);
    } catch {
      setError("No se pudo conectar con el Centro de Monitoreo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(status);
  }, [status]);

  async function review(match: Match, nextStatus: "confirmada" | "descartada") {
    const question =
      nextStatus === "confirmada"
        ? "¿Confirmás que esta coincidencia merece seguimiento operativo?"
        : "¿Querés descartar esta coincidencia?";

    if (!window.confirm(question)) return;

    setBusyId(match.id);
    setError("");

    try {
      const response = await fetch("/api/admin/tracking-matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: match.id, status: nextStatus }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "No se pudo actualizar la coincidencia.");
        return;
      }

      await load(status);
    } catch {
      setError("No se pudo actualizar la coincidencia.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
              Centro de Monitoreo
            </p>
            <h1 className="mt-1 text-3xl font-black">⚠️ Coincidencias de seguimiento</h1>
            <p className="mt-2 text-sm text-slate-400">
              Comparación nacional automática. Toda coincidencia requiere revisión humana.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/seguimientos")}
              className="rounded-2xl border border-cyan-700 bg-cyan-950/30 px-4 py-3 text-sm font-bold text-cyan-200"
            >
              🎯 Seguimientos
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold"
            >
              ← Volver al monitoreo
            </button>
          </div>
        </header>

        <section className="mt-4 flex flex-wrap gap-2">
          {[
            ["pendiente", "Pendientes"],
            ["confirmada", "Confirmadas"],
            ["descartada", "Descartadas"],
            ["todos", "Todas"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                status === value
                  ? "border-amber-400 bg-amber-500/15 text-amber-200"
                  : "border-slate-800 bg-slate-900 text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </section>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">
            Cargando coincidencias…
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center">
            <p className="text-4xl">✓</p>
            <p className="mt-3 font-black">No hay coincidencias en esta sección.</p>
            <p className="mt-1 text-sm text-slate-500">
              El sistema seguirá comparando automáticamente los nuevos reportes de todo el país.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {matches.map((match) => (
              <article
                key={match.id}
                className="rounded-3xl border border-amber-500/25 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                      Posible coincidencia
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      {match.target?.type === "PERSON" ? "👤" : "🚗"} {match.target?.title || `Seguimiento #${match.trackingTargetId}`}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Reporte #{match.reportId} · {match.reportCategory}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-amber-500/10 px-4 py-2 text-right">
                    <p className="text-xs text-amber-300">SIMILITUD</p>
                    <p className="text-2xl font-black text-amber-200">
                      {Math.round(match.confidence * 100)}%
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Referencia</p>
                    {match.target?.imageUrl ? (
                      <img
                        src={match.target.imageUrl}
                        alt="Referencia"
                        className="h-44 w-full rounded-2xl border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-4xl">
                        {match.target?.type === "PERSON" ? "👤" : "🚗"}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Nuevo reporte</p>
                    {match.reportImageUrl ? (
                      <img
                        src={match.reportImageUrl}
                        alt="Nuevo reporte"
                        className="h-44 w-full rounded-2xl border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-4xl">
                        📍
                      </div>
                    )}
                  </div>
                </div>

                {match.outsideJurisdiction && (
                  <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-950/30 p-3 text-sm font-bold text-violet-200">
                    🌎 Coincidencia detectada fuera de la jurisdicción del seguimiento.
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Ubicación informada
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">
                    {[match.reportLocality, match.reportDistrict, match.reportProvince]
                      .filter(Boolean)
                      .join(" · ") || "Jurisdicción todavía no disponible"}
                  </p>

                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Motivo de la coincidencia
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {match.reason}
                  </p>
                </div>

                {status === "pendiente" && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === match.id}
                      onClick={() => void review(match, "descartada")}
                      className="rounded-2xl border border-slate-700 bg-slate-800 py-3 font-black text-slate-200 disabled:opacity-50"
                    >
                      ✕ Descartar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === match.id}
                      onClick={() => void review(match, "confirmada")}
                      className="rounded-2xl bg-emerald-600 py-3 font-black disabled:opacity-50"
                    >
                      ✓ Confirmar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
