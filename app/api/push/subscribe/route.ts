import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const endpoint = body.endpoint;
    const p256dh = body.p256dh;
    const auth = body.auth;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (
      !endpoint ||
      !p256dh ||
      !auth ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Datos de suscripción incompletos.",
        },
        { status: 400 }
      );
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Ubicación inválida.",
        },
        { status: 400 }
      );
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: {
        endpoint,
      },
      update: {
        p256dh,
        auth,
        latitude,
        longitude,
        enabled: true,
      },
      create: {
        endpoint,
        p256dh,
        auth,
        latitude,
        longitude,
        enabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Alertas cercanas activadas.",
      id: subscription.id,
    });
  } catch (error) {
    console.error("Error guardando suscripción push:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo registrar el dispositivo.",
      },
      { status: 500 }
    );
  }
}
