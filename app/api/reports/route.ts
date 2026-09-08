import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { calcularDistanciaKm, sendWebPush } from "@/lib/webPush";

const VALID_CATEGORIES = [
  "Delito / Robo",
  "Persona sospechosa",
  "Vehículo sospechoso",
  "Accidente",
  "Incendio",
  "Emergencia",
] as const;

const IMPORTANT_CATEGORIES = new Set([
  "Delito / Robo",
  "Accidente",
  "Incendio",
  "Emergencia",
]);

async function isAdminAuthenticated() {
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!adminSessionSecret) return false;

  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === adminSessionSecret;
}

function roundPublicCoordinate(value: number | null) {
  if (value === null) return null;
  return Math.round(value * 1000) / 1000;
}

async function notifyImportantNearbyReport(report: {
  id: number;
  category: string;
  latitude: number | null;
  longitude: number | null;
}) {
  if (
    !IMPORTANT_CATEGORIES.has(report.category) ||
    report.latitude === null ||
    report.longitude === null
  ) {
    return;
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { enabled: true },
    });

    const nearby = subscriptions
      .map((subscription) => ({
        subscription,
        distance: calcularDistanciaKm(
          subscription.latitude,
          subscription.longitude,
          report.latitude!,
          report.longitude!
        ),
      }))
      .filter(({ distance }) => distance <= 10);

    const priority =
      report.category === "Emergencia" || report.category === "Delito / Robo"
        ? "critical"
        : "high";

    const results = await Promise.allSettled(
      nearby.map(async ({ subscription, distance }) => {
        const result = await sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          {
            title:
              priority === "critical"
                ? "🚨 Alerta importante cerca tuyo"
                : "⚠️ Alerta cercana",
            body: `${report.category} reportado a ${distance.toFixed(1)} km de tu ubicación.`,
            url: "/mapa",
            tag: `report-${report.id}`,
            reportId: report.id,
            priority,
          }
        );

        if (result.status === 404 || result.status === 410) {
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { enabled: false },
          });
        }

        if (!result.ok && result.status !== 404 && result.status !== 410) {
          console.warn("Push rechazado:", result.status, result.text);
        }
      })
    );

    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length > 0) {
      console.warn(`Fallaron ${rejected.length} notificaciones push.`);
    }
  } catch (error) {
    console.error("Error enviando notificaciones cercanas:", error);
  }
}

export async function GET() {
  try {
    if (await isAdminAuthenticated()) {
      const reports = await prisma.report.findMany({
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        success: true,
        total: reports.length,
        reports,
      });
    }

    const reports = await prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        status: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
      take: 500,
    });

    const publicReports = reports.map((report) => ({
      ...report,
      latitude: roundPublicCoordinate(report.latitude),
      longitude: roundPublicCoordinate(report.longitude),
    }));

    return NextResponse.json({
      success: true,
      total: publicReports.length,
      reports: publicReports,
    });
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    return NextResponse.json(
      { success: false, message: "Error al obtener los reportes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const category = typeof body.category === "string" ? body.category : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const latitude = body.latitude === null ? null : Number(body.latitude);
    const longitude = body.longitude === null ? null : Number(body.longitude);
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null;
    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : null;
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : null;

    if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return NextResponse.json(
        { success: false, message: "Categoría inválida." },
        { status: 400 }
      );
    }

    if (description.length < 3 || description.length > 1000) {
      return NextResponse.json(
        { success: false, message: "La descripción debe tener entre 3 y 1000 caracteres." },
        { status: 400 }
      );
    }

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { success: false, message: "Necesitamos una ubicación válida para enviar la alerta." },
        { status: 400 }
      );
    }

    const newReport = await prisma.report.create({
      data: {
        category,
        description,
        status: "pendiente",
        latitude,
        longitude,
        imageUrl,
        videoUrl,
        audioUrl,
      },
    });

    await notifyImportantNearbyReport(newReport);

    return NextResponse.json(
      {
        success: true,
        message: "Alerta recibida correctamente.",
        report: {
          id: newReport.id,
          category: newReport.category,
          status: newReport.status,
          createdAt: newReport.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al guardar alerta:", error);
    return NextResponse.json(
      { success: false, message: "Error al guardar la alerta." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { success: false, message: "No autorizado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = Number(body.id);
    const status = body.status;

    const validStatuses = [
      "pendiente",
      "en_analisis",
      "verificada",
      "resuelta",
      "descartada",
    ];

    if (!Number.isInteger(id) || id <= 0 || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: "ID o estado inválido." },
        { status: 400 }
      );
    }

    const updatedReport = await prisma.report.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: "Estado actualizado correctamente.",
      report: updatedReport,
    });
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    return NextResponse.json(
      { success: false, message: "Error al actualizar el estado." },
      { status: 500 }
    );
  }
}
