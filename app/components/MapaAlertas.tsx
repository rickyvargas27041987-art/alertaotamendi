"use client";

import dynamic from "next/dynamic";

type Report = {
  id: number;
  category: string;
  description?: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type MapFocusTarget = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  key: number;
};

type MonitorZone = {
  province: string;
  district: string;
  locality: string | null;
};

type Props = {
  reports: Report[];
  mode?: "admin" | "public";
  onSelectReport?: (report: Report) => void;
  heightClassName?: string;
  focusTarget?: MapFocusTarget | null;
  monitorZones?: MonitorZone[];
  kioskMode?: boolean;
};

/*
 * MUY IMPORTANTE:
 *
 * Leaflet utiliza "window" y "document".
 * Por eso NO lo cargamos durante el render del servidor.
 *
 * ssr: false obliga a Next.js a cargar el mapa
 * únicamente en el navegador.
 *
 * Esto evita:
 * ReferenceError: window is not defined
 */

const MapaAlertasLeaflet = dynamic(
  () => import("./MapaAlertasLeaflet"),
  {
    ssr: false,

    loading: () => (
      <div className="flex min-h-[430px] w-full items-center justify-center rounded-3xl border border-slate-800 bg-slate-900">
        <div className="px-6 text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-700 border-t-red-500" />

          <p className="font-bold text-white">
            Cargando mapa…
          </p>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            Preparando ubicación y alertas comunitarias.
          </p>
        </div>
      </div>
    ),
  }
);

export default function MapaAlertas(props: Props) {
  return <MapaAlertasLeaflet {...props} />;
}
