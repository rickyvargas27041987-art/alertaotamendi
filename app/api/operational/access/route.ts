import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SERVICE_TYPES,
  codesMatch,
  configZones,
  createOperationalToken,
  hashOperationalToken,
  operationalAudit,
  operationalCode,
  operationalCookieOptions,
  OPERATIONAL_COOKIE,
  serviceTypeForOrganizationType,
  type ServiceType,
} from "@/lib/operationalAccess";
import { subscriptionHasAccess } from "@/lib/subscription";
import { consumeRateLimit } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 5;

export async function POST(
  request: Request
) {
  if (
    !(await consumeRateLimit(
      request,
      "operational-access",
      MAX_ATTEMPTS,
      15 * 60
    ))
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Demasiados intentos. Esperá 15 minutos.",
      },
      {
        status: 429,
      }
    );
  }

  try {
    const body =
      await request
        .json()
        .catch(() => ({}));

    const code =
      String(
        body.code || ""
      ).replace(
        /\D/g,
        ""
      );

    const officerName =
      String(
        body.officerName || ""
      )
        .trim()
        .slice(0, 100);

    if (
      !/^\d{6}$/.test(
        code
      ) ||
      officerName.length < 3
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ingresá un código válido y tu nombre.",
        },
        {
          status: 400,
        }
      );
    }

    const configs =
      await prisma.operationalCodeConfig.findMany({
        include: {
          ownerUser: {
            include: {
              zones: true,
            },
          },
          organization: {
            include: {
              zones: true,
              network: true,
            },
          },
        },
      });

    const matches =
      configs.filter(
        (config) =>
          codesMatch(
            operationalCode(
              config
            ).code,
            code
          )
      );

    if (
      matches.length !== 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Código incorrecto, vencido o no habilitado.",
        },
        {
          status: 401,
        }
      );
    }

    const config =
      matches[0];

    if (
      config.ownerUser &&
      !subscriptionHasAccess(
        config.ownerUser
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El acceso de este Centro no se encuentra habilitado.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      config.organization &&
      !config.organization
        .active
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este organismo no se encuentra activo.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      !configZones(config)
        .length
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este acceso todavía no tiene una jurisdicción asignada.",
        },
        {
          status: 403,
        }
      );
    }

    let agency: string;
    let serviceType:
      ServiceType;

    /*
     * NUEVO FLUJO:
     * si el código pertenece a un organismo real de la Red Operativa,
     * la persona NO elige institución ni servicio.
     */
    if (
      config.organization
    ) {
      const derivedServiceType =
        serviceTypeForOrganizationType(
          config.organization
            .type
        );

      if (
        !derivedServiceType
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Este tipo de organismo todavía no tiene acceso móvil habilitado.",
          },
          {
            status: 403,
          }
        );
      }

      agency =
        config.organization
          .name;

      serviceType =
        derivedServiceType;
    } else {
      /*
       * FLUJO ANTERIOR:
       * se conserva temporalmente para no romper códigos existentes.
       */
      const legacyAgency =
        String(
          body.agency || ""
        )
          .trim()
          .slice(0, 120);

      const legacyServiceType =
        String(
          body.serviceType ||
            ""
        ) as ServiceType;

      if (
        legacyAgency.length <
          2 ||
        !SERVICE_TYPES.includes(
          legacyServiceType
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Este código pertenece al acceso anterior. Completá institución y servicio.",
          },
          {
            status: 400,
          }
        );
      }

      agency =
        legacyAgency;

      serviceType =
        legacyServiceType;
    }

    const current =
      operationalCode(
        config
      );

    const token =
      createOperationalToken();

    const session =
      await prisma.operationalSession.create({
        data: {
          configId:
            config.id,
          tokenHash:
            hashOperationalToken(
              token
            ),
          officerName,
          agency,
          serviceType,
          revision:
            config.revision,
          expiresAt:
            current.expiresAt,
        },
      });

    await operationalAudit(
      config.id,
      officerName,
      "OPERATIONAL_ACCESS_GRANTED",
      {
        sessionId:
          session.id,
        details:
          config.organization
            ? `${config.organization.name} · ${config.organization.type} · ${serviceType}`
            : `${agency} · ${serviceType}`,
      }
    );

    const response =
      NextResponse.json({
        success: true,
        expiresAt:
          session.expiresAt,
        organization:
          config.organization
            ? {
                id:
                  config
                    .organization
                    .id,
                name:
                  config
                    .organization
                    .name,
                shortName:
                  config
                    .organization
                    .shortName,
                type:
                  config
                    .organization
                    .type,
                serviceType,
              }
            : null,
      });

    response.cookies.set(
      OPERATIONAL_COOKIE,
      token,
      {
        ...operationalCookieOptions,
        maxAge:
          Math.max(
            60,
            Math.floor(
              (session.expiresAt.getTime() -
                Date.now()) /
                1000
            )
          ),
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Error habilitando acceso operativo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo validar el acceso móvil operativo.",
      },
      {
        status: 500,
      }
    );
  }
}
