import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonitorActor } from "@/lib/monitorAuth";

function buenosAiresPeriodStarts(now = new Date()) {
  const argentinaOffsetMs = 3 * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() - argentinaOffsetMs);

  const startOfTodayLocal = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );

  const day = localNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startOfWeekLocal = startOfTodayLocal - daysSinceMonday * 24 * 60 * 60 * 1000;

  return {
    today: new Date(startOfTodayLocal + argentinaOffsetMs),
    week: new Date(startOfWeekLocal + argentinaOffsetMs),
  };
}

export async function GET() {
  const actor = await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      { success: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  if (actor.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "Esta información es exclusiva del administrador." },
      { status: 403 }
    );
  }

  try {
    const starts = buenosAiresPeriodStarts();
    const [newToday, newThisWeek, locationGroups, withoutLocation] =
      await Promise.all([
        prisma.appInstallation.count({ where: { createdAt: { gte: starts.today } } }),
        prisma.appInstallation.count({ where: { createdAt: { gte: starts.week } } }),
        prisma.appInstallation.groupBy({
          by: ["province", "district", "locality"],
          where: {
            province: { not: null },
            district: { not: null },
          },
          _count: { _all: true },
        }),
        prisma.appInstallation.count({
          where: {
            OR: [{ province: null }, { district: null }],
          },
        }),
      ]);

    return NextResponse.json(
      {
        success: true,
        newUsers: { today: newToday, thisWeek: newThisWeek },
        locations: locationGroups
          .map((group) => ({
            province: group.province,
            district: group.district,
            locality: group.locality,
            count: group._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        withoutLocation,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error cargando estadísticas de usuarios:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar las estadísticas." },
      { status: 500 }
    );
  }
}
