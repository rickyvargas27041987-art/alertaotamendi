"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";

type Report = {
  id: number;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type MapProps = {
  reports: Report[];
  mode?: "admin" | "public";
  heightClassName?: string;
};

const PUBLIC_MARKER_HOURS = 2;

export default function MapaPublicoPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [MapaAlertas, setMapaAlertas] =
    useState<ComponentType<MapProps> | null>(null);

  // Cargamos el mapa solamente en el navegador.
  // Esto evita el error "window is not defined" en Vercel.
  useEffect(() => {
    let activo = true;

    import("../components/MapaAlertas")
      .then((module) => {
        if (activo) {
          setMapaAlertas(() => module.default);
        }
      })
      .catch((error) => {
        console.error("Error cargando componente del mapa:", error);
      });

    return () => {
      activo = false;
    };
  }, []);

  async function cargarAlertas() {
    try {
      const response = await fetch("/api/reports", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Error al cargar las alertas");
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error cargando mapa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cargarAlertas();

    const interval = window.setInterval(() => {
      void cargarAlertas();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // En el mapa público mostramos solamente
  // las alertas activas de las últimas 2 horas.
  const visibleReports = useMemo(() => {
    const now = Date.now();
    const maxAge = PUBLIC_MARKER_HOURS * 60 * 60 * 1000;

    return reports.filter((report) => {
      const status = report.status.toLowerCase();

      if (
        status === "resuelta" ||
        status === "resuelto" ||
        status === "descartada"
      ) {
        return false;
      }

      if (
        report.latitude === null ||
        report.longitude === null
      ) {
        return false;
      }

      const createdAt = new Date(report.createdAt).getTime();

      if (!Number.isFinite(createdAt)) {
        return false;
      }

      const age = now - createdAt;

      return age >= 0 && age <= maxAge;
    });
  }, [reports]);

  const important = visibleReports.filter((report) =>
    [
      "Emergencia",
      "Delito / Robo",
      "Accidente",
      "Incendio",
    ].includes(report.category)
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">

        <header className="mb-5">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="mb-3 text-sm font-semibold text-slate-400 transition hover:text-white"
          >
            ← Volver al inicio
          </button>

          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
            Alerta Otamendi
          </p>

          <h1 className="mt-1 text-3xl font-black">
            🗺️ Mapa comunitario
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Alertas activas registradas durante las últimas 2 horas.
          </p>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[11px] text-slate-500">
              Últimas 2 h
            </p>
            <p className="mt-1 text-2xl font-black">
              {visibleReports.length}
            </p>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-3">
            <p className="text-[11px] text-red-300">
              Importantes
            </p>
            <p className="mt-1 text-2xl font-black">
              {important}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[11px] text-slate-500">
              Actualizado
            </p>
            <p className="mt-1 text-sm font-bold">
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </p>
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div>
            <p className="text-sm font-bold">
              📍 Alertas cerca tuyo
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              El mapa intenta ubicarte automáticamente y mostrar
              aproximadamente 15 km alrededor.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void cargarAlertas();
            }}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold transition hover:bg-slate-800"
          >
            ↻ Actualizar
          </button>
        </div>

        {loading || !MapaAlertas ? (
          <div className="flex min-h-[430px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center">
            <div>
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-red-500" />

              <p className="font-semibold text-white">
                Cargando mapa…
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Obteniendo alertas recientes y preparando tu ubicación.
              </p>
            </div>
          </div>
        ) : (
          <MapaAlertas
            reports={visibleReports}
            mode="public"
            heightClassName="h-[62vh] min-h-[430px] md:h-[650px]"
          />
        )}

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-400">
          🔒 Por seguridad, el mapa comunitario muestra ubicaciones
          aproximadas y únicamente alertas recientes. Podés alejar
          el mapa manualmente para explorar otras zonas. Las
          descripciones completas, fotografías, videos y audios
          quedan reservados para el Centro de Monitoreo.
        </div>

      </div>
    </main>
  );
}