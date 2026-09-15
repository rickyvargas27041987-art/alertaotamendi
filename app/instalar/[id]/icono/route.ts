import React from "react";
import { ImageResponse } from "next/og";
import { installationLocality, installationName } from "@/lib/localInstallation";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locality = installationLocality((await params).id);
  if (!locality) return new Response("Localidad inválida", { status: 404 });
  const size = Number(new URL(request.url).searchParams.get("size") || 512);
  if (![180, 192, 512].includes(size)) return new Response("Tamaño inválido", { status: 400 });
  const localityName = installationName(locality.nombre).toUpperCase();
  const localityFont = localityName.length > 35 ? 24 : localityName.length > 22 ? 30 : localityName.length > 14 ? 38 : 48;

  return new ImageResponse(
    React.createElement("div", {
      style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#1e293b" },
    }, React.createElement("div", {
      style: { width: 512, height: 512, flexShrink: 0, transform: `scale(${size / 512})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#020617,#111827)", color: "white", fontFamily: "Arial", border: "18px solid #1e293b" },
    },
        React.createElement("div", { style: { width: 220, height: 145, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" } },
          React.createElement("div", { style: { width: 150, height: 95, display: "flex", borderRadius: "80px 80px 18px 18px", background: "linear-gradient(90deg,#991b1b,#ef4444,#fca5a5,#dc2626)", border: "8px solid #fecaca", boxShadow: "0 0 34px #ef4444" } }),
          React.createElement("div", { style: { width: 205, height: 24, display: "flex", borderRadius: 8, background: "white" } })
        ),
        React.createElement("div", { style: { marginTop: 18, fontSize: 58, lineHeight: 1, fontWeight: 900, letterSpacing: 5, color: "#f8fafc", display: "flex" } }, "ALERTA"),
        React.createElement("div", { style: { width: 405, minHeight: 100, marginTop: 12, fontSize: localityFont, lineHeight: 1.05, fontWeight: 800, textAlign: "center", alignItems: "center", justifyContent: "center", display: "flex", color: "#fca5a5" } }, localityName)
      )
    ),
    { width: size, height: size }
  );
}
