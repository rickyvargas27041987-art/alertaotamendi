import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonths } from "@/lib/subscription";

/*
 * =========================================================
 * VALIDACIÓN OFICIAL DE FIRMA MERCADO PAGO
 * =========================================================
 */

function normalizeValue(
  value: string | null | undefined
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function parseSignatureHeader(header: string): {
  ts?: string;
  hashes: Record<string, string>;
} {
  const hashes: Record<string, string> = {};

  let ts: string | undefined;

  for (const part of header.split(",")) {
    const equalIndex = part.indexOf("=");

    if (equalIndex === -1) {
      continue;
    }

    const key = part
      .substring(0, equalIndex)
      .trim()
      .toLowerCase();

    const value = part
      .substring(equalIndex + 1)
      .trim();

    if (!key || !value) {
      continue;
    }

    if (key === "ts") {
      ts = value;
    } else if (/^v\d+$/.test(key)) {
      hashes[key] = value;
    }
  }

  return {
    ts,
    hashes,
  };
}

function buildManifest(
  dataId: string | undefined,
  requestId: string | undefined,
  ts: string
) {
  const parts: string[] = [];

  if (dataId) {
    parts.push(`id:${dataId}`);
  }

  if (requestId) {
    parts.push(`request-id:${requestId}`);
  }

  parts.push(`ts:${ts}`);

  return parts.join(";") + ";";
}

function constantTimeEquals(
  calculated: string,
  received: string
) {
  if (
    Buffer.byteLength(calculated) !==
    Buffer.byteLength(received)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(calculated),
    Buffer.from(received)
  );
}

function verifySignature(
  request: Request,
  dataId: string
): {
  valid: boolean;
  reason?: string;
} {
  const secret =
    process.env.MERCADOPAGO_WEBHOOK_SECRET;

  /*
   * En producción debe existir.
   */
  if (!secret) {
    return {
      valid: false,
      reason: "SECRET_NOT_CONFIGURED",
    };
  }

  const xSignature = normalizeValue(
    request.headers.get("x-signature")
  );

  const xRequestId = normalizeValue(
    request.headers.get("x-request-id")
  );

  const normalizedDataId =
    normalizeValue(dataId);

  if (!xSignature) {
    return {
      valid: false,
      reason: "MISSING_SIGNATURE",
    };
  }

  const {
    ts,
    hashes,
  } = parseSignatureHeader(xSignature);

  if (!ts) {
    return {
      valid: false,
      reason: "MISSING_TIMESTAMP",
    };
  }

  if (!/^\d+$/.test(ts)) {
    return {
      valid: false,
      reason: "INVALID_TIMESTAMP",
    };
  }

  const receivedHash = hashes.v1;

  if (!receivedHash) {
    return {
      valid: false,
      reason: "MISSING_V1",
    };
  }

  const manifest = buildManifest(
    normalizedDataId,
    xRequestId,
    ts
  );

  const calculatedHash = createHmac(
    "sha256",
    secret
  )
    .update(manifest)
    .digest("hex");

  const valid = constantTimeEquals(
    calculatedHash,
    receivedHash
  );

  if (!valid) {
    /*
     * No mostramos claves, hashes ni request-id.
     * Solo datos seguros para diagnóstico.
     */
    console.warn(
      "Webhook Mercado Pago: firma inválida.",
      {
        reason: "SIGNATURE_MISMATCH",
        hasDataId: Boolean(
          normalizedDataId
        ),
        hasRequestId: Boolean(
          xRequestId
        ),
        hasSignature: Boolean(
          xSignature
        ),
        secretConfigured: true,
        secretLength: secret.length,
        manifestLength:
          manifest.length,
        receivedHashLength:
          receivedHash.length,
        calculatedHashLength:
          calculatedHash.length,
      }
    );

    return {
      valid: false,
      reason: "SIGNATURE_MISMATCH",
    };
  }

  return {
    valid: true,
  };
}

/*
 * =========================================================
 * BUSCAR USUARIO
 * =========================================================
 */

async function findUserByExternalReference(
  externalReference: unknown,
  preapprovalId?: string
) {
  const ref = String(
    externalReference ?? ""
  );

  const match = ref.match(
    /^monitor-user-(\d+)$/
  );

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
        mpPreapprovalId:
          preapprovalId,
      },
    });
  }

  return null;
}

/*
 * =========================================================
 * WEBHOOK
 * =========================================================
 */

export async function POST(
  request: Request
) {
  try {
    const url = new URL(
      request.url
    );

    const body = await request
      .json()
      .catch(() => ({}));

    /*
     * Mercado Pago firma usando data.id
     * recibido en QUERY PARAMS.
     */
    const queryDataId = String(
      url.searchParams.get(
        "data.id"
      ) || ""
    );

    /*
     * ID real del recurso.
     */
    const resourceId = String(
      queryDataId ||
        body?.data?.id ||
        body?.id ||
        ""
    );

    /*
     * Tipo de evento.
     */
    const type = String(
      url.searchParams.get(
        "type"
      ) ||
        body?.type ||
        ""
    );

    /*
     * =====================================================
     * VALIDAR FIRMA
     * =====================================================
     */

    const signatureCheck =
      verifySignature(
        request,
        queryDataId
      );

    if (!signatureCheck.valid) {
      console.warn(
        "Webhook Mercado Pago rechazado:",
        {
          reason:
            signatureCheck.reason,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Firma inválida.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Firma válida.
     */
    if (!resourceId) {
      return NextResponse.json({
        ok: true,
        received: true,
      });
    }

    const token =
      process.env
        .MERCADOPAGO_ACCESS_TOKEN;

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

    if (
      type ===
      "subscription_preapproval"
    ) {
      const response =
        await fetch(
          `https://api.mercadopago.com/preapproval/${encodeURIComponent(
            resourceId
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      /*
       * El simulador usa IDs
       * ficticios como 123456.
       */
      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          simulation: true,
        });
      }

      const subscription =
        await response.json();

      const user =
        await findUserByExternalReference(
          subscription.external_reference,
          String(
            subscription.id ||
              resourceId
          )
        );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
        });
      }

      const mpStatus =
        String(
          subscription.status ||
            ""
        ).toLowerCase();

      let status:
        | "ACTIVE"
        | "PENDING"
        | "SUSPENDED"
        | "CANCELED" =
        "PENDING";

      if (
        mpStatus === "authorized"
      ) {
        status = "ACTIVE";
      } else if (
        mpStatus === "cancelled"
      ) {
        status = "CANCELED";
      } else if (
        mpStatus === "paused"
      ) {
        status = "SUSPENDED";
      }

      await prisma.monitoringUser.update({
        where: {
          id: user.id,
        },

        data: {
          subscriptionStatus:
            status,

          subscriptionStartedAt:
            status === "ACTIVE"
              ? user.subscriptionStartedAt ??
                new Date()
              : user.subscriptionStartedAt,

          subscriptionAutoRenew:
            true,

          mpPreapprovalId:
            String(
              subscription.id ||
                resourceId
            ),

          mpStatus,
        },
      });

      if (
        status !== "ACTIVE"
      ) {
        await prisma.monitorSession.deleteMany(
          {
            where: {
              userId: user.id,
            },
          }
        );
      }
    }

    /*
     * =====================================================
     * PAGO AUTORIZADO DE SUSCRIPCIÓN
     *
     * Este es el evento que vimos
     * realmente en Vercel:
     *
     * subscription_authorized_payment
     * =====================================================
     */

    if (
      type ===
      "subscription_authorized_payment"
    ) {
      const response =
        await fetch(
          `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(
            resourceId
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      /*
       * Simulación.
       */
      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          simulation: true,
        });
      }

      const authorizedPayment =
        await response.json();

      const preapprovalId =
        String(
          authorizedPayment
            .preapproval_id ||
            ""
        );

      const user =
        await findUserByExternalReference(
          authorizedPayment
            .external_reference,
          preapprovalId
        );

      if (!user) {
        return NextResponse.json({
          ok: true,
          received: true,
        });
      }

      const paymentStatus =
        String(
          authorizedPayment
            .payment?.status ||
            authorizedPayment.status ||
            ""
        ).toLowerCase();

      const paymentId =
        String(
          authorizedPayment
            .payment?.id ||
            authorizedPayment.id ||
            resourceId
        );

      if (
        paymentStatus ===
        "approved"
      ) {
        const base =
          new Date();

        const endsAt =
          user.subscriptionPlan ===
          "ANNUAL"
            ? addMonths(
                base,
                12
              )
            : addMonths(
                base,
                1
              );

        await prisma.monitoringUser.update(
          {
            where: {
              id: user.id,
            },

            data: {
              subscriptionStatus:
                "ACTIVE",

              subscriptionStartedAt:
                user.subscriptionStartedAt ??
                base,

              subscriptionEndsAt:
                endsAt,

              subscriptionAutoRenew:
                true,

              mpLastPaymentAt:
                base,

              mpLastPaymentId:
                paymentId,
            },
          }
        );
      } else if (
        [
          "rejected",
          "cancelled",
        ].includes(
          paymentStatus
        )
      ) {
        await prisma.monitoringUser.update(
          {
            where: {
              id: user.id,
            },

            data: {
              subscriptionStatus:
                "PAST_DUE",

              mpLastPaymentId:
                paymentId,
            },
          }
        );

        await prisma.monitorSession.deleteMany(
          {
            where: {
              userId:
                user.id,
            },
          }
        );
      }
    }

    /*
     * =====================================================
     * PAYMENT
     * =====================================================
     */

    if (
      type === "payment"
    ) {
      const response =
        await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
            resourceId
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          simulation: true,
        });
      }

      const payment =
        await response.json();

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

      const paymentStatus =
        String(
          payment.status ||
            ""
        ).toLowerCase();

      if (
        paymentStatus ===
        "approved"
      ) {
        const base =
          new Date();

        const endsAt =
          user.subscriptionPlan ===
          "ANNUAL"
            ? addMonths(
                base,
                12
              )
            : addMonths(
                base,
                1
              );

        await prisma.monitoringUser.update(
          {
            where: {
              id: user.id,
            },

            data: {
              subscriptionStatus:
                "ACTIVE",

              subscriptionStartedAt:
                user.subscriptionStartedAt ??
                base,

              subscriptionEndsAt:
                endsAt,

              subscriptionAutoRenew:
                true,

              mpLastPaymentAt:
                payment.date_approved
                  ? new Date(
                      payment.date_approved
                    )
                  : base,

              mpLastPaymentId:
                String(
                  payment.id ||
                    resourceId
                ),
            },
          }
        );
      } else if (
        [
          "rejected",
          "cancelled",
        ].includes(
          paymentStatus
        )
      ) {
        await prisma.monitoringUser.update(
          {
            where: {
              id: user.id,
            },

            data: {
              subscriptionStatus:
                "PAST_DUE",

              mpLastPaymentId:
                String(
                  payment.id ||
                    resourceId
                ),
            },
          }
        );

        await prisma.monitorSession.deleteMany(
          {
            where: {
              userId:
                user.id,
            },
          }
        );
      }
    }

    /*
     * Mercado Pago espera 200 o 201.
     */
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
