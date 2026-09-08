"use client";

import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

const MARKER_CONFIG: Record<string, { color: string; emoji: string }> = {
  "Delito / Robo": { color: "#ef4444", emoji: "🚨" },
  "Persona sospechosa": { color: "#f97316", emoji: "👤" },
  "Vehículo sospechoso": { color: "#eab308", emoji: "🚗" },
  Accidente: { color: "#3b82f6", emoji: "⚠️" },
  Incendio: { color: "#a855f7", emoji: "🔥" },
  Emergencia: { color: "#10b981", emoji: "🆘" },
};

const FILTROS = [
  { label: "Todos", value: "Todos", className: "bg-slate-700 text-white" },
  { label: "🚨 Delito / Robo", value: "Delito / Robo", className: "bg-red-500 text-white" },
  { label: "👤 Persona sospechosa", value: "Persona sospechosa", className: "bg-orange-500 text-white" },
  { label: "🚗 Vehículo sospechoso", value: "Vehículo sospechoso", className: "bg-yellow-500 text-black" },
  { label: "⚠️ Accidente", value: "Accidente", className: "bg-blue-500 text-white" },
  { label: "🔥 Incendio", value: "Incendio", className: "bg-purple-500 text-white" },
  { label: "🆘 Emergencia", value: "Emergencia", className: "bg-emerald-500 text-white" },
];

function getMarkerIcon(category: string, isNew: boolean) {
  const item = MARKER_CONFIG[category] || { color: "#64748b", emoji: "📍" };

  return L.divIcon({
    className: "",
    html: `
      <style>
        @keyframes alertaPulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
        ${
          isNew
            ? `<div style="position:absolute;width:44px;height:44px;border-radius:50%;background:${item.color};opacity:0.35;animation:alertaPulse 1.4s infinite;"></div>`
            : ""
        }
        <div style="position:relative;background:${item.color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
          <span style="transform:rotate(45deg);font-size:17px;">${item.emoji}</span>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44],
  });
}

function statusLabel(status: string) {
  switch (status) {
    case "pendiente": return "Pendiente";
    case "en_analisis": return "En análisis";
    case "verificada": return "Verificada";
    case "resuelta": return "Resuelta";
    case "descartada": return "Descartada";
    default: return status;
  }
}

export default function MapaAlertas({ reports }: { reports: Report[] }) {
  const [filtro, setFiltro] = useState("Todos");

  const reportsConUbicacion = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.latitude !== null &&
          report.longitude !== null &&
          (filtro === "Todos" || report.category === filtro)
      ),
    [reports, filtro]
  );

  const ahora = Date.now();

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {FILTROS.map((item) => (
          <button
            key={item.value}
            onClick={() => setFiltro(item.value)}
            className={`rounded-xl px-3 py-2 font-medium transition ${item.className} ${
              filtro === item.value
                ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950"
                : "opacity-80 hover:opacity-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="h-[500px] w-full overflow-hidden rounded-3xl border border-slate-800">
        <MapContainer center={[-38.112, -57.84]} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {reportsConUbicacion.map((report) => {
            const fecha = new Date(report.createdAt).getTime();
            const isNew = ahora >= fecha && ahora - fecha <= 10 * 60 * 1000;

            return (
              <Marker
                key={report.id}
                position={[report.latitude!, report.longitude!]}
                icon={getMarkerIcon(report.category, isNew)}
              >
                <Popup>
                  <div style={{ minWidth: "210px" }}>
                    <strong>🚨 {report.category}</strong>
                    <hr style={{ margin: "8px 0" }} />
                    <div><strong>Reporte N.º:</strong> #{report.id}</div>
                    <div style={{ marginTop: "6px" }}><strong>Descripción:</strong><br />{report.description}</div>
                    <div style={{ marginTop: "6px" }}><strong>Estado:</strong> {statusLabel(report.status)}</div>
                    <div style={{ marginTop: "6px" }}><strong>Fecha:</strong> {new Date(report.createdAt).toLocaleString("es-AR")}</div>
                    <div style={{ marginTop: "6px" }}><strong>Ubicación:</strong><br />{report.latitude?.toFixed(5)}, {report.longitude?.toFixed(5)}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
