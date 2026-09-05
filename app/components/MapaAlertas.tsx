"use client";
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

function getMarkerIcon(category: string) {
  const config: Record<string, { color: string; emoji: string }> = {
    "Delito / Robo": { color: "#ef4444", emoji: "🚨" },
    "Persona sospechosa": { color: "#f97316", emoji: "👤" },
    "Vehículo sospechoso": { color: "#eab308", emoji: "🚗" },
    "Accidente": { color: "#3b82f6", emoji: "⚠️" },
    "Incendio": { color: "#a855f7", emoji: "🔥" },
    "Emergencia": { color: "#10b981", emoji: "🆘" },
  };

  const item = config[category] || {
    color: "#64748b",
    emoji: "📍",
  };

  return L.divIcon({
    className: "",
    html: `
      <div style="
        background:${item.color};
        width:36px;
        height:36px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <span style="
          transform:rotate(45deg);
          font-size:17px;
        ">${item.emoji}</span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });
}

export default function MapaAlertas({
  reports,
}: {
  reports: Report[];
}) {
    const [filtro, setFiltro] = useState("Todos");
const reportsConUbicacion = reports.filter(
  (report) =>
    report.latitude !== null &&
    report.longitude !== null &&
    (filtro === "Todos" || report.category === filtro)
);
 return (
  <div>
    <div className="mb-3 flex flex-wrap gap-2 text-sm">
      <button
        onClick={() => setFiltro("Todos")}
        className="rounded-xl bg-slate-700 px-3 py-2"
      >
        Todos
      </button>

      <button
        onClick={() => setFiltro("Delito / Robo")}
        className="rounded-xl bg-red-500 px-3 py-2"
      >
        🚨 Delito / Robo
      </button>

      <button
        onClick={() => setFiltro("Persona sospechosa")}
        className="rounded-xl bg-orange-500 px-3 py-2"
      >
        👤 Persona sospechosa
      </button>

      <button
        onClick={() => setFiltro("Vehículo sospechoso")}
        className="rounded-xl bg-yellow-500 px-3 py-2 text-black"
      >
        🚗 Vehículo sospechoso
      </button>

      <button
        onClick={() => setFiltro("Accidente")}
        className="rounded-xl bg-blue-500 px-3 py-2"
      >
        ⚠️ Accidente
      </button>

      <button
        onClick={() => setFiltro("Incendio")}
        className="rounded-xl bg-purple-500 px-3 py-2"
      >
        🔥 Incendio
      </button>

      <button
        onClick={() => setFiltro("Emergencia")}
        className="rounded-xl bg-emerald-500 px-3 py-2"
      >
        🆘 Emergencia
      </button>
    </div>

    <div className="h-[500px] w-full overflow-hidden rounded-3xl">
      <MapContainer
        center={[-38.112, -57.84]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {reportsConUbicacion.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude!, report.longitude!]}
            icon={getMarkerIcon(report.category)}
          >
           <Popup>
  <div style={{ minWidth: "200px" }}>
    <strong>🚨 {report.category}</strong>

    <hr style={{ margin: "8px 0" }} />

    <div>
      <strong>Reporte N.º:</strong> #{report.id}
    </div>

    <div style={{ marginTop: "6px" }}>
      <strong>Descripción:</strong><br />
      {report.description}
    </div>

    <div style={{ marginTop: "6px" }}>
      <strong>Estado:</strong> {report.status}
    </div>

    <div style={{ marginTop: "6px" }}>
      <strong>Ubicación:</strong><br />
      {report.latitude?.toFixed(5)}, {report.longitude?.toFixed(5)}
    </div>
  </div>
</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
    </div>
  );
}