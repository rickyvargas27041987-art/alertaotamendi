import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";

export async function GET(request: Request) {
  const actor = await getMonitorActor();

  if (!actor || actor.role !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        error: "No autorizado. Iniciá sesión como administrador.",
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);

  if (url.searchParams.get("crear") !== "SI") {
    return NextResponse.json({
      success: false,
      message:
        "Para crear el plan mensual usá ?crear=SI al final de la dirección.",
    });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: "MERCADOPAGO_ACCESS_TOKEN no está configurado en Vercel.",
      },
      { status: 503 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://alertaotamendi.vercel.app");

  const payload = {
    reason: "Alerta Otamendi - PRUEBA suscripción mensual",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 100,
      currency_id: "ARS",
    },
    back_url: `${origin}/admin/usuarios`,
  };

  const response = await fetch(
    "https://api.mercadopago.com/preapproval_plan",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Error creando plan Mercado Pago:", data);

    return NextResponse.json(
      {
        success: false,
        error: data?.message || "Mercado Pago no pudo crear el plan.",
        details: data,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Plan de prueba mensual creado correctamente.",
    planId: data.id,
    reason: data.reason,
    amount: data.auto_recurring?.transaction_amount,
    currency: data.auto_recurring?.currency_id,
    frequency: data.auto_recurring?.frequency,
    frequencyType: data.auto_recurring?.frequency_type,
  });
}
