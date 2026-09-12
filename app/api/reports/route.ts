import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, canOperateReport, getMonitorActor } from "@/lib/monitorAuth";
import {
  calcularDistanciaKm,
  sendWebPush,
} from "@/lib/webPush";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const VALID_CATEGORIES = [
  "Delito / Robo",
  "Persona sospechosa",
  "Vehículo sospechoso",
  "Accidente",
  "Incendio",
  "Emergencia",
] as const;

type ValidCategory =
  (typeof VALID_CATEGORIES)[number];

const PUSH_RADIUS_KM = 5;

const CRITICAL_CATEGORIES =
  new Set<string>([
    "Delito / Robo",
    "Emergencia",
  ]);

const HIGH_CATEGORIES =
  new Set<string>([
    "Accidente",
    "Incendio",
  ]);

const VALID_STATUSES = [
  "pendiente",
  "en_analisis",
  "verificada",
  "resuelta",
  "descartada",
] as const;

/* =========================================================
   ADMIN
========================================================= */

async function resolveJurisdiction(latitude: number, longitude: number) {
  try {
    const url = `https://apis.datos.gob.ar/georef/api/ubicacion?lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { province: null, district: null, locality: null };
    const data = await response.json();
    const u = data?.ubicacion;
    return {
      province: u?.provincia?.nombre ?? null,
      district: u?.municipio?.nombre ?? u?.departamento?.nombre ?? null,
      locality: u?.localidad?.nombre ?? null,
    };
  } catch {
    return { province: null, district: null, locality: null };
  }
}

/* =========================================================
   PRIVACIDAD MAPA PÚBLICO
========================================================= */

function roundPublicCoordinate(
  value: number | null
) {
  if (value === null) {
    return null;
  }

  /*
   * Aproximamos las coordenadas públicas.
   * El administrador conserva la ubicación exacta.
   */
  return Math.round(value * 1000) / 1000;
}

/* =========================================================
   PRIORIDAD PUSH
========================================================= */

function getPushPriority(
  category: string
): "critical" | "high" | "normal" {
  if (
    CRITICAL_CATEGORIES.has(category)
  ) {
    return "critical";
  }

  if (
    HIGH_CATEGORIES.has(category)
  ) {
    return "high";
  }

  return "normal";
}

/* =========================================================
   TÍTULO PUSH
========================================================= */

function getPushTitle(
  category: string,
  priority:
    | "critical"
    | "high"
    | "normal"
) {
  if (priority === "critical") {
    return "🚨 Alerta importante cerca tuyo";
  }

  if (priority === "high") {
    return "⚠️ Alerta cercana";
  }

  if (
    category ===
    "Persona sospechosa"
  ) {
    return "👤 Aviso cerca tuyo";
  }

  if (
    category ===
    "Vehículo sospechoso"
  ) {
    return "🚗 Aviso cerca tuyo";
  }

  return "📍 Alerta cercana";
}

/* =========================================================
   NOTIFICAR DISPOSITIVOS CERCANOS
========================================================= */

async function notifyNearbyReport(
  report: {
    id: number;
    category: string;
    latitude: number | null;
    longitude: number | null;
  }
) {
  if (
    report.latitude === null ||
    report.longitude === null
  ) {
    console.warn(
      `Reporte #${report.id} sin ubicación. No se envían notificaciones.`
    );

    return;
  }

  try {
    /*
     * Buscamos solamente dispositivos
     * que tienen las alertas activadas.
     */
    const subscriptions =
      await prisma.pushSubscription.findMany(
        {
          where: {
            enabled: true,
          },
        }
      );

    console.log(
      `[PUSH] Reporte #${report.id}: ${subscriptions.length} suscripciones activas.`
    );

    if (
      subscriptions.length === 0
    ) {
      console.log(
        `[PUSH] No hay dispositivos suscriptos.`
      );

      return;
    }

    /*
     * Calculamos distancia real mediante
     * la fórmula Haversine.
     */ 
    const nearby =
      subscriptions
        .map(
          (subscription) => {
            const distance =
              calcularDistanciaKm(
                subscription.latitude,
                subscription.longitude,
                report.latitude!,
                report.longitude!
              );

            return {
              subscription,
              distance,
            };
          }
        )
        .filter(
          ({ distance }) =>
            Number.isFinite(
              distance
            ) &&
            distance <=
              PUSH_RADIUS_KM
        );

    console.log(
      `[PUSH] ${nearby.length} de ${subscriptions.length} dispositivos están dentro de ${PUSH_RADIUS_KM} km.`
    );

    if (nearby.length === 0) {
      return;
    }

    const priority =
      getPushPriority(
        report.category
      );

    const title =
      getPushTitle(
        report.category,
        priority
      );

    /*
     * Enviamos una notificación
     * independiente a cada dispositivo.
     *
     * Cada envío tiene su propio try/catch,
     * por lo que una suscripción rota
     * no interrumpe las demás.
     */
    const results =
      await Promise.all(
        nearby.map(
          async ({
            subscription,
            distance,
          }) => {
            try {
              const result =
                await sendWebPush(
                  {
                    endpoint:
                      subscription.endpoint,

                    p256dh:
                      subscription.p256dh,

                    auth:
                      subscription.auth,
                  },

                  {
                    title,

                    body:
                      `${report.category} reportado a aproximadamente ${distance.toFixed(
                        1
                      )} km de tu ubicación.`,

                    url: "/mapa",

                    tag:
                      `report-${report.id}`,

                    reportId:
                      report.id,

                    priority,
                  }
                );

              /*
               * 404 y 410:
               * la suscripción ya no existe
               * en el proveedor Push.
               */
              if (
                result.status ===
                  404 ||
                result.status ===
                  410
              ) {
                console.warn(
                  `[PUSH] Suscripción ${subscription.id} vencida (${result.status}). Se desactiva.`
                );

                await prisma
                  .pushSubscription
                  .update({
                    where: {
                      id:
                        subscription.id,
                    },

                    data: {
                      enabled:
                        false,
                    },
                  });

                return {
                  ok: false,
                  expired: true,
                  status:
                    result.status,
                };
              }

              /*
               * Cualquier otro rechazo
               * queda visible en Vercel Logs.
               */
              if (!result.ok) {
                console.error(
                  `[PUSH] ERROR suscripción ${subscription.id}: status=${result.status}`,
                  result.text
                );

                return {
                  ok: false,
                  expired: false,
                  status:
                    result.status,
                };
              }

              console.log(
                `[PUSH] OK → dispositivo ${subscription.id} (${distance.toFixed(
                  1
                )} km). Status ${result.status}.`
              );

              return {
                ok: true,
                expired: false,
                status:
                  result.status,
              };
            } catch (
              error
            ) {
              /*
               * Este catch es MUY importante.
               *
               * También captura errores
               * producidos antes de contactar
               * al proveedor Web Push,
               * por ejemplo configuración VAPID.
               */
              console.error(
                `[PUSH] EXCEPCIÓN dispositivo ${subscription.id}:`,
                error
              );

              return {
                ok: false,
                expired: false,
                status: 500,
              };
            }
          }
        )
      );

    const success =
      results.filter(
        (result) => result.ok
      ).length;

    const expired =
      results.filter(
        (result) =>
          result.expired
      ).length;

    const failed =
      results.length -
      success -
      expired;

    console.log(
      `[PUSH] Resultado reporte #${report.id}: ${success} enviados, ${failed} fallidos, ${expired} vencidos.`
    );
  } catch (error) {
    console.error(
      `[PUSH] Error general notificando reporte #${report.id}:`,
      error
    );
  }
}

/* =========================================================
   ALERTA PREVENTIVA AGRUPADA
   Persona/Vehículo sospechoso: 3 reportes distintos
========================================================= */

const PREVENTIVE_WINDOW_MINUTES = 30;
const PREVENTIVE_MAX_RADIUS_KM = 1;

function normalizeWords(text: string) {
  const stop = new Set(["para","pero","como","con","sin","una","uno","unos","unas","que","del","las","los","por","muy","esta","este","ese","esa","sobre","persona","sospechosa","vehiculo","vehículo"]);
  return new Set(
    text.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/)
      .filter((word) => word.length >= 4 && !stop.has(word))
  );
}

function sharedDetailCount(a: string, b: string) {
  const aw = normalizeWords(a);
  const bw = normalizeWords(b);
  let count = 0;
  aw.forEach((word) => { if (bw.has(word)) count += 1; });
  return count;
}

async function sendPreventivePush(alert: {
  id: number; category: string; centerLatitude: number | null; centerLongitude: number | null;
}) {
  if (alert.centerLatitude === null || alert.centerLongitude === null) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { enabled: true } });
  const nearby = subscriptions.filter((subscription) =>
    calcularDistanciaKm(subscription.latitude, subscription.longitude, alert.centerLatitude!, alert.centerLongitude!) <= PUSH_RADIUS_KM
  );

  await Promise.all(nearby.map(async (subscription) => {
    try {
      const result = await sendWebPush(
        { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
        {
          title: "⚠️ AVISO PREVENTIVO EN LA ZONA",
          body: "Se recibieron varios reportes coincidentes sobre una situación sospechosa en el sector. Mantenga precaución y utilice los servicios oficiales ante una emergencia.",
          url: "/mapa",
          tag: `preventive-${alert.id}`,
          priority: "normal",
        }
      );
      if (result.status === 404 || result.status === 410) {
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { enabled: false } });
      }
    } catch (error) {
      console.error(`[PUSH] Error en alerta preventiva #${alert.id}:`, error);
    }
  }));
}

async function evaluateSuspiciousPattern(report: {
  id: number; category: string; description: string; latitude: number | null; longitude: number | null; createdAt: Date;
}) {
  if (report.latitude === null || report.longitude === null) return;
  const since = new Date(report.createdAt.getTime() - PREVENTIVE_WINDOW_MINUTES * 60 * 1000);
  const candidates = await prisma.report.findMany({
    where: {
      id: { not: report.id }, category: report.category,
      createdAt: { gte: since, lte: report.createdAt },
      latitude: { not: null }, longitude: { not: null },
    },
    orderBy: { createdAt: "desc" }, take: 40,
  });

  const related = candidates.filter((candidate) => {
    const distance = calcularDistanciaKm(report.latitude!, report.longitude!, candidate.latitude!, candidate.longitude!);
    if (!Number.isFinite(distance) || distance > PREVENTIVE_MAX_RADIUS_KM) return false;
    // Muy cerca: la zona por sí sola alcanza. Más lejos: exigimos detalles compartidos.
    return distance <= 0.35 || sharedDetailCount(report.description, candidate.description) >= 2;
  });

  const group = [report, ...related].slice(0, 12);
  if (group.length < 3) return;

  const reportIds = Array.from(new Set(group.map((item) => item.id)));
  const latitudes = group.map((item) => item.latitude!).filter(Number.isFinite);
  const longitudes = group.map((item) => item.longitude!).filter(Number.isFinite);
  const centerLatitude = latitudes.reduce((a,b) => a+b, 0) / latitudes.length;
  const centerLongitude = longitudes.reduce((a,b) => a+b, 0) / longitudes.length;
  const farthestKm = Math.max(...group.map((item) => calcularDistanciaKm(centerLatitude, centerLongitude, item.latitude!, item.longitude!)));
  const radiusKm = Math.max(0.15, Math.min(1.5, farthestKm + 0.12));

  const recentAlerts = await prisma.personPatternAlert.findMany({
    where: { category: report.category, status: { in: ["pendiente", "en_revision"] }, lastReportAt: { gte: since } },
    orderBy: { updatedAt: "desc" }, take: 20,
  });
  const existing = recentAlerts.find((alert) =>
    alert.reportIds.some((id) => reportIds.includes(id)) ||
    (alert.centerLatitude !== null && alert.centerLongitude !== null &&
      calcularDistanciaKm(centerLatitude, centerLongitude, alert.centerLatitude, alert.centerLongitude) <= PREVENTIVE_MAX_RADIUS_KM)
  );

  let preventiveAlert;
  let isNew = false;
  if (existing) {
    const merged = Array.from(new Set([...existing.reportIds, ...reportIds]));
    preventiveAlert = await prisma.personPatternAlert.update({
      where: { id: existing.id },
      data: {
        triggerReportId: report.id, reportIds: merged, reportCount: merged.length,
        centerLatitude, centerLongitude, radiusKm, timeWindowMinutes: PREVENTIVE_WINDOW_MINUTES,
        summary: `Se detectaron ${merged.length} reportes coincidentes de ${report.category} en el sector.`,
        reason: "Coincidencia por proximidad geográfica y/o detalles compartidos entre reportes.",
        lastReportAt: report.createdAt,
      },
    });
  } else {
    isNew = true;
    preventiveAlert = await prisma.personPatternAlert.create({
      data: {
        category: report.category, triggerReportId: report.id, reportIds, reportCount: reportIds.length,
        centerLatitude, centerLongitude, radiusKm, timeWindowMinutes: PREVENTIVE_WINDOW_MINUTES,
        summary: `Se detectaron ${reportIds.length} reportes coincidentes de ${report.category} en el sector.`,
        reason: "Coincidencia por proximidad geográfica y/o detalles compartidos entre reportes.",
        status: "pendiente", lastReportAt: report.createdAt,
      },
    });
  }

  // Un solo beep/push al nacer la alerta preventiva; los reportes posteriores se agrupan sin repetir aviso.
  if (isNew && !preventiveAlert.notificationSentAt) {
    await sendPreventivePush(preventiveAlert);
    await prisma.personPatternAlert.update({ where: { id: preventiveAlert.id }, data: { notificationSentAt: new Date() } });
  }
}

/* =========================================================
   GET
   ADMIN: información completa
   PÚBLICO: información protegida
========================================================= */

export async function GET() {
  try {
    /*
     * ADMINISTRADOR
     */
    const actor = await getMonitorActor();
    if (actor) {
      const reports =
        await prisma.report.findMany(
          {
            orderBy: {
              createdAt: "desc",
            },
          }
        );

      return NextResponse.json(
        {
          success: true,
          total:
            reports.length,
          reports,
        }
      );
    }

    /*
     * PÚBLICO
     *
     * No enviamos descripción,
     * fotografías, video ni audio.
     */
    const reports =
      await prisma.report.findMany(
        {
          orderBy: {
            createdAt: "desc",
          },

          select: {
            id: true,
            category: true,
            status: true,
            latitude: true,
            longitude: true,
            createdAt: true,
          },

          take: 500,
        }
      );

    const publicReports =
      reports.map(
        (report) => ({
          ...report,

          latitude:
            roundPublicCoordinate(
              report.latitude
            ),

          longitude:
            roundPublicCoordinate(
              report.longitude
            ),
        })
      );

    return NextResponse.json({
      success: true,
      total:
        publicReports.length,
      reports:
        publicReports,
    });
  } catch (error) {
    console.error(
      "Error al obtener reportes:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Error al obtener los reportes.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST
   CREAR NUEVA ALERTA
========================================================= */

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const category =
      typeof body.category ===
      "string"
        ? body.category.trim()
        : "";

    const description =
      typeof body.description ===
      "string"
        ? body.description.trim()
        : "";

    const latitude =
      body.latitude === null ||
      body.latitude ===
        undefined
        ? null
        : Number(
            body.latitude
          );

    const longitude =
      body.longitude === null ||
      body.longitude ===
        undefined
        ? null
        : Number(
            body.longitude
          );

    const imageUrl =
      typeof body.imageUrl ===
        "string" &&
      body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;

    const videoUrl =
      typeof body.videoUrl ===
        "string" &&
      body.videoUrl.trim()
        ? body.videoUrl.trim()
        : null;

    const audioUrl =
      typeof body.audioUrl ===
        "string" &&
      body.audioUrl.trim()
        ? body.audioUrl.trim()
        : null;

    /* -----------------------------------------------------
       VALIDACIÓN CATEGORÍA
    ----------------------------------------------------- */

    if (
      !VALID_CATEGORIES.includes(
        category as ValidCategory
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Categoría inválida.",
        },
        {
          status: 400,
        }
      );
    }

    /* -----------------------------------------------------
       VALIDACIÓN DESCRIPCIÓN
    ----------------------------------------------------- */

    if (
      description.length < 3 ||
      description.length >
        1000
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "La descripción debe tener entre 3 y 1000 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    /* -----------------------------------------------------
       VALIDACIÓN UBICACIÓN
    ----------------------------------------------------- */

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(
        latitude
      ) ||
      !Number.isFinite(
        longitude
      ) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Necesitamos una ubicación válida para enviar la alerta.",
        },
        {
          status: 400,
        }
      );
    }

    /* -----------------------------------------------------
       GUARDAR REPORTE
    ----------------------------------------------------- */

    const jurisdiction = await resolveJurisdiction(latitude, longitude);

    const newReport =
      await prisma.report.create(
        {
          data: {
            category,
            description,

            status:
              "pendiente",

            latitude,
            longitude,

            imageUrl,
            videoUrl,
            audioUrl,
            province: jurisdiction.province,
            district: jurisdiction.district,
            locality: jurisdiction.locality,
          },
        }
      );

    console.log(
      `[REPORT] Nueva alerta #${newReport.id} · ${newReport.category}`
    );

    /*
     * ANÁLISIS IA AUTOMÁTICO
     * El reporte queda analizado antes de aparecer en el Centro de Monitoreo.
     * Si OpenAI falla, la alerta igualmente se conserva y continúa el flujo normal.
     */
    try {
      const internalSecret = process.env.ADMIN_SESSION_SECRET;
      if (internalSecret && process.env.OPENAI_API_KEY) {
        const origin = new URL(request.url).origin;
        const aiResponse = await fetch(`${origin}/api/ai/analyze-report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-alerta-internal-secret": internalSecret,
          },
          body: JSON.stringify({ reportId: newReport.id }),
          cache: "no-store",
        });

        if (!aiResponse.ok) {
          console.error(`[AI AUTO] No se pudo analizar reporte #${newReport.id}:`, await aiResponse.text());
        } else {
          console.log(`[AI AUTO] Reporte #${newReport.id} analizado automáticamente.`);
        }
      } else {
        console.warn("[AI AUTO] Falta OPENAI_API_KEY o ADMIN_SESSION_SECRET.");
      }
    } catch (error) {
      console.error(`[AI AUTO] Error automático en reporte #${newReport.id}:`, error);
    }

    /*
     * Notificamos dispositivos dentro
     * del radio de 10 km.
     *
     * Esperamos el resultado para que
     * Vercel no finalice la función
     * antes de terminar los pushes.
     */
    // Persona/Vehículo sospechoso NO generan push individual.
    // Recién se avisa cuando 3 reportes distintos forman una alerta preventiva.
    if (
      newReport.category !== "Persona sospechosa" &&
      newReport.category !== "Vehículo sospechoso"
    ) {
      await notifyNearbyReport(newReport);
    } else {
      await evaluateSuspiciousPattern(newReport);
    }

    return NextResponse.json(
      {
        success: true,

        message:
          "Alerta recibida correctamente.",

        report: {
          id:
            newReport.id,

          category:
            newReport.category,

          status:
            newReport.status,

          createdAt:
            newReport.createdAt,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Error al guardar alerta:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Error al guardar la alerta.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   PATCH
   CAMBIAR ESTADO DE REPORTE
========================================================= */

export async function PATCH(
  request: Request
) {
  try {
    const actor = await getMonitorActor();
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const id =
      Number(body.id);

    const status =
      typeof body.status ===
      "string"
        ? body.status
        : "";

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !VALID_STATUSES.includes(
        status as
          (typeof VALID_STATUSES)[number]
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "ID o estado inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const currentReport = await prisma.report.findUnique({
      where: { id },
      select: { id: true, province: true, district: true, locality: true, status: true },
    });
    if (!currentReport) return NextResponse.json({ success: false, message: "Reporte no encontrado." }, { status: 404 });
    if (!canOperateReport(actor, currentReport)) {
      return NextResponse.json({ success: false, message: "No tenés autorización para modificar reportes de esta jurisdicción." }, { status: 403 });
    }

    const updatedReport =
      await prisma.report.update(
        {
          where: {
            id,
          },

          data: {
            status,
          },
        }
      );

    await audit(actor, "REPORT_STATUS_CHANGED", `${currentReport.status} -> ${status}`, id);

    return NextResponse.json(
      {
        success: true,

        message:
          "Estado actualizado correctamente.",

        report:
          updatedReport,
      }
    );
  } catch (error) {
    console.error(
      "Error al actualizar estado:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Error al actualizar el estado.",
      },
      {
        status: 500,
      }
    );
  }
}