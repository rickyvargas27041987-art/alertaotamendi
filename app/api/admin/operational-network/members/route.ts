import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  audit,
  getMonitorActor,
  type MonitorActor,
} from "@/lib/monitorAuth";

const MEMBER_ROLES = [
  "ADMIN",
  "COORDINATOR",
  "DISPATCHER",
  "OPERATOR",
  "VIEWER",
] as const;

type MemberRole = (typeof MEMBER_ROLES)[number];

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
      normalize(zone.province) === normalize(network.province) &&
      normalize(zone.district) === normalize(network.district)
  );
}

async function getOrganization(organizationId: number) {
  return prisma.operationalOrganization.findUnique({
    where: { id: organizationId },
    include: {
      network: true,
      zones: {
        orderBy: { id: "asc" },
      },
    },
  });
}

async function actorCanManageMembers(
  actor: MonitorActor,
  organizationId: number
) {
  if (actor.role === "ADMIN") return true;

  if (
    actor.role !== "CENTER_ADMIN" ||
    !actor.id
  ) {
    return false;
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

  return Boolean(
    membership?.active &&
      ["ADMIN", "COORDINATOR"].includes(
        membership.role
      )
  );
}

function userMatchesNetwork(
  user: {
    role: string;
    zones: Array<{
      province: string;
      district: string;
      locality: string | null;
    }>;
  },
  network: {
    province: string;
    district: string;
  }
) {
  if (user.role === "ADMIN") return false;

  return user.zones.some(
    (zone) =>
      normalize(zone.province) === normalize(network.province) &&
      normalize(zone.district) === normalize(network.district)
  );
}

export async function GET(request: Request) {
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

  const organizationId = Number(
    new URL(request.url).searchParams.get(
      "organizationId"
    )
  );

  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Organismo inválido.",
      },
      { status: 400 }
    );
  }

  try {
    const organization =
      await getOrganization(organizationId);

    if (
      !organization ||
      !actorCanAccessNetwork(
        actor,
        organization.network
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

    const canEdit =
      await actorCanManageMembers(
        actor,
        organization.id
      );

    const members =
      await prisma.operationalOrganizationMember.findMany({
        where: {
          organizationId:
            organization.id,
        },
        orderBy: [
          { active: "desc" },
          { isPrimary: "desc" },
          { createdAt: "asc" },
        ],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              role: true,
              organizationType:
                true,
              active: true,
              lastLoginAt: true,
              zones: true,
            },
          },
        },
      });

    let eligibleUsers: Array<{
      id: number;
      username: string;
      name: string;
      role: string;
      organizationType: string;
      active: boolean;
      zones: Array<{
        id: number;
        province: string;
        district: string;
        locality: string | null;
        userId: number;
      }>;
      memberships: Array<{
        id: number;
        role: string;
        active: boolean;
        isPrimary: boolean;
        organization: {
          id: number;
          name: string;
          shortName: string | null;
          type: string;
        };
      }>;
    }> = [];

    if (canEdit) {
      const users =
        await prisma.monitoringUser.findMany({
          where: {
            active: true,
            role: {
              not: "ADMIN",
            },
            zones: {
              some: {
                province: {
                  equals:
                    organization.network
                      .province,
                  mode: "insensitive",
                },
                district: {
                  equals:
                    organization.network
                      .district,
                  mode: "insensitive",
                },
              },
            },
          },
          orderBy: {
            name: "asc",
          },
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            organizationType: true,
            active: true,
            zones: true,
            operationalMemberships: {
              include: {
                organization: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                    type: true,
                  },
                },
              },
            },
          },
        });

      eligibleUsers = users
        .filter((user) =>
          userMatchesNetwork(
            user,
            organization.network
          )
        )
        .map((user) => ({
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          organizationType:
            user.organizationType,
          active: user.active,
          zones: user.zones,
          memberships:
            user.operationalMemberships.map(
              (membership) => ({
                id: membership.id,
                role: membership.role,
                active:
                  membership.active,
                isPrimary:
                  membership.isPrimary,
                organization:
                  membership.organization,
              })
            ),
        }));
    }

    return NextResponse.json({
      success: true,
      canEdit,
      organization: {
        id: organization.id,
        name: organization.name,
        shortName:
          organization.shortName,
        type: organization.type,
        active: organization.active,
        canCoordinate:
          organization.canCoordinate,
        network: {
          id: organization.network.id,
          name: organization.network.name,
          province:
            organization.network
              .province,
          district:
            organization.network
              .district,
        },
        zones: organization.zones,
      },
      memberRoles: MEMBER_ROLES,
      members,
      eligibleUsers,
    });
  } catch (error) {
    console.error(
      "Error cargando miembros de la Red Operativa:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudieron cargar los miembros del organismo.",
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

  try {
    const body =
      await request.json().catch(() => ({}));

    const organizationId = Number(
      body.organizationId
    );
    const userId = Number(body.userId);
    const role = String(
      body.role || "OPERATOR"
    ) as MemberRole;
    const isPrimary =
      body.isPrimary === true;

    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0 ||
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !MEMBER_ROLES.includes(role)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datos de membresía inválidos.",
        },
        { status: 400 }
      );
    }

    const organization =
      await getOrganization(
        organizationId
      );

    if (
      !organization ||
      !actorCanAccessNetwork(
        actor,
        organization.network
      ) ||
      !(await actorCanManageMembers(
        actor,
        organization.id
      ))
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No tenés permiso para administrar miembros de este organismo.",
        },
        { status: 403 }
      );
    }

    const user =
      await prisma.monitoringUser.findUnique({
        where: { id: userId },
        include: {
          zones: true,
        },
      });

    if (
      !user ||
      !user.active ||
      !userMatchesNetwork(
        user,
        organization.network
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El usuario no está activo o no pertenece a la jurisdicción de esta red.",
        },
        { status: 400 }
      );
    }

    const membership =
      await prisma.$transaction(
        async (tx) => {
          if (isPrimary) {
            await tx.operationalOrganizationMember.updateMany({
              where: {
                userId,
                isPrimary: true,
              },
              data: {
                isPrimary: false,
              },
            });
          }

          return tx.operationalOrganizationMember.upsert({
            where: {
              organizationId_userId: {
                organizationId,
                userId,
              },
            },
            create: {
              organizationId,
              userId,
              role,
              active: true,
              isPrimary,
            },
            update: {
              role,
              active: true,
              isPrimary,
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  role: true,
                },
              },
            },
          });
        }
      );

    await audit(
      actor,
      "OPERATIONAL_MEMBER_ASSIGNED",
      `${user.name} → ${organization.name} · ${role}${isPrimary ? " · PRINCIPAL" : ""}`
    );

    return NextResponse.json({
      success: true,
      membership,
    });
  } catch (error) {
    console.error(
      "Error asignando miembro operativo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo asignar el usuario al organismo.",
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

  try {
    const body =
      await request.json().catch(() => ({}));

    const membershipId = Number(
      body.membershipId
    );

    if (
      !Number.isInteger(
        membershipId
      ) ||
      membershipId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Membresía inválida.",
        },
        { status: 400 }
      );
    }

    const current =
      await prisma.operationalOrganizationMember.findUnique({
        where: {
          id: membershipId,
        },
        include: {
          organization: {
            include: {
              network: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    if (
      !current ||
      !actorCanAccessNetwork(
        actor,
        current.organization
          .network
      ) ||
      !(await actorCanManageMembers(
        actor,
        current.organizationId
      ))
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No tenés permiso para modificar esta membresía.",
        },
        { status: 403 }
      );
    }

    const roleValue =
      body.role === undefined
        ? current.role
        : String(body.role);

    if (
      !MEMBER_ROLES.includes(
        roleValue as MemberRole
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Rol operativo inválido.",
        },
        { status: 400 }
      );
    }

    const role =
      roleValue as MemberRole;

    const active =
      typeof body.active ===
      "boolean"
        ? body.active
        : current.active;

    const isPrimary =
      typeof body.isPrimary ===
      "boolean"
        ? body.isPrimary
        : current.isPrimary;

    const membership =
      await prisma.$transaction(
        async (tx) => {
          if (
            isPrimary &&
            active
          ) {
            await tx.operationalOrganizationMember.updateMany({
              where: {
                userId:
                  current.userId,
                id: {
                  not:
                    current.id,
                },
                isPrimary:
                  true,
              },
              data: {
                isPrimary: false,
              },
            });
          }

          return tx.operationalOrganizationMember.update({
            where: {
              id: current.id,
            },
            data: {
              role,
              active,
              isPrimary:
                active
                  ? isPrimary
                  : false,
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  role: true,
                },
              },
            },
          });
        }
      );

    await audit(
      actor,
      "OPERATIONAL_MEMBER_UPDATED",
      `${current.user.name} · ${current.organization.name} · ${role} · ${active ? "ACTIVO" : "INACTIVO"}${membership.isPrimary ? " · PRINCIPAL" : ""}`
    );

    return NextResponse.json({
      success: true,
      membership,
    });
  } catch (error) {
    console.error(
      "Error actualizando miembro operativo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo actualizar la membresía.",
      },
      { status: 500 }
    );
  }
}
