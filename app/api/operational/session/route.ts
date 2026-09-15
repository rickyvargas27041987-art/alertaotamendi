import { NextResponse } from "next/server";
import { getOperationalSession, OPERATIONAL_COOKIE, operationalAudit, operationalCookieOptions } from "@/lib/operationalAccess";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false, error: "Acceso vencido o no autorizado." }, { status: 401 });
  return NextResponse.json({
    success: true,
    session: {
      officerName: session.officerName,
      agency: session.agency,
      serviceType: session.serviceType,
      expiresAt: session.expiresAt,
    },
  });
}

export async function DELETE() {
  const session = await getOperationalSession();
  if (session) {
    await prisma.$transaction([
      prisma.operationalPushSubscription.updateMany({ where: { sessionId: session.id }, data: { enabled: false } }),
      prisma.operationalSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    ]);
    await operationalAudit(session.configId, session.officerName, "OPERATIONAL_LOGOUT", { sessionId: session.id });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(OPERATIONAL_COOKIE, "", { ...operationalCookieOptions, maxAge: 0 });
  return response;
}
