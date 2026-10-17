import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  audit,
  canManageCenter,
  getMonitorActor,
  type MonitorActor,
} from "@/lib/monitorAuth";
import {
  configZones,
  ensureCenterConfig,
  ensureOrganizationConfig,
  operationalCode,
} from "@/lib/operationalAccess";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-AR");
}

function actorCanAccessNetwork(
  actor: MonitorActor,
  network: {
    province: string;
    district: string;
  }
) {
  if (actor.role === "ADMIN") return true;

  return actor.zones.some(
    (zone) =>
      normalize(zone.province) ===
        normalize(
          network.province
        ) &&
      normalize(zone.district) ===
        normalize(
          network.district
        )
  );
}

async function getOrganization(
  organizationId: number
) {
  return prisma.operationalOrganization.findUnique({
    where: {
      id: organizationId,
    },
    include: {
      network: true,
      zones: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });
}

async function actorCanManageOrganization(
  actor: MonitorActor,
  organizationId: number
) {
  const organization =
    await getOrganization(
      organizationId
    );

  if (
    !organization ||
    !organization.active ||
    !actorCanAccessNetwork(
      actor,
      organization.network
    )
  ) {
    return null;
  }

  if (actor.role === "ADMIN") {
    return organization;
  }

  if (!actor.id) {
    return null;
  }

  const membership =
    await prisma.operationalOrganizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actor.id,
        },
      },
      select: {
        active: true,
        role: true,
      },
    });

  if (
    !membership?.active ||
    ![
      "ADMIN",
      "COORDINATOR",
    ].includes(
      membership.role
    )
  ) {
    return null;
  }

  return organization;
}

async function manageableOrganizations(
  actor: MonitorActor
) {
  if (actor.role === "ADMIN") {
    return prisma.operationalOrganization.findMany({
      where: {
        active: true,
        network: {
          active: true,
        },
      },
      orderBy: [
        {
          network: {
            district:
              "asc",
          },
        },
        {
          type: "asc",
        },
        {
          name: "asc",
        },
      ],
      include: {
        network: true,
        zones: {
          orderBy: {
            id: "asc",
          },
        },
        mobileAccessConfig: {
          select: {
            id: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  if (!actor.id) {
    return [];
  }

  return prisma.operationalOrganization.findMany({
    where: {
      active: true,
      network: {
        active: true,
        OR: actor.zones.map(
          (zone) => ({
            province: {
              equals:
                zone.province,
              mode:
                "insensitive",
            },
            district: {
              equals:
                zone.district,
              mode:
                "insensitive",
            },
          })
        ),
      },
      members: {
        some: {
          userId:
            actor.id,
          active:
            true,
          role: {
            in: [
              "ADMIN",
              "COORDINATOR",
            ],
          },
        },
      },
    },
    orderBy: [
      {
        type: "asc",
      },
      {
        name: "asc",
      },
    ],
    include: {
      network: true,
      zones: {
        orderBy: {
          id: "asc",
        },
      },
      mobileAccessConfig: {
        select: {
          id: true,
          updatedAt: true,
        },
      },
    },
  });
}

async function configPayload(
  config: Awaited<
    ReturnType<
      typeof ensureOrganizationConfig
    >
  >
) {
  const current =
    operationalCode(config);

  const sessions =
    await prisma.operationalSession.findMany({
      where: {
        configId:
          config.id,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        revision:
          config.revision,
      },
      orderBy: {
        lastAccessAt:
          "desc",
      },
      take: 50,
      select: {
        id: true,
        officerName: true,
        agency: true,
        serviceType: true,
        createdAt: true,
        lastAccessAt: true,
        expiresAt: true,
      },
    });

  return {
    code: current.code,
    expiresAt:
      current.expiresAt,
    zones:
      configZones(config),
    sessions,
  };
}

/*
 * GET sin organizationId:
 * mantiene el flujo anterior para compatibilidad
 * y además devuelve la lista de organismos administrables.
 *
 * GET con organizationId:
 * devuelve el código móvil propio de ese organismo.
 */
export async function GET(
  request: Request
) {
  const actor =
    await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No autorizado.",
      },
      {
        status: 401,
      }
    );
  }

  if (!canManageCenter(actor)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "El perfil institucional no tiene acceso a códigos operativos.",
      },
      {
        status: 403,
      }
    );
  }

  try {
    const url =
      new URL(request.url);

    const organizationIdRaw =
      url.searchParams.get(
        "organizationId"
      );

    const organizations =
      await manageableOrganizations(
        actor
      );

    if (organizationIdRaw) {
      const organizationId =
        Number(
          organizationIdRaw
        );

      if (
        !Number.isInteger(
          organizationId
        ) ||
        organizationId <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Organismo inválido.",
          },
          {
            status: 400,
          }
        );
      }

      const organization =
        await actorCanManageOrganization(
          actor,
          organizationId
        );

      if (!organization) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No tenés permiso para administrar el acceso móvil de este organismo.",
          },
          {
            status: 403,
          }
        );
      }

      const config =
        await ensureOrganizationConfig(
          organization.id
        );

      const payload =
        await configPayload(
          config
        );

      return NextResponse.json({
        success: true,
        mode:
          "organization",
        organization: {
          id: organization.id,
          name: organization.name,
          shortName:
            organization.shortName,
          type:
            organization.type,
          canCoordinate:
            organization.canCoordinate,
          network: {
            id:
              organization
                .network.id,
            name:
              organization
                .network.name,
            province:
              organization
                .network.province,
            district:
              organization
                .network.district,
          },
        },
        organizations,
        ...payload,
      });
    }

    /*
     * Compatibilidad temporal con el botón/panel viejo.
     * Cuando el frontend nuevo esté desplegado, dejará de usar este código general.
     */
    const config =
      await ensureCenterConfig(
        actor
      );

    const current =
      operationalCode(config);

    const sessions =
      await prisma.operationalSession.findMany({
        where: {
          configId:
            config.id,
          revokedAt:
            null,
          expiresAt: {
            gt:
              new Date(),
          },
          revision:
            config.revision,
        },
        orderBy: {
          lastAccessAt:
            "desc",
        },
        take: 50,
        select: {
          id: true,
          officerName: true,
          agency: true,
          serviceType: true,
          createdAt: true,
          lastAccessAt: true,
          expiresAt: true,
        },
      });

    return NextResponse.json({
      success: true,
      mode: "legacy",
      code:
        current.code,
      expiresAt:
        current.expiresAt,
      zones:
        configZones(config),
      sessions,
      organizations,
    });
  } catch (error) {
    console.error(
      "Error obteniendo acceso operativo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo generar el acceso móvil operativo.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: Request
) {
  const actor =
    await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No autorizado.",
      },
      {
        status: 401,
      }
    );
  }

  if (!canManageCenter(actor)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "El perfil institucional no puede administrar accesos operativos.",
      },
      {
        status: 403,
      }
    );
  }

  const body =
    await request
      .json()
      .catch(() => ({}));

  const action =
    String(
      body.action || ""
    );

  const organizationId =
    body.organizationId ===
      undefined ||
    body.organizationId ===
      null
      ? null
      : Number(
          body.organizationId
        );

  let config:
    | Awaited<
        ReturnType<
          typeof ensureCenterConfig
        >
      >
    | Awaited<
        ReturnType<
          typeof ensureOrganizationConfig
        >
      >;

  let auditContext =
    "Acceso operativo general";

  if (organizationId !== null) {
    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Organismo inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const organization =
      await actorCanManageOrganization(
        actor,
        organizationId
      );

    if (!organization) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No tenés permiso para administrar este acceso móvil.",
        },
        {
          status: 403,
        }
      );
    }

    config =
      await ensureOrganizationConfig(
        organization.id
      );

    auditContext =
      organization.name;
  } else {
    config =
      await ensureCenterConfig(
        actor
      );
  }

  if (action === "rotate") {
    const updated =
      await prisma.$transaction(
        async (tx) => {
          const next =
            await tx.operationalCodeConfig.update({
              where: {
                id:
                  config.id,
              },
              data: {
                revision: {
                  increment: 1,
                },
                rotationStartedAt:
                  new Date(),
              },
            });

          await tx.operationalSession.updateMany({
            where: {
              configId:
                config.id,
              revokedAt:
                null,
            },
            data: {
              revokedAt:
                new Date(),
            },
          });

          return next;
        }
      );

    await audit(
      actor,
      "OPERATIONAL_CODE_ROTATED",
      `${auditContext}: código móvil renovado; accesos anteriores revocados.`
    );

    const current =
      operationalCode(
        updated
      );

    return NextResponse.json({
      success: true,
      code:
        current.code,
      expiresAt:
        current.expiresAt,
    });
  }

  if (
    action ===
    "revoke_session"
  ) {
    const sessionId =
      Number(
        body.sessionId
      );

    if (
      !Number.isInteger(
        sessionId
      ) ||
      sessionId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Acceso inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await prisma.operationalSession.updateMany({
        where: {
          id:
            sessionId,
          configId:
            config.id,
          revokedAt:
            null,
        },
        data: {
          revokedAt:
            new Date(),
        },
      });

    if (!result.count) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Acceso no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await audit(
      actor,
      "OPERATIONAL_SESSION_REVOKED",
      `${auditContext}: acceso móvil #${sessionId} revocado.`
    );

    return NextResponse.json({
      success: true,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Operación inválida.",
    },
    {
      status: 400,
    }
  );
}
