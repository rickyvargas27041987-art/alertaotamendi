import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";
import { localidadesArgentina, provinciasArgentina } from "@/app/data/localidadesArgentina";

export async function GET(request: Request) {
  const actor = await getMonitorActor();
  if (!actor || actor.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("provinceId")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";

  if (!provinceId) {
    return NextResponse.json({ success: true, provinces: provinciasArgentina });
  }

  const province = provinciasArgentina.find((item) => item.id === provinceId);
  if (!province) {
    return NextResponse.json({ success: false, error: "Provincia inválida." }, { status: 400 });
  }

  const provinceLocalities = localidadesArgentina.filter((item) => item.provinciaId === provinceId);
  if (!district) {
    const districts = Array.from(
      new Set(provinceLocalities.map((item) => item.municipio || item.departamento).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, "es"));
    return NextResponse.json({ success: true, province, districts });
  }

  const localities = provinceLocalities
    .filter((item) => (item.municipio || item.departamento) === district)
    .map((item) => ({ id: item.id, name: item.nombre }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return NextResponse.json({ success: true, province, district, localities });
}
