import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { sendFcmNotification } from "@/lib/fcm";
import { sendWebPush } from "@/lib/webPush";

const DEFAULT_SMN_CAP_URL = "https://ssl.smn.gob.ar/CAP/AR.php";
const SOURCE_KEY = "SMN_CAP";

type AnyObject = Record<string, any>;

type ParsedArea = {
  description: string | null;
  polygons: number[][][];
  circles: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }[];
  geocodes: {
    name: string;
    value: string;
  }[];
};

type ParsedCapAlert = {
  externalId: string;
  sender: string | null;
  messageStatus: string | null;
  messageType: string | null;
  scope: string | null;
  references: string[];
  incidents: string[];

  category: string | null;
  event: string;
  urgency: string | null;
  severity: string | null;
  certainty: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  sourceWeb: string | null;

  sentAt: Date | null;
  effectiveAt: Date | null;
  onsetAt: Date | null;
  expiresAt: Date | null;

  areaDescription: string | null;
  areas: ParsedArea[];

  fingerprint: string;
  active: boolean;

  raw: AnyObject;
};

/* =========================================================
   XML
========================================================= */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    const object = value as AnyObject;

    if (typeof object["#text"] === "string") {
      const text = object["#text"].trim();
      return text || null;
    }
  }

  return null;
}

function parseDate(value: unknown): Date | null {
  const text = textValue(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeForJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

/* =========================================================
   CAP - ÁREAS
========================================================= */

function parsePolygon(value: unknown): number[][] {
  const text = textValue(value);
  if (!text) return [];

  return text
    .split(/\s+/)
    .map((pair) => {
      const [latText, lonText] = pair.split(",");

      const latitude = Number(latText);
      const longitude = Number(lonText);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return null;
      }

      return [latitude, longitude];
    })
    .filter(
      (point): point is number[] =>
        Array.isArray(point) && point.length === 2
    );
}

function parseCircle(value: unknown) {
  const text = textValue(value);
  if (!text) return null;

  const parts = text.split(/\s+/);
  if (parts.length < 2) return null;

  const [latText, lonText] = parts[0].split(",");

  const latitude = Number(latText);
  const longitude = Number(lonText);
  const radiusKm = Number(parts[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(radiusKm)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    radiusKm,
  };
}

function parseArea(area: AnyObject): ParsedArea {
  const polygons = asArray(area?.polygon)
    .map(parsePolygon)
    .filter((polygon) => polygon.length >= 3);

  const circles = asArray(area?.circle)
    .map(parseCircle)
    .filter(
      (
        circle
      ): circle is {
        latitude: number;
        longitude: number;
        radiusKm: number;
      } => circle !== null
    );

  const geocodes = asArray(area?.geocode)
    .map((geocode: AnyObject) => ({
      name:
        textValue(geocode?.valueName) ||
        "",
      value:
        textValue(geocode?.value) ||
        "",
    }))
    .filter(
      (geocode) =>
        geocode.name ||
        geocode.value
    );

  return {
    description:
      textValue(area?.areaDesc),

    polygons,
    circles,
    geocodes,
  };
}

/* =========================================================
   CAP - INFO
========================================================= */

function chooseInfo(alert: AnyObject) {
  const infos =
    asArray<AnyObject>(
      alert?.info
    );

  if (infos.length === 0) {
    return {};
  }

  const spanish = infos.find((info) => {
    const language =
      textValue(info?.language)?.toLowerCase() ||
      "";

    return (
      language.startsWith("es") ||
      language.includes("spanish") ||
      language.includes("castilian")
    );
  });

  return spanish || infos[0];
}

function splitCapList(value: unknown) {
  const text = textValue(value);
  if (!text) return [];

  return text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCapAlert(alert: AnyObject): ParsedCapAlert {
  const info = chooseInfo(alert);

  const areas =
    asArray<AnyObject>(
      info?.area
    ).map(parseArea);

  const category = asArray(
    info?.category
  )
    .map(textValue)
    .filter(
      (item): item is string =>
        Boolean(item)
    )
    .join(", ");

  const event =
    textValue(info?.event) ||
    "Alerta meteorológica";

  const rawIdentifier =
    textValue(alert?.identifier);

  const raw = normalizeForJson(alert);

  const fallbackId = sha256(
    JSON.stringify({
      sender:
        textValue(alert?.sender),
      sent:
        textValue(alert?.sent),
      event,
      areas,
    })
  ).slice(0, 40);

  const externalId =
    rawIdentifier ||
    `smn-${fallbackId}`;

  const sentAt =
    parseDate(alert?.sent);

  const effectiveAt =
    parseDate(info?.effective);

  const onsetAt =
    parseDate(info?.onset);

  const expiresAt =
    parseDate(info?.expires);

  const messageStatus =
    textValue(alert?.status);

  const messageType =
    textValue(alert?.msgType);

  const now = Date.now();

  const expired =
    expiresAt !== null &&
    expiresAt.getTime() <= now;

  const cancelled =
    messageType?.toLowerCase() ===
    "cancel";

  const testMessage =
    messageStatus !== null &&
    !["actual"].includes(
      messageStatus.toLowerCase()
    );

  const active =
    !expired &&
    !cancelled &&
    !testMessage;

  const fingerprint = sha256(
    JSON.stringify({
      externalId,
      messageStatus,
      messageType,
      event,
      urgency:
        textValue(info?.urgency),
      severity:
        textValue(info?.severity),
      certainty:
        textValue(info?.certainty),
      headline:
        textValue(info?.headline),
      description:
        textValue(info?.description),
      instruction:
        textValue(info?.instruction),
      effective:
        effectiveAt?.toISOString() ||
        null,
      onset:
        onsetAt?.toISOString() ||
        null,
      expires:
        expiresAt?.toISOString() ||
        null,
      areas,
    })
  );

  return {
    externalId,

    sender:
      textValue(alert?.sender),

    messageStatus,

    messageType,

    scope:
      textValue(alert?.scope),

    references:
      splitCapList(
        alert?.references
      ),

    incidents:
      splitCapList(
        alert?.incidents
      ),

    category:
      category || null,

    event,

    urgency:
      textValue(info?.urgency),

    severity:
      textValue(info?.severity),

    certainty:
      textValue(info?.certainty),

    headline:
      textValue(info?.headline),

    description:
      textValue(info?.description),

    instruction:
      textValue(info?.instruction),

    sourceWeb:
      textValue(info?.web),

    sentAt,
    effectiveAt,
    onsetAt,
    expiresAt,

    areaDescription:
      areas
        .map((area) => area.description)
        .filter(Boolean)
        .join(" · ") || null,

    areas,

    fingerprint,
    active,
    raw,
  };
}

/* =========================================================
   GEOLOCALIZACIÓN
========================================================= */

function pointInPolygon(
  latitude: number,
  longitude: number,
  polygon: number[][]
) {
  let inside = false;

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];

    const yj = polygon[j][0];
    const xj = polygon[j][1];

    const intersects =
      yi > latitude !==
        yj > latitude &&
      longitude <
        ((xj - xi) *
          (latitude - yi)) /
          (yj - yi || Number.EPSILON) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) * Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function textMatchesArea(
  areaDescription: string | null,
  province: string | null,
  district: string | null,
  locality: string | null
) {
  if (!areaDescription) return false;

  const haystack =
    areaDescription.toLowerCase();

  return [province, district, locality]
    .filter(
      (item): item is string =>
        Boolean(item?.trim())
    )
    .some((item) =>
      haystack.includes(
        item.toLowerCase().trim()
      )
    );
}

function targetIsAffected(
  latitude: number,
  longitude: number,
  province: string | null,
  district: string | null,
  locality: string | null,
  alert: ParsedCapAlert
) {
  let hasCoordinates = false;

  for (const area of alert.areas) {
    for (const polygon of area.polygons) {
      hasCoordinates = true;

      if (
        pointInPolygon(
          latitude,
          longitude,
          polygon
        )
      ) {
        return true;
      }
    }

    for (const circle of area.circles) {
      hasCoordinates = true;

      if (
        distanceKm(
          latitude,
          longitude,
          circle.latitude,
          circle.longitude
        ) <= circle.radiusKm
      ) {
        return true;
      }
    }
  }

  /*
   * Si el CAP trae geometría, esa geometría manda.
   * Si no la trae, usamos como respaldo los nombres
   * administrativos guardados en el dispositivo.
   */
  if (hasCoordinates) {
    return false;
  }

  return textMatchesArea(
    alert.areaDescription,
    province,
    district,
    locality
  );
}

/* =========================================================
   MENSAJE
========================================================= */

function pushPriority(
  severity: string | null
): "critical" | "high" | "normal" {
  const value =
    severity?.toLowerCase() || "";

  if (value === "extreme") {
    return "critical";
  }

  if (value === "severe") {
    return "high";
  }

  return "normal";
}

function notificationTitle(
  alert: ParsedCapAlert
) {
  if (
    alert.severity?.toLowerCase() ===
    "extreme"
  ) {
    return "🚨 Alerta meteorológica oficial";
  }

  if (
    alert.severity?.toLowerCase() ===
    "severe"
  ) {
    return "⚠️ Alerta meteorológica oficial";
  }

  return "🌦️ Aviso meteorológico oficial";
}

function notificationBody(
  alert: ParsedCapAlert
) {
  const headline =
    alert.headline?.trim();

  if (headline) {
    return headline.slice(0, 220);
  }

  const area =
    alert.areaDescription?.trim();

  if (area) {
    return `${alert.event} · ${area}`.slice(
      0,
      220
    );
  }

  return alert.event.slice(0, 220);
}

/* =========================================================
   ENTREGA
========================================================= */

async function deliveryExists(
  weatherAlertId: number,
  channel: string,
  targetId: number,
  fingerprint: string
) {
  const existing =
    await prisma.weatherNotificationDelivery.findFirst(
      {
        where: {
          weatherAlertId,
          channel,
          targetId,
          fingerprint,
        },
        select: {
          id: true,
        },
      }
    );

  return Boolean(existing);
}

async function notifyAlert(
  weatherAlertId: number,
  alert: ParsedCapAlert
) {
  const [
    webSubscriptions,
    fcmDevices,
  ] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: {
        enabled: true,
      },
    }),

    prisma.fcmDevice.findMany({
      where: {
        enabled: true,
      },
    }),
  ]);

  const webTargets =
    webSubscriptions.filter(
      (target) =>
        targetIsAffected(
          target.latitude,
          target.longitude,
          target.province,
          target.district,
          target.locality,
          alert
        )
    );

  const fcmTargets =
    fcmDevices.filter(
      (target) =>
        targetIsAffected(
          target.latitude,
          target.longitude,
          target.province,
          target.district,
          target.locality,
          alert
        )
    );

  const title =
    notificationTitle(alert);

  const body =
    notificationBody(alert);

  const priority =
    pushPriority(alert.severity);

  let sent = 0;
  let failed = 0;
  let targeted = 0;

  for (const target of webTargets) {
    const duplicate =
      await deliveryExists(
        weatherAlertId,
        "WEB_PUSH",
        target.id,
        alert.fingerprint
      );

    if (duplicate) continue;

    targeted++;

    const delivery =
      await prisma.weatherNotificationDelivery.create(
        {
          data: {
            weatherAlertId,
            channel:
              "WEB_PUSH",
            targetId:
              target.id,
            fingerprint:
              alert.fingerprint,
            status:
              "pending",
            attempts: 1,
            lastAttemptAt:
              new Date(),
          },
        }
      );

    try {
      const result =
        await sendWebPush(
          {
            endpoint:
              target.endpoint,
            p256dh:
              target.p256dh,
            auth:
              target.auth,
          },
          {
            title,
            body,
            url: "/",
            tag:
              `weather-${weatherAlertId}`,
            priority,
            channel:
              "public",
          }
        );

      if (result.ok) {
        sent++;

        await prisma.weatherNotificationDelivery.update(
          {
            where: {
              id: delivery.id,
            },
            data: {
              status: "sent",
              sentAt:
                new Date(),
            },
          }
        );
      } else {
        failed++;

        const expired =
          result.status === 404 ||
          result.status === 410;

        if (expired) {
          await prisma.pushSubscription.update(
            {
              where: {
                id: target.id,
              },
              data: {
                enabled: false,
              },
            }
          );
        }

        await prisma.weatherNotificationDelivery.update(
          {
            where: {
              id: delivery.id,
            },
            data: {
              status:
                expired
                  ? "expired"
                  : "failed",
              lastError:
                String(
                  result.text ||
                    `HTTP ${result.status}`
                ).slice(0, 1000),
            },
          }
        );
      }
    } catch (error) {
      failed++;

      await prisma.weatherNotificationDelivery.update(
        {
          where: {
            id: delivery.id,
          },
          data: {
            status: "failed",
            lastError:
              error instanceof Error
                ? error.message.slice(
                    0,
                    1000
                  )
                : "Error enviando Web Push",
          },
        }
      );
    }
  }

  for (const target of fcmTargets) {
    const duplicate =
      await deliveryExists(
        weatherAlertId,
        "FCM",
        target.id,
        alert.fingerprint
      );

    if (duplicate) continue;

    targeted++;

    const delivery =
      await prisma.weatherNotificationDelivery.create(
        {
          data: {
            weatherAlertId,
            channel: "FCM",
            targetId:
              target.id,
            fingerprint:
              alert.fingerprint,
            status:
              "pending",
            attempts: 1,
            lastAttemptAt:
              new Date(),
          },
        }
      );

    try {
      const result =
        await sendFcmNotification(
          target.token,
          {
            title,
            body,
            url: "/",
            tag:
              `weather-${weatherAlertId}`,
            priority,
            channel:
              "public",
          }
        );

      if (result.ok) {
        sent++;

        await prisma.weatherNotificationDelivery.update(
          {
            where: {
              id: delivery.id,
            },
            data: {
              status: "sent",
              sentAt:
                new Date(),
            },
          }
        );
      } else {
        failed++;

        if (result.invalidToken) {
          await prisma.fcmDevice.update(
            {
              where: {
                id: target.id,
              },
              data: {
                enabled: false,
              },
            }
          );
        }

        await prisma.weatherNotificationDelivery.update(
          {
            where: {
              id: delivery.id,
            },
            data: {
              status:
                result.invalidToken
                  ? "expired"
                  : "failed",
              lastError:
                `Firebase HTTP ${result.status}`.slice(
                  0,
                  1000
                ),
            },
          }
        );
      }
    } catch (error) {
      failed++;

      await prisma.weatherNotificationDelivery.update(
        {
          where: {
            id: delivery.id,
          },
          data: {
            status: "failed",
            lastError:
              error instanceof Error
                ? error.message.slice(
                    0,
                    1000
                  )
                : "Error enviando FCM",
          },
        }
      );
    }
  }

  return {
    targeted,
    sent,
    failed,
  };
}

/* =========================================================
   FEED SMN
========================================================= */

function linkFromItem(item: AnyObject) {
  const values = [
    item?.link,
    item?.guid,
    item?.id,
  ];

  for (const value of values) {
    if (
      typeof value === "object" &&
      value !== null
    ) {
      const href =
        textValue(
          (value as AnyObject)[
            "@_href"
          ]
        );

      if (href) return href;
    }

    const text =
      textValue(value);

    if (text?.startsWith("http")) {
      return text;
    }
  }

  return null;
}

function capDocumentsFromXml(
  xml: string
) {
  const document =
    parser.parse(xml);

  if (document?.alert) {
    return {
      alerts: [
        document.alert as AnyObject,
      ],
      links: [] as string[],
    };
  }

  const rssItems =
    asArray<AnyObject>(
      document?.rss?.channel?.item
    );

  const atomEntries =
    asArray<AnyObject>(
      document?.feed?.entry
    );

  const links = [
    ...rssItems,
    ...atomEntries,
  ]
    .map(linkFromItem)
    .filter(
      (link): link is string =>
        Boolean(link)
    );

  return {
    alerts: [] as AnyObject[],
    links,
  };
}

function allowedFeedUrl(
  value: string,
  sourceUrl: string
) {
  try {
    const url = new URL(value);
    const source =
      new URL(sourceUrl);

    if (url.protocol !== "https:") {
      return false;
    }

    return (
      url.hostname ===
        source.hostname ||
      url.hostname ===
        "ssl.smn.gob.ar" ||
      url.hostname ===
        "www.smn.gob.ar" ||
      url.hostname ===
        "smn.gob.ar"
    );
  } catch {
    return false;
  }
}

async function fetchText(
  url: string,
  headers?: HeadersInit
) {
  return fetch(url, {
    headers: {
      Accept:
        "application/xml,text/xml,application/rss+xml,application/atom+xml,*/*",
      "User-Agent":
        "AlertaOtamendi/1.0",
      ...headers,
    },
    cache: "no-store",
    signal:
      AbortSignal.timeout(
        20_000
      ),
  });
}

/* =========================================================
   SINCRONIZACIÓN PRINCIPAL
========================================================= */

export async function syncWeatherAlerts() {
  const sourceUrl =
    process.env.SMN_CAP_FEED_URL?.trim() ||
    DEFAULT_SMN_CAP_URL;

  const sourceState =
    await prisma.weatherSourceState.findUnique(
      {
        where: {
          sourceKey:
            SOURCE_KEY,
        },
      }
    );

  /*
   * Primera sincronización:
   * se guardan alertas pero NO se envían notificaciones.
   * Esto evita bombardear teléfonos con alertas anteriores.
   */
  const baseline =
    !sourceState?.lastSuccessAt;

  const syncRun =
    await prisma.weatherSyncRun.create(
      {
        data: {
          source: "SMN",
          feed: sourceUrl,
          status: "running",
        },
      }
    );

  try {
    const conditionalHeaders: HeadersInit =
      {};

    if (sourceState?.etag) {
      conditionalHeaders[
        "If-None-Match"
      ] = sourceState.etag;
    }

    if (
      sourceState?.lastModified
    ) {
      conditionalHeaders[
        "If-Modified-Since"
      ] =
        sourceState.lastModified;
    }

    const feedResponse =
      await fetchText(
        sourceUrl,
        conditionalHeaders
      );

    if (
      feedResponse.status === 304
    ) {
      const now = new Date();

      await prisma.weatherSourceState.upsert(
        {
          where: {
            sourceKey:
              SOURCE_KEY,
          },
          create: {
            sourceKey:
              SOURCE_KEY,
            source: "SMN",
            feed: sourceUrl,
            endpoint:
              sourceUrl,
            lastAttemptAt:
              now,
            lastSuccessAt:
              now,
            consecutiveFailures:
              0,
            lastHttpStatus:
              304,
            lastError:
              null,
          },
          update: {
            lastAttemptAt:
              now,
            lastSuccessAt:
              now,
            consecutiveFailures:
              0,
            lastHttpStatus:
              304,
            lastError:
              null,
          },
        }
      );

      await prisma.weatherSyncRun.update(
        {
          where: {
            id: syncRun.id,
          },
          data: {
            status: "success",
            httpStatus: 304,
            finishedAt: now,
          },
        }
      );

      return {
        success: true,
        unchanged: true,
        baseline,
      };
    }

    if (!feedResponse.ok) {
      throw new Error(
        `SMN respondió HTTP ${feedResponse.status}.`
      );
    }

    const feedXml =
      await feedResponse.text();

    const feed =
      capDocumentsFromXml(
        feedXml
      );

    const alerts: AnyObject[] = [
      ...feed.alerts,
    ];

    const links = Array.from(
      new Set(feed.links)
    )
      .filter((link) =>
        allowedFeedUrl(
          link,
          sourceUrl
        )
      )
      .slice(0, 100);

    for (const link of links) {
      try {
        const response =
          await fetchText(link);

        if (!response.ok) {
          console.warn(
            `[WEATHER] CAP ${link} respondió ${response.status}.`
          );
          continue;
        }

        const xml =
          await response.text();

        const parsed =
          capDocumentsFromXml(
            xml
          );

        alerts.push(
          ...parsed.alerts
        );
      } catch (error) {
        console.error(
          `[WEATHER] Error leyendo CAP ${link}:`,
          error
        );
      }
    }

    let itemsProcessed = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    let notificationsTargeted =
      0;

    let notificationsSent =
      0;

    let notificationsFailed =
      0;

    for (const rawAlert of alerts) {
      const parsed =
        parseCapAlert(
          rawAlert
        );

      itemsProcessed++;

      const existing =
        await prisma.weatherAlert.findUnique(
          {
            where: {
              externalId:
                parsed.externalId,
            },
          }
        );

      const changed =
        !existing ||
        existing.fingerprint !==
          parsed.fingerprint;

      const saved =
        await prisma.weatherAlert.upsert(
          {
            where: {
              externalId:
                parsed.externalId,
            },
            create: {
              source: "SMN",
              externalId:
                parsed.externalId,

              kind: "ALERTA",

              sender:
                parsed.sender,
              messageStatus:
                parsed.messageStatus,
              messageType:
                parsed.messageType,
              scope:
                parsed.scope,
              references:
                parsed.references,
              incidents:
                parsed.incidents,

              category:
                parsed.category,
              event:
                parsed.event,
              urgency:
                parsed.urgency,
              severity:
                parsed.severity,
              certainty:
                parsed.certainty,
              headline:
                parsed.headline,
              description:
                parsed.description,
              instruction:
                parsed.instruction,
              sourceWeb:
                parsed.sourceWeb,

              sentAt:
                parsed.sentAt,
              effectiveAt:
                parsed.effectiveAt,
              onsetAt:
                parsed.onsetAt,
              expiresAt:
                parsed.expiresAt,

              areaDescription:
                parsed.areaDescription,

              areas:
                parsed.areas,

              provinces: [],
              districts: [],
              localities: [],

              fingerprint:
                parsed.fingerprint,
              active:
                parsed.active,

              rawPayload:
                parsed.raw,
            },

            update: {
              sender:
                parsed.sender,
              messageStatus:
                parsed.messageStatus,
              messageType:
                parsed.messageType,
              scope:
                parsed.scope,
              references:
                parsed.references,
              incidents:
                parsed.incidents,

              category:
                parsed.category,
              event:
                parsed.event,
              urgency:
                parsed.urgency,
              severity:
                parsed.severity,
              certainty:
                parsed.certainty,
              headline:
                parsed.headline,
              description:
                parsed.description,
              instruction:
                parsed.instruction,
              sourceWeb:
                parsed.sourceWeb,

              sentAt:
                parsed.sentAt,
              effectiveAt:
                parsed.effectiveAt,
              onsetAt:
                parsed.onsetAt,
              expiresAt:
                parsed.expiresAt,

              areaDescription:
                parsed.areaDescription,

              areas:
                parsed.areas,

              fingerprint:
                parsed.fingerprint,
              active:
                parsed.active,

              rawPayload:
                parsed.raw,
            },
          }
        );

      if (!existing) {
        itemsCreated++;
      } else if (changed) {
        itemsUpdated++;
      }

      /*
       * Primera ejecución = línea base.
       * Después sólo se notifica si:
       * - el mensaje está activo
       * - es nuevo o realmente cambió
       */
      if (
        !baseline &&
        parsed.active &&
        changed
      ) {
        const delivery =
          await notifyAlert(
            saved.id,
            parsed
          );

        notificationsTargeted +=
          delivery.targeted;

        notificationsSent +=
          delivery.sent;

        notificationsFailed +=
          delivery.failed;

        if (delivery.sent > 0) {
          await prisma.weatherAlert.update(
            {
              where: {
                id: saved.id,
              },
              data: {
                lastNotifiedAt:
                  new Date(),
              },
            }
          );
        }
      }
    }

    /*
     * Las alertas cuya vigencia terminó dejan
     * de considerarse activas.
     */
    await prisma.weatherAlert.updateMany(
      {
        where: {
          active: true,
          expiresAt: {
            lte: new Date(),
          },
        },
        data: {
          active: false,
        },
      }
    );

    const now =
      new Date();

    await prisma.weatherSourceState.upsert(
      {
        where: {
          sourceKey:
            SOURCE_KEY,
        },

        create: {
          sourceKey:
            SOURCE_KEY,
          source: "SMN",
          feed: sourceUrl,
          endpoint:
            sourceUrl,

          etag:
            feedResponse.headers.get(
              "etag"
            ),

          lastModified:
            feedResponse.headers.get(
              "last-modified"
            ),

          lastAttemptAt:
            now,

          lastSuccessAt:
            now,

          consecutiveFailures:
            0,

          lastHttpStatus:
            feedResponse.status,

          lastError:
            null,
        },

        update: {
          source: "SMN",
          feed: sourceUrl,
          endpoint:
            sourceUrl,

          etag:
            feedResponse.headers.get(
              "etag"
            ),

          lastModified:
            feedResponse.headers.get(
              "last-modified"
            ),

          lastAttemptAt:
            now,

          lastSuccessAt:
            now,

          consecutiveFailures:
            0,

          lastHttpStatus:
            feedResponse.status,

          lastError:
            null,
        },
      }
    );

    await prisma.weatherSyncRun.update(
      {
        where: {
          id: syncRun.id,
        },

        data: {
          status: "success",

          httpStatus:
            feedResponse.status,

          itemsReceived:
            alerts.length,

          itemsProcessed,

          itemsCreated,

          itemsUpdated,

          notificationsTargeted,

          notificationsSent,

          notificationsFailed,

          finishedAt:
            now,
        },
      }
    );

    return {
      success: true,
      baseline,

      feed: sourceUrl,

      received:
        alerts.length,

      processed:
        itemsProcessed,

      created:
        itemsCreated,

      updated:
        itemsUpdated,

      notifications: {
        targeted:
          notificationsTargeted,

        sent:
          notificationsSent,

        failed:
          notificationsFailed,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido.";

    const now = new Date();

    await Promise.allSettled([
      prisma.weatherSyncRun.update({
        where: {
          id: syncRun.id,
        },
        data: {
          status: "failed",
          error:
            message.slice(
              0,
              2000
            ),
          finishedAt:
            now,
        },
      }),

      prisma.weatherSourceState.upsert({
        where: {
          sourceKey:
            SOURCE_KEY,
        },

        create: {
          sourceKey:
            SOURCE_KEY,
          source: "SMN",
          feed: sourceUrl,
          endpoint:
            sourceUrl,
          lastAttemptAt:
            now,
          consecutiveFailures:
            1,
          lastError:
            message.slice(
              0,
              2000
            ),
        },

        update: {
          lastAttemptAt:
            now,

          consecutiveFailures: {
            increment: 1,
          },

          lastError:
            message.slice(
              0,
              2000
            ),
        },
      }),
    ]);

    throw error;
  }
}