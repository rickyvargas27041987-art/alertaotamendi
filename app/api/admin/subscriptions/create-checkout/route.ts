import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getMonitorActor } from "@/lib/monitorAuth";
import { normalizePlan } from "@/lib/subscription";

async function requireAdmin() {
  const actor = await getMonitorActor();
  return actor?.role === "ADMIN" ? actor : null;
}

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ success: false, error: "Falta configurar MERCADOPAGO_ACCESS_TOKEN en Vercel." }, { status: 503 });
  }

  const body = await request.json();
  const userId = Number(body.userId);
  const plan = normalizePlan(body.plan);
  if (!Number.isInteger(userId) || !["MONTHLY", "ANNUAL"].includes(plan)) {
    return NextResponse.json({ success: false, error: "Usuario o plan inválido." }, { status: 400 });
  }

  const user = await prisma.monitoringUser.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ success: false, error: "Usuario no encontrado." }, { status: 404 });
  if (!user.billingEmail) return NextResponse.json({ success: false, error: "Primero cargá el email de facturación del usuario." }, { status: 400 });

  const planId = plan === "MONTHLY" ? process.env.MERCADOPAGO_PLAN_MONTHLY_ID : process.env.MERCADOPAGO_PLAN_ANNUAL_ID;
  if (!planId) {
    return NextResponse.json({ success: false, error: `Falta configurar el plan ${plan === "MONTHLY" ? "mensual" : "anual"} de Mercado Pago en Vercel.` }, { status: 503 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://alertaotamendi.vercel.app");
  const payload = {
    preapproval_plan_id: planId,
    reason: plan === "MONTHLY" ? "Alerta Otamendi - Centro de Monitoreo Mensual" : "Alerta Otamendi - Centro de Monitoreo Anual",
    external_reference: `monitor-user-${user.id}`,
    payer_email: user.billingEmail,
    back_url: `${origin}/admin/login`,
    status: "pending",
  };

  const mp = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await mp.json().catch(() => ({}));
  if (!mp.ok) {
    console.error("Mercado Pago create preapproval:", data);
    return NextResponse.json({ success: false, error: data?.message || "Mercado Pago no pudo crear la suscripción." }, { status: 502 });
  }

  await prisma.monitoringUser.update({
    where: { id: user.id },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: "PENDING",
      subscriptionAutoRenew: true,
      billingEmail: user.billingEmail,
      mpPreapprovalId: data.id ? String(data.id) : null,
      mpPlanId: planId,
      mpStatus: data.status ? String(data.status) : "pending",
    },
  });
  await audit(actor, "SUBSCRIPTION_CHECKOUT_CREATED", `Usuario #${user.id} - ${plan} - MP ${data.id ?? "sin id"}`);

  const checkoutUrl = data.init_point || data.sandbox_init_point;
  return NextResponse.json({ success: true, checkoutUrl, preapprovalId: data.id, status: data.status });
}
