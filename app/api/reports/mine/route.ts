import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 100)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ success: true, reports: [] });
    }

    const reports = await prisma.report.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error("Error obteniendo reportes del dispositivo:", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron cargar tus reportes." },
      { status: 500 }
    );
  }
}
