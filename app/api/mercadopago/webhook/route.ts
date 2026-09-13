import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonths } from "@/lib/subscription";

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifySignature(request: Request, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // Permite preparar la integración; configurar el secret antes de producción.
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=")).filter((x) => x.length === 2));
  const ts = parts.ts || "";
  const v1 = parts.v1 || "";
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqualHex(calculated, v1);
}

async function findUserByExternalReference(externalReference: unknown, preapprovalId?: string) {
  const ref = String(externalReference ?? "");
  const match = ref.match(/^monitor-user-(\d+)$/);
  if (match) return prisma.monitoringUser.findUnique({ where: { id: Number(match[1]) } });
  if (preapprovalId) return prisma.monitoringUser.findFirst({ where: { mpPreapprovalId: preapprovalId } });
  return null;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || url.searchParams.get("type") || "");
    const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (!dataId) return NextResponse.json({ ok: true });
    if (!verifySignature(request, dataId)) return NextResponse.json({ ok: false }, { status: 401 });

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ ok: true, warning: "MP token no configurado" });

    if (type === "subscription_preapproval") {
      const r = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return NextResponse.json({ ok: true });
      const sub = await r.json();
      const user = await findUserByExternalReference(sub.external_reference, String(sub.id || dataId));
      if (!user) return NextResponse.json({ ok: true });
      const mpStatus = String(sub.status || "").toLowerCase();
      const status = mpStatus === "authorized" ? "ACTIVE" : mpStatus === "cancelled" ? "CANCELED" : mpStatus === "paused" ? "SUSPENDED" : "PENDING";
      await prisma.monitoringUser.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: status,
          subscriptionStartedAt: status === "ACTIVE" ? (user.subscriptionStartedAt ?? new Date()) : user.subscriptionStartedAt,
          subscriptionAutoRenew: true,
          mpPreapprovalId: String(sub.id || dataId),
          mpStatus,
        },
      });
      if (status !== "ACTIVE") await prisma.monitorSession.deleteMany({ where: { userId: user.id } });
    }

    if (type === "payment") {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return NextResponse.json({ ok: true });
      const payment = await r.json();
      const user = await findUserByExternalReference(payment.external_reference);
      if (!user) return NextResponse.json({ ok: true });
      const paymentStatus = String(payment.status || "").toLowerCase();
      if (paymentStatus === "approved") {
        const base = new Date();
        const endsAt = user.subscriptionPlan === "ANNUAL" ? addMonths(base, 12) : addMonths(base, 1);
        await prisma.monitoringUser.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "ACTIVE",
            subscriptionStartedAt: user.subscriptionStartedAt ?? base,
            subscriptionEndsAt: endsAt,
            subscriptionAutoRenew: true,
            mpLastPaymentAt: payment.date_approved ? new Date(payment.date_approved) : base,
            mpLastPaymentId: String(payment.id || dataId),
          },
        });
      } else if (["rejected", "cancelled"].includes(paymentStatus)) {
        await prisma.monitoringUser.update({ where: { id: user.id }, data: { subscriptionStatus: "PAST_DUE", mpLastPaymentId: String(payment.id || dataId) } });
        await prisma.monitorSession.deleteMany({ where: { userId: user.id } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook Mercado Pago:", error);
    // Mercado Pago reintenta si no recibe 2xx; sólo usamos 500 para errores inesperados reales.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
