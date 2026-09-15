import type { MetadataRoute } from "next";
import { localidadesArgentina } from "@/app/data/localidadesArgentina";

export function installationLocality(id: string) {
  return localidadesArgentina.find((item) => item.id === id) ?? null;
}

export function installationName(name: string) {
  return name === "Comandante Nicanor Otamendi" ? "Otamendi" : name;
}

export function localManifest(id: string): MetadataRoute.Manifest | null {
  const locality = installationLocality(id);
  if (!locality) return null;
  const name = `Alerta ${installationName(locality.nombre)}`;
  const base = `/instalar/${id}`;
  return {
    id: base,
    name,
    short_name: name,
    description: `${name} · Red comunitaria Alerta Otamendi`,
    start_url: `${base}?abrir=1`,
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#ef4444",
    orientation: "portrait",
    lang: "es-AR",
    icons: [192, 512].map((size) => ({
      src: `${base}/icono?size=${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any" as const,
    })),
  };
}
