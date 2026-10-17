import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  audit,
  canManageCenter,
  getMonitorActor,
  type MonitorActor,
} from "@/lib/monitorAuth";

const ORGANIZATION_TYPES = [
  "MONITORING",
  "MUNICIPAL",
  "POLICE",
  "FIRE",
  "MEDICAL",
  "CIVIL_DEFENSE",
  "OTHER",
] as const;

type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("es-AR");
}

function canEditNetwork(actor: MonitorActor) {
  return actor.role === "ADMIN" || actor.role === "CENTER_ADMIN";
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
      normalize(zone.province) === normalize(network.province) &&
      normalize(zone.district) === normalize(network.district)
  );
}

async function findAccessibleNetwork(
  actor: MonitorActor,
  networkId: number
) {
  const network =
    await prisma.operationalNetwork.findUnique({
      where: { id: networkId },
      select: {
        id: true,
        name: true,
        province: true,
        district: true,
        active: true,
      },
    });

  if (
    !network ||
    !network.active ||
    !actorCanAccessNetwork(actor, network)
  ) {
    return null;
  }

  return network;
}

export async function GET() {
  const actor = await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: "No autorizado.",
      },
      { status: 401 }
    );
  }

  if (!canManageCenter(actor)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "El perfil institucional no tiene acceso a la Red Operativa.",
      },
      { status: 403 }
    );
  }

  try {
    const where =
      actor.role === "ADMIN"
        ? {
            active: true,
          }
        : {
            active: true,
            OR: actor.zones.map((zone) => ({
              province: {
                equals: zone.province,
                mode: "insensitive" as const,
              },
              district: {
                equals: zone.district,
                mode: "insensitive" as const,
              },
            })),
          };

    const networks =
      await prisma.operationalNetwork.findMany({
        where,
        orderBy: [
          { province: "asc" },
          { district: "asc" },
        ],
        include: {
          organizations: {
            orderBy: [
              { active: "desc" },
              { type: "asc" },
              { name: "asc" },
            ],
            include: {
              zones: {
                orderBy: [
                  { district: "asc" },
                  { locality: "asc" },
                ],
              },
              _count: {
                select: {
                  members: true,
                  responses: true,
                },
              },
            },
          },
          _count: {
            select: {
              incidents: true,
            },
          },
        },
      });

    return NextResponse.json({
      success: true,
      canEdit: canEditNetwork(actor),
      networks,
    });
  } catch (error) {
    console.error(
      "Error cargando Red Operativa:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo cargar la Red Operativa.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const actor = await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: "No autorizado.",
      },
      { status: 401 }
    );
  }

  if (!canEditNetwork(actor)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No tenés permisos para administrar organismos.",
      },
      { status: 403 }
    );
  }

  try {
    const body =
      await request.json().catch(() => ({}));

    const action = String(
      body.action || ""
    );

    if (action !== "create_organization") {
      return NextResponse.json(
        {
          success: false,
          error: "Operación inválida.",
        },
        { status: 400 }
      );
    }

    const networkId = Number(body.networkId);
    const name = String(
      body.name || ""
    )
      .trim()
      .slice(0, 160);

    const shortNameRaw = String(
      body.shortName || ""
    )
      .trim()
      .slice(0, 80);

    const type = String(
      body.type || ""
    ) as OrganizationType;

    const localityRaw = String(
      body.locality || ""
    )
      .trim()
      .slice(0, 120);

    const canCoordinate =
      body.canCoordinate === true;

    if (
      !Number.isInteger(networkId) ||
      networkId <= 0 ||
      name.length < 2 ||
      !ORGANIZATION_TYPES.includes(type)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Completá correctamente los datos del organismo.",
        },
        { status: 400 }
      );
    }

    const network =
      await findAccessibleNetwork(
        actor,
        networkId
      );

    if (!network) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Red Operativa inexistente o fuera de tu jurisdicción.",
        },
        { status: 403 }
      );
    }

    const organization =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.operationalOrganization.create({
              data: {
                networkId:
                  network.id,
                name,
                shortName:
                  shortNameRaw ||
                  null,
                type,
                canCoordinate,
                active: true,
              },
            });

          await tx.operationalOrganizationZone.create({
            data: {
              organizationId:
                created.id,
              province:
                network.province,
              district:
                network.district,
              locality:
                localityRaw ||
                null,
            },
          });

          return created;
        }
      );

    await audit(
      actor,
      "OPERATIONAL_ORGANIZATION_CREATED",
      `${organization.name} · ${organization.type} · ${network.name}`
    );

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error(
      "Error creando organismo operativo:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message.includes(
        "Unique constraint"
      ) ||
      message.includes(
        "OperationalOrganization_networkId_name_key"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ya existe un organismo con ese nombre dentro de esta Red Operativa.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo crear el organismo.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const actor = await getMonitorActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: "No autorizado.",
      },
      { status: 401 }
    );
  }

  if (!canEditNetwork(actor)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No tenés permisos para administrar organismos.",
      },
      { status: 403 }
    );
  }

  try {
    const body =
      await request.json().catch(() => ({}));

    const organizationId = Number(
      body.organizationId
    );

    const name = String(
      body.name || ""
    )
      .trim()
      .slice(0, 160);

    const shortNameRaw = String(
      body.shortName || ""
    )
      .trim()
      .slice(0, 80);

    const type = String(
      body.type || ""
    ) as OrganizationType;

    const localityRaw = String(
      body.locality || ""
    )
      .trim()
      .slice(0, 120);

    const canCoordinate =
      body.canCoordinate === true;

    const active =
      body.active !== false;

    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0 ||
      name.length < 2 ||
      !ORGANIZATION_TYPES.includes(type)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datos de organismo inválidos.",
        },
        { status: 400 }
      );
    }

    const current =
      await prisma.operationalOrganization.findUnique({
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

    if (
      !current ||
      !actorCanAccessNetwork(
        actor,
        current.network
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Organismo inexistente o fuera de tu jurisdicción.",
        },
        { status: 403 }
      );
    }

    const organization =
      await prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.operationalOrganization.update({
              where: {
                id: current.id,
              },
              data: {
                name,
                shortName:
                  shortNameRaw ||
                  null,
                type,
                canCoordinate,
                active,
              },
            });

          const mainZone =
            current.zones[0];

          if (mainZone) {
            await tx.operationalOrganizationZone.update({
              where: {
                id: mainZone.id,
              },
              data: {
                province:
                  current.network
                    .province,
                district:
                  current.network
                    .district,
                locality:
                  localityRaw ||
                  null,
              },
            });
          } else {
            await tx.operationalOrganizationZone.create({
              data: {
                organizationId:
                  current.id,
                province:
                  current.network
                    .province,
                district:
                  current.network
                    .district,
                locality:
                  localityRaw ||
                  null,
              },
            });
          }

          return updated;
        }
      );

    await audit(
      actor,
      "OPERATIONAL_ORGANIZATION_UPDATED",
      `${organization.name} · ${organization.type} · ${active ? "ACTIVO" : "INACTIVO"}`
    );

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error(
      "Error actualizando organismo operativo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo actualizar el organismo.",
      },
      { status: 500 }
    );
  }
}
