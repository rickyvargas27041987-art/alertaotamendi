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

  if (!actor) {
    return NextResponse.json(
      { success: false, error: "No autorizado." },
      { status: 403 }
    );
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: "Falta configurar MERCADOPAGO_ACCESS_TOKEN en Vercel.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const userId = Number(body.userId);
  const plan = normalizePlan(body.plan);

  if (!Number.isInteger(userId) || !["MONTHLY", "ANNUAL"].includes(plan)) {
    return NextResponse.json(
      { success: false, error: "Usuario o plan inválido." },
      { status: 400 }
    );
  }

  const user = await prisma.monitoringUser.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Usuario no encontrado." },
      { status: 404 }
    );
  }

  if (!user.billingEmail) {
    return NextResponse.json(
      {
        success: false,
        error: "Primero cargá el email de facturación del usuario.",
      },
      { status: 400 }
    );
  }

  /*
   * Usamos el plan guardado en Vercel solamente como FUENTE
   * de importe, moneda y frecuencia.
   *
   * No enviamos preapproval_plan_id al crear la suscripción.
   * De esta forma Mercado Pago permite crearla en estado
   * "pending" sin exigir card_token_id y devuelve init_point,
   * donde el usuario carga/autoriza su medio de pago.
   */
  const planId =
    plan === "MONTHLY"
      ? process.env.MERCADOPAGO_PLAN_MONTHLY_ID
      : process.env.MERCADOPAGO_PLAN_ANNUAL_ID;

  if (!planId) {
    return NextResponse.json(
      {
        success: false,
        error: `Falta configurar el plan ${
          plan === "MONTHLY" ? "mensual" : "anual"
        } de Mercado Pago en Vercel.`,
      },
      { status: 503 }
    );
  }

  /*
   * Primero consultamos el plan para copiar su configuración.
   */
  const planResponse = await fetch(
    `https://api.mercadopago.com/preapproval_plan/${encodeURIComponent(planId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const planData = await planResponse.json().catch(() => ({}));

  if (!planResponse.ok) {
    console.error("Mercado Pago get preapproval plan:", planData);

    return NextResponse.json(
      {
        success: false,
        error:
          planData?.message ||
          "Mercado Pago no pudo consultar la configuración del plan.",
      },
      { status: 502 }
    );
  }

  const autoRecurring = planData?.auto_recurring;
  const frequency = Number(autoRecurring?.frequency);
  const frequencyType = String(autoRecurring?.frequency_type || "");
  const transactionAmount = Number(autoRecurring?.transaction_amount);
  const currencyId = String(autoRecurring?.currency_id || "ARS");

  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !frequencyType ||
    !Number.isFinite(transactionAmount) ||
    transactionAmount <= 0
  ) {
    console.error("Plan Mercado Pago incompleto:", {
      planId,
      autoRecurring,
    });

    return NextResponse.json(
      {
        success: false,
        error:
          "El plan de Mercado Pago no tiene una frecuencia o importe válido.",
      },
      { status: 502 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://alertaotamendi.vercel.app");

  /*
   * IMPORTANTE:
   * Esta suscripción se crea SIN plan asociado y en estado pending.
   * Mercado Pago devuelve init_point para que el usuario complete
   * el checkout y autorice el cobro recurrente.
   *
   * external_reference nos permite identificar exactamente al
   * usuario cuando Mercado Pago envía el webhook.
   */
  const payload = {
    reason:
      plan === "MONTHLY"
        ? "Alerta Otamendi - Centro de Monitoreo Mensual"
        : "Alerta Otamendi - Centro de Monitoreo Anual",
    external_reference: `monitor-user-${user.id}`,
    payer_email: user.billingEmail,
    auto_recurring: {
      frequency,
      frequency_type: frequencyType,
      transaction_amount: transactionAmount,
      currency_id: currencyId,
    },
    back_url: `${origin}/admin/usuarios`,
    status: "pending",
  };

  const mp = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await mp.json().catch(() => ({}));

  if (!mp.ok) {
    console.error("Mercado Pago create pending preapproval:", data);

    return NextResponse.json(
      {
        success: false,
        error:
          data?.message || "Mercado Pago no pudo crear la suscripción.",
      },
      { status: 502 }
    );
  }

  const checkoutUrl = data?.init_point || data?.sandbox_init_point || null;

  if (!checkoutUrl) {
    console.error("Mercado Pago no devolvió init_point:", data);

    return NextResponse.json(
      {
        success: false,
        error:
          "Mercado Pago creó la suscripción, pero no devolvió el enlace de checkout.",
      },
      { status: 502 }
    );
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

  await audit(
    actor,
    "SUBSCRIPTION_CHECKOUT_CREATED",
    `Usuario #${user.id} - ${plan} - MP ${data.id ?? "sin id"}`
  );

  return NextResponse.json({
    success: true,
    checkoutUrl,
    preapprovalId: data.id,
    status: data.status,
  });
}
