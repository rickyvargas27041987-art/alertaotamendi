import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonitorActor } from "@/lib/monitorAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getMonitorActor();

    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const now = new Date();

    const [alerts, sourceState, lastRun] =
      await Promise.all([
        prisma.weatherAlert.findMany({
          where: {
            active: true,
            OR: [
              {
                expiresAt: null,
              },
              {
                expiresAt: {
                  gt: now,
                },
              },
            ],
          },

          orderBy: [
            {
              sentAt: "desc",
            },
            {
              lastSeenAt: "desc",
            },
          ],

          take: 50,

          select: {
            id: true,
            externalId: true,
            source: true,

            event: true,
            severity: true,
            urgency: true,
            certainty: true,

            headline: true,
            description: true,
            instruction: true,
            sourceWeb: true,

            sentAt: true,
            effectiveAt: true,
            onsetAt: true,
            expiresAt: true,

            areaDescription: true,
            areas: true,

            firstSeenAt: true,
            lastSeenAt: true,
            lastNotifiedAt: true,
          },
        }),

        prisma.weatherSourceState.findUnique({
          where: {
            sourceKey: "SMN_CAP",
          },

          select: {
            source: true,
            endpoint: true,

            lastAttemptAt: true,
            lastSuccessAt: true,

            consecutiveFailures: true,
            lastHttpStatus: true,
            lastError: true,
          },
        }),

        prisma.weatherSyncRun.findFirst({
          where: {
            source: "SMN",
          },

          orderBy: {
            startedAt: "desc",
          },

          select: {
            status: true,

            itemsReceived: true,
            itemsProcessed: true,
            itemsCreated: true,
            itemsUpdated: true,

            notificationsTargeted: true,
            notificationsSent: true,
            notificationsFailed: true,

            startedAt: true,
            finishedAt: true,
            error: true,
          },
        }),
      ]);

    return NextResponse.json({
      success: true,
      generatedAt: now,
      alerts,
      source: sourceState,
      lastRun,
    });
  } catch (error) {
    console.error(
      "[WEATHER] Error cargando alertas activas:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudieron cargar las alertas meteorológicas.",
      },
      {
        status: 500,
      }
    );
  }
}
