import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonths } from "@/lib/subscription";

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a.trim(), "hex");
    const bb = Buffer.from(b.trim(), "hex");

    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function normalizeSecret(value: string) {
  let secret = value.trim();

  if (
    (secret.startsWith('"') && secret.endsWith('"')) ||
    (secret.startsWith("'") && secret.endsWith("'"))
  ) {
    secret = secret.slice(1, -1).trim();
  }

  return secret;
}

function verifySignature(request: Request, dataId: string) {
  const rawSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!rawSecret) {
    return true;
  }

  const secret = normalizeSecret(rawSecret);

  const signature = (
    request.headers.get("x-signature") || ""
  ).trim();

  const requestId = (
    request.headers.get("x-request-id") || ""
  ).trim();

  const parts: Record<string, string> = {};

  for (const item of signature.split(",")) {
    const index = item.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    if (key && value) {
      parts[key] = value;
    }
  }

  const ts = (parts.ts || "").trim();
  const v1 = (parts.v1 || "").trim();

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

    const body = await request
      .json()
      .catch(() => ({}));

    const queryDataId = String(
      url.searchParams.get("data.id") ||
        url.searchParams.get("data_id") ||
        ""
    ).trim();

    const resourceId = String(
      queryDataId ||
        url.searchParams.get("id") ||
        body?.data?.id ||
        body?.id ||
        ""
    ).trim();

    const type = String(
      url.searchParams.get("type") ||
        body?.type ||
        ""
    ).trim();

    if (!verifySignature(request, queryDataId)) {
      console.warn(
        "Webhook Mercado Pago: firma inválida.",
        {
          hasQueryDataId: Boolean(queryDataId),
          hasRequestId: Boolean(
            request.headers.get("x-request-id")
          ),
          hasSignature: Boolean(
            request.headers.get("x-signature")
          ),
          secretConfigured: Boolean(
            process.env.MERCADOPAGO_WEBHOOK_SECRET
          ),
          secretLength:
            process.env.MERCADOPAGO_WEBHOOK_SECRET
              ? normalizeSecret(
                  process.env.MERCADOPAGO_WEBHOOK_SECRET
                ).length
              : 0,
        }
      );

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

    if (!resourceId) {
      return NextResponse.json({
        ok: true,
        received: true,
      });
    }

    const token =
      process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json({
        ok: true,
        received: true,
        warning:
          "MERCADOPAGO_ACCESS_TOKEN no configurado.",
      });
    }

    /*
     * =====================================================
     * SUSCRIPCIÓN
     * =====================================================
     */
    if (type === "subscription_preapproval") {
      const response = await fetch(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(
          resourceId
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
          note:
            "Notificación recibida. El recurso no existe o pertenece a una simulación.",
        });
      }

      const subscription =
        await response.json();

      const user =
        await findUserByExternalReference(
          subscription.external_reference,
          String(
            subscription.id || resourceId
          )
        );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
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
              ? user.subscriptionStartedAt ??
                new Date()
              : user.subscriptionStartedAt,

          subscriptionAutoRenew: true,

          mpPreapprovalId: String(
            subscription.id || resourceId
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
     * =====================================================
     * PAGO AUTORIZADO DE SUSCRIPCIÓN
     * =====================================================
     */
    if (type === "subscription_authorized_payment") {
      const response = await fetch(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(
          resourceId
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
          note:
            "Pago autorizado recibido. El recurso no existe o pertenece a una simulación.",
        });
      }

      const authorizedPayment =
        await response.json();

      const preapprovalId = String(
        authorizedPayment.preapproval_id || ""
      );

      const user =
        await findUserByExternalReference(
          authorizedPayment.external_reference,
          preapprovalId
        );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
        });
      }

      const paymentStatus = String(
        authorizedPayment.payment?.status || ""
      ).toLowerCase();

      const paymentId = String(
        authorizedPayment.payment?.id ||
          resourceId
      );

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
              user.subscriptionStartedAt ??
              base,

            subscriptionEndsAt: endsAt,

            subscriptionAutoRenew: true,

            mpLastPaymentAt: base,

            mpLastPaymentId: paymentId,
          },
        });
      } else if (
        ["rejected", "cancelled"].includes(
          paymentStatus
        )
      ) {
        await prisma.monitoringUser.update({
          where: {
            id: user.id,
          },
          data: {
            subscriptionStatus:
              "PAST_DUE",

            mpLastPaymentId: paymentId,
          },
        });

        await prisma.monitorSession.deleteMany({
          where: {
            userId: user.id,
          },
        });
      }
    }

    /*
     * =====================================================
     * PAYMENT
     * =====================================================
     */
    if (type === "payment") {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
          resourceId
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
          note:
            "Notificación de pago recibida. El recurso no existe o pertenece a una simulación.",
        });
      }

      const payment = await response.json();

      const user =
        await findUserByExternalReference(
          payment.external_reference
        );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
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
              user.subscriptionStartedAt ??
              base,

            subscriptionEndsAt: endsAt,

            subscriptionAutoRenew: true,

            mpLastPaymentAt:
              payment.date_approved
                ? new Date(
                    payment.date_approved
                  )
                : base,

            mpLastPaymentId: String(
              payment.id || resourceId
            ),
          },
        });
      } else if (
        ["rejected", "cancelled"].includes(
          paymentStatus
        )
      ) {
        await prisma.monitoringUser.update({
          where: {
            id: user.id,
          },
          data: {
            subscriptionStatus:
              "PAST_DUE",

            mpLastPaymentId: String(
              payment.id || resourceId
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
    console.error(
      "Webhook Mercado Pago:",
      error
    );

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
