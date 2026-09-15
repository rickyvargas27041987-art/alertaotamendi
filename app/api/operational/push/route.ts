import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperationalSession, operationalAudit } from "@/lib/operationalAccess";

export async function GET() {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  const count = await prisma.operationalPushSubscription.count({ where: { sessionId: session.id, enabled: true } });
  return NextResponse.json({ success: true, enabled: count > 0 });
}

export async function POST(request: Request) {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false, error: "Acceso vencido o no autorizado." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.p256dh ?? "");
  const auth = String(body.auth ?? "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ success: false, error: "Suscripción incompleta." }, { status: 400 });
  }

  await prisma.operationalPushSubscription.upsert({
    where: { endpoint },
    update: { sessionId: session.id, p256dh, auth, enabled: true },
    create: { sessionId: session.id, endpoint, p256dh, auth, enabled: true },
  });
  await operationalAudit(session.configId, session.officerName, "OPERATIONAL_PUSH_ENABLED", { sessionId: session.id });
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await getOperationalSession();
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  await prisma.operationalPushSubscription.updateMany({ where: { sessionId: session.id }, data: { enabled: false } });
  await operationalAudit(session.configId, session.officerName, "OPERATIONAL_PUSH_DISABLED", { sessionId: session.id });
  return NextResponse.json({ success: true });
}
