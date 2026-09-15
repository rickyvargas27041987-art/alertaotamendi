import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonitorActor } from "@/lib/monitorAuth";
import { recurringTerms } from "@/lib/customPricing";

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const actor = await getMonitorActor();
  if (actor?.role !== "ADMIN") return fail("No autorizado.", 403);
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return fail("Falta configurar MERCADOPAGO_ACCESS_TOKEN.", 503);
  const body = await request.json().catch(() => ({}));
  const userId = Number(body.userId);
  const plan = body.plan;
  if (!Number.isInteger(userId) || userId <= 0 || !["MONTHLY", "ANNUAL"].includes(plan)) return fail("Usuario o plan inválido.", 400);
  const user = await prisma.monitoringUser.findUnique({ where: { id: userId } });
  if (!user) return fail("Usuario no encontrado.", 404);
  if (!user.active || user.role === "ADMIN") return fail("Solo se puede cobrar a operadores activos.", 400);
  if (!user.billingEmail) return fail("Primero cargá el email de facturación.", 400);
  const cents = plan === "MONTHLY" ? user.customMonthlyCents : user.customAnnualCents;
  if (cents === null || cents <= 0) return fail("Primero guardá el precio personalizado de este período.", 400);
  if (body.confirmedCents !== cents) return fail("El precio cambió. Actualizá la página y confirmá el nuevo importe.", 409);

  // Recuperar el mismo enlace, nunca generar otra suscripción por un doble clic.
  if (user.mpPreapprovalId) {
    if (user.mpStatus === "pending" && user.customCheckoutUrl && user.customCheckoutCents === cents && user.customCheckoutPlan === plan) {
      return NextResponse.json({ success: true, checkoutUrl: user.customCheckoutUrl, reused: true });
    }
    return fail("Este Centro ya tiene una suscripción vinculada. Los precios guardados no la modifican. Revisá el contrato existente en Mercado Pago antes de reemplazarlo.", 409);
  }
  if (user.customCheckoutState) return fail("Hay una solicitud de cobro en proceso o pendiente de revisión. No generes otra: verificá primero Mercado Pago.", 409);

  // Reserva persistente y atómica, compartida por las instancias de Vercel.
  const claimed = await prisma.monitoringUser.updateMany({
    where: { id: userId, mpPreapprovalId: null, customCheckoutState: null,
      active: true, billingEmail: user.billingEmail,
      ...(plan === "MONTHLY" ? { customMonthlyCents: cents } : { customAnnualCents: cents }) },
    data: { customCheckoutState: "CREATING", customCheckoutCents: cents, customCheckoutPlan: plan },
  });
  if (claimed.count !== 1) return fail("Otro cobro está en curso o cambió la configuración. Actualizá la página.", 409);

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || "https://www.alertaotamendi.com";
    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        reason: `Alerta Otamendi - ${plan === "MONTHLY" ? "Mensual" : "Anual"} - ${user.name}`,
        external_reference: `monitor-user-${userId}`,
        payer_email: user.billingEmail,
        auto_recurring: recurringTerms(plan, cents),
        back_url: `${origin}/admin/usuarios`,
        status: "pending",
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error("Mercado Pago no confirmó la creación.");
    const checkoutUrl = result.init_point || result.sandbox_init_point;
    if (typeof checkoutUrl !== "string" || !checkoutUrl.startsWith("https://")) throw new Error("No se recibió un enlace válido.");
    await prisma.$transaction(async (tx) => {
      // No sobrescribir una autorización que pudo llegar antes por webhook.
      const latest = await tx.monitoringUser.findUniqueOrThrow({ where: { id: userId } });
      const alreadyAuthorized = latest.mpPreapprovalId === String(result.id) && latest.mpStatus === "authorized";
      await tx.monitoringUser.update({ where: { id: userId }, data: {
        subscriptionPlan: plan,
        ...(alreadyAuthorized ? {} : { subscriptionStatus: "PENDING", mpStatus: String(result.status || "pending") }),
        subscriptionAutoRenew: true,
        mpPreapprovalId: String(result.id), mpPlanId: null,
        customCheckoutState: "CREATED", customCheckoutUrl: checkoutUrl,
      } });
      await tx.auditLog.create({ data: {
        userId: actor.id, actorName: actor.name, actorUsername: actor.username,
        action: "SUBSCRIPTION_CHECKOUT_CREATED",
        details: JSON.stringify({ userId, plan, amountCents: cents, currency: "ARS", preapprovalId: result.id }),
      } });
    });
    return NextResponse.json({ success: true, checkoutUrl, preapprovalId: result.id, amountCents: cents });
  } catch {
    await prisma.monitoringUser.updateMany({
      where: { id: userId, customCheckoutState: "CREATING" },
      data: { customCheckoutState: "REVIEW_REQUIRED" },
    });
    return fail("No se pudo confirmar el enlace. Para evitar cobros duplicados, la solicitud quedó bloqueada para revisión en Mercado Pago.", 502);
  }
}
