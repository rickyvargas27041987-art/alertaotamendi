import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { success: false, message: "Suscripción inválida." },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { enabled: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error desactivando push:", error);
    return NextResponse.json(
      { success: false, message: "No se pudo desactivar la suscripción." },
      { status: 500 }
    );
  }
}
