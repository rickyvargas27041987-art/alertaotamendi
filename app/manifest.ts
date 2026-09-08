import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alerta Otamendi",
    short_name: "Alerta",
    description: "Sistema comunitario de alertas de Comandante Nicanor Otamendi",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#ef4444",
    orientation: "portrait",
    lang: "es-AR",
  };
}
