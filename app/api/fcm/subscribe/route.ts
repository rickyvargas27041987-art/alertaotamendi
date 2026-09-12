import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (token.length < 40 || token.length > 4096) {
      return NextResponse.json(
        {
          success: false,
          error: "Token FCM inválido.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Latitud inválida.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Longitud inválida.",
        },
        { status: 400 }
      );
    }

    const device = await prisma.fcmDevice.upsert({
      where: {
        token,
      },

      create: {
        token,
        latitude,
        longitude,
        enabled: true,
      },

      update: {
        latitude,
        longitude,
        enabled: true,
      },

      select: {
        id: true,
        enabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      device,
    });
  } catch (error) {
    console.error(
      "[FCM] Error registrando dispositivo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo registrar el dispositivo Android.",
      },
      { status: 500 }
    );
  }
}
