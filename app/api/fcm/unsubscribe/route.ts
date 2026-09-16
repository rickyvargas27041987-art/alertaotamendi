import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 40 || token.length > 4096) {
      return NextResponse.json({ success: false, error: "Token inválido." }, { status: 400 });
    }
    await prisma.fcmDevice.updateMany({ where: { token }, data: { enabled: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FCM] Error desactivando dispositivo:", error);
    return NextResponse.json({ success: false, error: "No se pudo desactivar el dispositivo." }, { status: 500 });
  }
}
