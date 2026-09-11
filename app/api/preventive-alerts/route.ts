import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const alerts = await prisma.personPatternAlert.findMany({
      where: {
        status: { in: ["pendiente", "en_revision"] },
        reportCount: { gte: 3 },
        centerLatitude: { not: null },
        centerLongitude: { not: null },
      },
      select: {
        id: true,
        category: true,
        reportCount: true,
        centerLatitude: true,
        centerLongitude: true,
        radiusKm: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    return NextResponse.json({ success: true, alerts });
  } catch (error) {
    console.error("Error cargando alertas preventivas públicas:", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron cargar las alertas preventivas." },
      { status: 500 }
    );
  }
}
