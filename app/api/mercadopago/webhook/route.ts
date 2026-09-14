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

function verifySignature(
  request: Request,
  queryDataId: string
) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const signature =
    request.headers.get("x-signature") || "";

  const requestId =
    request.headers.get("x-request-id") || "";

  const parts: Record<string, string> = {};

  for (const part of signature.split(",")) {
    const [key, ...valueParts] = part.trim().split("=");

    if (key && valueParts.length > 0) {
      parts[key] = valueParts.join("=");
    }
  }

  const ts = parts.ts || "";
  const v1 = parts.v1 || "";

  if (!ts || !v1) {
    return false;
  }

  /*
   * IMPORTANTE:
   * Mercado Pago firma usando data.id DEL QUERY PARAM.
   *
   * Si data.id no vino en la URL, NO debemos sustituirlo
   * por body.data.id para validar la firma.
   */
  let manifest = "";

  if (queryDataId) {
    manifest += `id:${queryDataId};`;
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

    /*
     * ID usado EXCLUSIVAMENTE para validar la firma.
     *
     * Mercado Pago especifica que debe salir del query param.
     */
    const queryDataId = String(
      url.searchParams.get("data.id") ||
      url.searchParams.get("data_id") ||
      ""
    );

    /*
     * ID del recurso que después utilizamos para consultar
     * Mercado Pago.
     *
     * Aquí sí podemos aceptar distintas variantes,
     * incluido el cuerpo de la simulación.
     */
    const resourceId = String(
      queryDataId ||
      url.searchParams.get("id") ||
      body?.data?.id ||
      body?.id ||
      ""
    );

    const type = String(
      url.searchParams.get("type") ||
      body?.type ||
      ""
    );

    /*
     * Validamos ANTES de procesar cualquier dato.
     *
     * Para la firma usamos solamente queryDataId.
     */
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

    /*
     * Si la firma fue válida pero no encontramos ID,
     * confirmamos recepción.
     */
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
     * SUSCRIPCIONES
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

      /*
       * El simulador usa IDs ficticios como 123456.
       * Puede devolver 404 al consultar ese recurso.
       *
       * Eso NO significa que el webhook haya fallado.
       */
      if (!response.ok) {
        return NextResponse.json({
          ok: true,
          received: true,
          note:
            "Notificación recibida correctamente. El recurso no existe o pertenece a una simulación.",
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
          note:
            "Suscripción recibida pero no vinculada a un usuario del Centro de Monitoreo.",
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
     * PAGOS
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
          note:
            "Pago recibido pero no vinculado a un usuario del Centro de Monitoreo.",
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

    /*
     * Mercado Pago espera 200 o 201 cuando
     * recibimos correctamente la notificación.
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
