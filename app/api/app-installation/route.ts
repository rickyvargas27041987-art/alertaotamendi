import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { installationLocality } from "@/lib/localInstallation";
import { resolveJurisdiction, type Jurisdiction } from "@/lib/jurisdiction";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const installationId =
      typeof body.installationId === "string" ? body.installationId.trim() : "";

    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(installationId)) {
      return NextResponse.json(
        { success: false, error: "Identificador de instalación inválido." },
        { status: 400 }
      );
    }

    const platform =
      typeof body.platform === "string" ? body.platform.trim().slice(0, 40) : null;
    const localityId =
      typeof body.localityId === "string" ? body.localityId.trim() : "";
    const selectedLocality = localityId ? installationLocality(localityId) : null;

    let jurisdiction: Jurisdiction = selectedLocality
      ? {
          province: selectedLocality.provincia,
          district: selectedLocality.municipio ?? selectedLocality.departamento,
          locality: selectedLocality.nombre,
        }
      : { province: null, district: null, locality: null };

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const hasValidCoordinates =
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180;

    if (!selectedLocality && hasValidCoordinates) {
      jurisdiction = await resolveJurisdiction(latitude, longitude);
    }

    const locationUpdate = jurisdiction.province && jurisdiction.district
      ? jurisdiction
      : {};

    await prisma.appInstallation.upsert({
      where: { installationId },
      create: {
        installationId,
        platform,
        ...jurisdiction,
      },
      update: {
        platform,
        ...locationUpdate,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error registrando instalación de la app:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo registrar la instalación." },
      { status: 500 }
    );
  }
}
