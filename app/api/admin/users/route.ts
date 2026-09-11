import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getMonitorActor, hashPassword } from "@/lib/monitorAuth";

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
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || name.length < 2 || password.length < 8) {
    return NextResponse.json({ success: false, error: "Revisá usuario, nombre y contraseña (mínimo 8 caracteres)." }, { status: 400 });
  }
  try {
    const user = await prisma.monitoringUser.create({
      data: {
        username, name, passwordHash: hashPassword(password), role, active: true,
        zones: { create: zones.filter((z:any) => z?.province && z?.district).map((z:any) => ({ province: String(z.province).trim(), district: String(z.district).trim(), locality: z.locality ? String(z.locality).trim() : null })) },
      }, include: { zones: true },
    });
    await audit(actor, "USER_CREATED", `Usuario ${username} (${role})`);
    const { passwordHash, ...safe } = user;
    return NextResponse.json({ success: true, user: safe }, { status: 201 });
  } catch (e:any) {
    return NextResponse.json({ success: false, error: e?.code === "P2002" ? "Ese usuario ya existe." : "No se pudo crear el usuario." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  const body = await request.json();
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Usuario inválido." }, { status: 400 });
  const data:any = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.role === "ADMIN" || body.role === "OPERATOR") data.role = body.role;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.password === "string" && body.password.length >= 8) data.passwordHash = hashPassword(body.password);
  const zones = Array.isArray(body.zones) ? body.zones : null;
  const user = await prisma.$transaction(async tx => {
    const updated = await tx.monitoringUser.update({ where: { id }, data });
    if (zones) {
      await tx.userZone.deleteMany({ where: { userId: id } });
      if (zones.length) await tx.userZone.createMany({ data: zones.filter((z:any)=>z?.province&&z?.district).map((z:any)=>({ userId:id, province:String(z.province).trim(), district:String(z.district).trim(), locality:z.locality?String(z.locality).trim():null })) });
    }
    if (body.active === false) await tx.monitorSession.deleteMany({ where: { userId: id } });
    return tx.monitoringUser.findUnique({ where: { id }, include: { zones: true } });
  });
  await audit(actor, "USER_UPDATED", `Usuario #${id}: ${JSON.stringify({ active: body.active, role: body.role, zonesChanged: !!zones })}`);
  return NextResponse.json({ success: true, user });
}
