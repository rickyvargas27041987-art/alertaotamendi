import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getMonitorActor, hashPassword } from "@/lib/monitorAuth";
import { addDays, addMonths, normalizePlan, normalizeStatus } from "@/lib/subscription";

async function requireAdmin() {
  const actor = await getMonitorActor();
  return actor?.role === "ADMIN" ? actor : null;
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  const users = await prisma.monitoringUser.findMany({ include: { zones: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ success: true, users: users.map(({ passwordHash, ...u }) => u) });
}

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  const body = await request.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const role = body.role === "ADMIN" ? "ADMIN" : "OPERATOR";
  const zones = Array.isArray(body.zones) ? body.zones : [];
  const billingEmail = String(body.billingEmail ?? "").trim().toLowerCase() || null;
  const plan = normalizePlan(body.subscriptionPlan);

  if (!/^[a-z0-9._-]{3,40}$/.test(username) || name.length < 2 || password.length < 8) {
    return NextResponse.json({ success: false, error: "Revisá usuario, nombre y contraseña (mínimo 8 caracteres)." }, { status: 400 });
  }

  const now = new Date();
  let subscriptionStatus = "ACTIVE";
  let subscriptionStartedAt: Date | null = now;
  let subscriptionEndsAt: Date | null = null;
  let subscriptionAutoRenew = false;

  if (role !== "ADMIN") {
    if (plan === "TRIAL") subscriptionEndsAt = addDays(now, 15);
    if (plan === "MONTHLY" || plan === "ANNUAL") {
      subscriptionStatus = "PENDING";
      subscriptionStartedAt = null;
      subscriptionAutoRenew = true;
    }
  }

  try {
    const user = await prisma.monitoringUser.create({
      data: {
        username,
        name,
        passwordHash: hashPassword(password),
        role,
        active: true,
        billingEmail,
        subscriptionPlan: role === "ADMIN" ? "COURTESY" : plan,
        subscriptionStatus: role === "ADMIN" ? "ACTIVE" : subscriptionStatus,
        subscriptionStartedAt,
        subscriptionEndsAt,
        subscriptionAutoRenew,
        zones: {
          create: zones
            .filter((z: any) => z?.province && z?.district)
            .map((z: any) => ({
              province: String(z.province).trim(),
              district: String(z.district).trim(),
              locality: z.locality ? String(z.locality).trim() : null,
            })),
        },
      },
      include: { zones: true },
    });
    await audit(actor, "USER_CREATED", `Usuario ${username} (${role}) - plan ${user.subscriptionPlan}`);
    const { passwordHash, ...safe } = user;
    return NextResponse.json({ success: true, user: safe }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.code === "P2002" ? "Ese usuario ya existe." : "No se pudo crear el usuario." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  const body = await request.json();
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Usuario inválido." }, { status: 400 });

  const current = await prisma.monitoringUser.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ success: false, error: "Usuario no encontrado." }, { status: 404 });

  const data: any = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.role === "ADMIN" || body.role === "OPERATOR") data.role = body.role;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.password === "string" && body.password.length >= 8) data.passwordHash = hashPassword(body.password);
  if (typeof body.billingEmail === "string") data.billingEmail = body.billingEmail.trim().toLowerCase() || null;
  if (body.subscriptionPlan) data.subscriptionPlan = normalizePlan(body.subscriptionPlan);
  if (body.subscriptionStatus) data.subscriptionStatus = normalizeStatus(body.subscriptionStatus);

  const now = new Date();
  const action = String(body.subscriptionAction ?? "");
  if (action === "COURTESY") {
    data.subscriptionPlan = "COURTESY";
    data.subscriptionStatus = "ACTIVE";
    data.subscriptionStartedAt = now;
    data.subscriptionEndsAt = null;
    data.subscriptionAutoRenew = false;
    data.mpStatus = null;
  } else if (action === "TRIAL_15") {
    data.subscriptionPlan = "TRIAL";
    data.subscriptionStatus = "ACTIVE";
    data.subscriptionStartedAt = now;
    data.subscriptionEndsAt = addDays(now, 15);
    data.subscriptionAutoRenew = false;
    data.mpStatus = null;
  } else if (action === "EXTEND_30") {
    const base = current.subscriptionEndsAt && current.subscriptionEndsAt > now ? current.subscriptionEndsAt : now;
    data.subscriptionPlan = "MONTHLY";
    data.subscriptionStatus = "ACTIVE";
    data.subscriptionStartedAt = current.subscriptionStartedAt ?? now;
    data.subscriptionEndsAt = addDays(base, 30);
    data.subscriptionAutoRenew = false;
  } else if (action === "EXTEND_365") {
    const base = current.subscriptionEndsAt && current.subscriptionEndsAt > now ? current.subscriptionEndsAt : now;
    data.subscriptionPlan = "ANNUAL";
    data.subscriptionStatus = "ACTIVE";
    data.subscriptionStartedAt = current.subscriptionStartedAt ?? now;
    data.subscriptionEndsAt = addDays(base, 365);
    data.subscriptionAutoRenew = false;
  } else if (action === "SUSPEND_SUBSCRIPTION") {
    data.subscriptionStatus = "SUSPENDED";
  } else if (action === "REACTIVATE") {
    data.subscriptionStatus = "ACTIVE";
    if (current.subscriptionPlan === "MONTHLY" && !current.subscriptionEndsAt) data.subscriptionEndsAt = addMonths(now, 1);
    if (current.subscriptionPlan === "ANNUAL" && !current.subscriptionEndsAt) data.subscriptionEndsAt = addMonths(now, 12);
  }

  const zones = Array.isArray(body.zones) ? body.zones : null;
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.monitoringUser.update({ where: { id }, data });
    if (zones) {
      await tx.userZone.deleteMany({ where: { userId: id } });
      if (zones.length) {
        await tx.userZone.createMany({
          data: zones
            .filter((z: any) => z?.province && z?.district)
            .map((z: any) => ({ userId: id, province: String(z.province).trim(), district: String(z.district).trim(), locality: z.locality ? String(z.locality).trim() : null })),
        });
      }
    }
    const mustCloseSessions = body.active === false || action === "SUSPEND_SUBSCRIPTION";
    if (mustCloseSessions) await tx.monitorSession.deleteMany({ where: { userId: id } });
    return tx.monitoringUser.findUnique({ where: { id }, include: { zones: true } });
  });

  await audit(actor, "USER_UPDATED", `Usuario #${id}: ${JSON.stringify({ active: body.active, role: body.role, subscriptionAction: action || undefined, plan: body.subscriptionPlan, zonesChanged: !!zones })}`);
  return NextResponse.json({ success: true, user });
}
