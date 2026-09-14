"use client";

type StatsReport = {
  id: number;
  category: string;
  status: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  aiPriority?: string | null;
  locality?: string | null;
  district?: string | null;
};

const COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-cyan-500", "bg-violet-500", "bg-emerald-500"];

function priority(report: StatsReport) {
  if (["critical", "high", "medium", "low"].includes(report.aiPriority || "")) return report.aiPriority as string;
  if (["Emergencia", "Delito / Robo"].includes(report.category)) return "critical";
  if (["Accidente", "Incendio"].includes(report.category)) return "high";
  return "low";
}

function entries(values: string[]) {
  const counter = new Map<string, number>();
  values.forEach((value) => counter.set(value, (counter.get(value) || 0) + 1));
  return [...counter.entries()].sort((a, b) => b[1] - a[1]);
}

function Bars({ title, values, labels }: { title: string; values: Array<[string, number]>; labels?: Record<string, string> }) {
  const max = Math.max(1, ...values.map(([, count]) => count));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <h3 className="font-black">{title}</h3>
      <div className="mt-4 space-y-3">
        {values.length === 0 && <p className="text-sm text-slate-500">Sin datos para este período.</p>}
        {values.map(([name, count], index) => (
          <div key={name}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-slate-300">{labels?.[name] || name}</span>
              <b className="tabular-nums">{count}</b>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full ${COLORS[index % COLORS.length]}`} style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OperationalStatistics({ reports }: { reports: StatsReport[] }) {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return {
      label: date.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", ""),
      count: reports.filter((report) => {
        const created = new Date(report.createdAt);
        return created >= date && created < next;
      }).length,
    };
  });
  const dayMax = Math.max(1, ...days.map((day) => day.count));
  const resolved = reports.filter((report) => report.status === "resuelta").length;
  const active = reports.filter((report) => !["resuelta", "descartada"].includes(report.status)).length;
  const responseMinutes = reports
    .filter((report) => report.acknowledgedAt)
    .map((report) => Math.max(0, (new Date(report.acknowledgedAt!).getTime() - new Date(report.createdAt).getTime()) / 60000));
  const averageResponse = responseMinutes.length ? Math.round(responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length) : null;
  const peakHours = entries(reports.map((report) => `${String(new Date(report.createdAt).getHours()).padStart(2, "0")}:00`)).slice(0, 6);
  const localities = entries(reports.map((report) => report.locality || report.district || "Sin localidad")).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Reportes", reports.length, "text-white"],
          ["Activos", active, "text-orange-300"],
          ["Resueltos", resolved, "text-emerald-300"],
          ["Resolución", reports.length ? `${Math.round((resolved / reports.length) * 100)}%` : "—", "text-cyan-300"],
          ["Respuesta promedio", averageResponse === null ? "Sin datos" : `${averageResponse} min`, "text-violet-300"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-end justify-between">
          <div><h3 className="font-black">Actividad de los últimos 7 días</h3><p className="mt-1 text-xs text-slate-500">Cantidad de alertas recibidas por día</p></div>
          <span className="text-xs font-bold text-cyan-300">EN TIEMPO REAL</span>
        </div>
        <div className="mt-5 flex h-44 items-end gap-2 sm:gap-4">
          {days.map((day) => (
            <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <b className="text-xs tabular-nums text-slate-300">{day.count}</b>
              <div className="w-full rounded-t-lg bg-gradient-to-t from-cyan-700 to-cyan-400 transition-all" style={{ height: `${Math.max(3, (day.count / dayMax) * 120)}px` }} />
              <span className="text-[10px] uppercase text-slate-500">{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Bars title="Por categoría" values={entries(reports.map((report) => report.category))} />
        <Bars title="Por prioridad" values={entries(reports.map(priority))} labels={{ critical: "🔴 Crítica", high: "🟠 Alta", medium: "🟡 Media", low: "🟢 Baja" }} />
        <Bars title="Por estado" values={entries(reports.map((report) => report.status))} labels={{ pendiente: "Pendiente", en_analisis: "En análisis", verificada: "Verificada", resuelta: "Resuelta", descartada: "Descartada" }} />
        <Bars title="Localidades con más reportes" values={localities} />
        <Bars title="Horarios con mayor actividad" values={peakHours} />
      </div>

      <p className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs leading-5 text-cyan-100/70">
        Los resultados respetan los filtros seleccionados y la jurisdicción habilitada para el operador. Las estadísticas son apoyo para la gestión y no representan una conclusión policial.
      </p>
    </div>
  );
}
