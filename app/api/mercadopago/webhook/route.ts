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

  // Permite preparar la integración si todavía no se configuró el secret.
  if (!secret) {
    return true;
  }

  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";

  const parts = Object.fromEntries(
    signature
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2)
  );

  const ts = parts.ts || "";
  const v1 = parts.v1 || "";

  if (!ts || !v1) {
    return false;
  }

  let manifest = "";

  if (dataId) {
    manifest += `id:${dataId};`;
  }

  if (requestId) {
    manifest += `request-id:${requestId};`;
  }

  manifest += `ts:${ts};`;

  const calculated = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return safeEqualHex(calculated, v1);
}

async function findUserByExternalReference(
  externalReference: unknown,
  preapprovalId?: string
) {
  const ref = String(externalReference ?? "");

  const match = ref.match(/^monitor-user-(\d+)$/);

  if (match) {
    return prisma.monitoringUser.findUnique({
      where: {
        id: Number(match[1]),
      },
    });
  }

  if (preapprovalId) {
    return prisma.monitoringUser.findFirst({
      where: {
        mpPreapprovalId: preapprovalId,
      },
    });
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);

    const body = await request.json().catch(() => ({}));

    const type = String(
      url.searchParams.get("type") ||
        body?.type ||
        ""
    );

    const dataId = String(
      url.searchParams.get("data.id") ||
        url.searchParams.get("id") ||
        body?.data?.id ||
        ""
    );

    if (!dataId) {
      return NextResponse.json({
        ok: true,
      });
    }

    if (!verifySignature(request, dataId)) {
      console.warn("Webhook Mercado Pago: firma inválida.");

      return NextResponse.json(
        {
          ok: false,
          error: "Firma inválida.",
        },
        {
          status: 401,
        }
      );
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json({
        ok: true,
        warning: "MERCADOPAGO_ACCESS_TOKEN no configurado.",
      });
    }

    /*
     * SUSCRIPCIONES
     */
    if (type === "subscription_preapproval") {
      const response = await fetch(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(
          dataId
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      /*
       * En una simulación de Mercado Pago puede usarse un ID ficticio,
       * por ejemplo 123456. En ese caso Mercado Pago puede devolver 404.
       * El webhook igualmente debe responder 200 para confirmar recepción.
       */
      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          note: "Notificación recibida. El recurso no existe o es de prueba.",
        });
      }

      const subscription = await response.json();

      const user = await findUserByExternalReference(
        subscription.external_reference,
        String(subscription.id || dataId)
      );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
          note: "Suscripción recibida pero no vinculada a un usuario.",
        });
      }

      const mpStatus = String(
        subscription.status || ""
      ).toLowerCase();

      let status:
        | "ACTIVE"
        | "PENDING"
        | "SUSPENDED"
        | "CANCELED" = "PENDING";

      if (mpStatus === "authorized") {
        status = "ACTIVE";
      } else if (mpStatus === "cancelled") {
        status = "CANCELED";
      } else if (mpStatus === "paused") {
        status = "SUSPENDED";
      }

      await prisma.monitoringUser.update({
        where: {
          id: user.id,
        },
        data: {
          subscriptionStatus: status,
          subscriptionStartedAt:
            status === "ACTIVE"
              ? user.subscriptionStartedAt ?? new Date()
              : user.subscriptionStartedAt,

          subscriptionAutoRenew: true,

          mpPreapprovalId: String(
            subscription.id || dataId
          ),

          mpStatus,
        },
      });

      if (status !== "ACTIVE") {
        await prisma.monitorSession.deleteMany({
          where: {
            userId: user.id,
          },
        });
      }
    }

    /*
     * PAGOS
     */
    if (type === "payment") {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
          dataId
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          note: "Notificación de pago recibida. El recurso no existe o es de prueba.",
        });
      }

      const payment = await response.json();

      const user = await findUserByExternalReference(
        payment.external_reference
      );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
          note: "Pago recibido pero no vinculado a un usuario.",
        });
      }

      const paymentStatus = String(
        payment.status || ""
      ).toLowerCase();

      if (paymentStatus === "approved") {
        const base = new Date();

        const endsAt =
          user.subscriptionPlan === "ANNUAL"
            ? addMonths(base, 12)
            : addMonths(base, 1);

        await prisma.monitoringUser.update({
          where: {
            id: user.id,
          },
          data: {
            subscriptionStatus: "ACTIVE",

            subscriptionStartedAt:
              user.subscriptionStartedAt ?? base,

            subscriptionEndsAt: endsAt,

            subscriptionAutoRenew: true,

            mpLastPaymentAt: payment.date_approved
              ? new Date(payment.date_approved)
              : base,

            mpLastPaymentId: String(
              payment.id || dataId
            ),
          },
        });
      } else if (
        ["rejected", "cancelled"].includes(paymentStatus)
      ) {
        await prisma.monitoringUser.update({
          where: {
            id: user.id,
          },
          data: {
            subscriptionStatus: "PAST_DUE",

            mpLastPaymentId: String(
              payment.id || dataId
            ),
          },
        });

        await prisma.monitorSession.deleteMany({
          where: {
            userId: user.id,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      received: true,
    });
  } catch (error) {
    console.error("Webhook Mercado Pago:", error);

    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 500,
      }
    );
  }
}
