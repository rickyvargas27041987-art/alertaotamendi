import { NextResponse } from "next/server";
import { localidadesArgentina, provinciasArgentina } from "@/app/data/localidadesArgentina";

export async function GET(request: Request) {
  const provinceId = new URL(request.url).searchParams.get("province")?.trim() ?? "";
  if (!provinceId) return NextResponse.json({ success: true, provinces: provinciasArgentina });
  if (!provinciasArgentina.some((item) => item.id === provinceId)) {
    return NextResponse.json({ success: false, error: "Provincia inválida." }, { status: 400 });
  }
  const localities = localidadesArgentina
    .filter((item) => item.provinciaId === provinceId)
    .map((item) => ({ id: item.id, name: item.nombre, district: item.municipio || item.departamento || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return NextResponse.json({ success: true, localities });
}
