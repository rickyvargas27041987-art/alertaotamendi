import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperationalSession, operationalAudit } from "@/lib/operationalAccess";

export async function GET() {
  const session = await getOperationalSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Acceso vencido o no autorizado." },
      { status: 401 }
    );
  }

  const count = await prisma.operationalFcmDevice.count({
    where: {
      sessionId: session.id,
      enabled: true,
    },
  });

  return NextResponse.json({
    success: true,
    enabled: count > 0,
    count,
  });
}

export async function POST(request: Request) {
  const session = await getOperationalSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Acceso vencido o no autorizado." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (token.length < 40 || token.length > 4096) {
    return NextResponse.json(
      { success: false, error: "Token FCM inválido." },
      { status: 400 }
    );
  }

  const device = await prisma.operationalFcmDevice.upsert({
    where: { token },
    update: {
      sessionId: session.id,
      enabled: true,
      lastSeenAt: new Date(),
    },
    create: {
      sessionId: session.id,
      token,
      enabled: true,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      enabled: true,
      lastSeenAt: true,
    },
  });

  await operationalAudit(
    session.configId,
    session.officerName,
    "OPERATIONAL_FCM_ENABLED",
    {
      sessionId: session.id,
      details: `${session.agency} · ${session.serviceType}`,
    }
  );

  return NextResponse.json({
    success: true,
    device,
  });
}

export async function DELETE(request: Request) {
  const session = await getOperationalSession();

  if (!session) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (token) {
    await prisma.operationalFcmDevice.updateMany({
      where: {
        sessionId: session.id,
        token,
      },
      data: {
        enabled: false,
      },
    });
  } else {
    await prisma.operationalFcmDevice.updateMany({
      where: {
        sessionId: session.id,
      },
      data: {
        enabled: false,
      },
    });
  }

  await operationalAudit(
    session.configId,
    session.officerName,
    "OPERATIONAL_FCM_DISABLED",
    { sessionId: session.id }
  );

  return NextResponse.json({ success: true });
}
