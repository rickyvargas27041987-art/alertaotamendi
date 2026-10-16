import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";
import { syncWeatherAlerts } from "@/lib/weatherAlerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =========================================================
   AUTORIZACIÓN
========================================================= */

async function isAuthorized(request: Request) {
  /*
   * Permite llamadas internas del propio sistema.
   */
  const internalSecret =
    request.headers.get(
      "x-alerta-internal-secret"
    );

  if (
    process.env.ADMIN_SESSION_SECRET &&
    internalSecret ===
      process.env.ADMIN_SESSION_SECRET
  ) {
    return true;
  }

  /*
   * También permite ejecutar manualmente la
   * sincronización a un administrador autenticado.
   */
  const actor =
    await getMonitorActor();

  return actor?.role === "ADMIN";
}

/* =========================================================
   EJECUTAR SINCRONIZACIÓN
========================================================= */

async function runSync(
  request: Request
) {
  try {
    const authorized =
      await isAuthorized(request);

    if (!authorized) {
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

    const result =
      await syncWeatherAlerts();

    return NextResponse.json(
      {
        success: true,
        weather: result,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "[WEATHER] Error sincronizando alertas:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error sincronizando alertas meteorológicas.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   GET
   Permite prueba manual desde navegador estando como ADMIN.
========================================================= */

export async function GET(
  request: Request
) {
  return runSync(request);
}

/* =========================================================
   POST
   Se utilizará después para ejecución automática.
========================================================= */

export async function POST(
  request: Request
) {
  return runSync(request);
}