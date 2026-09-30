import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, canManageCenter, getMonitorActor, type MonitorActor } from "@/lib/monitorAuth";

const VALID_TYPES = ["PERSON", "VEHICLE"] as const;
function clean(value: unknown) { const text = String(value ?? "").trim(); return text || null; }
function canUseTracking(actor: MonitorActor) { return actor.role !== "INSTITUTIONAL" && canManageCenter(actor); }
function zoneWhere(actor: MonitorActor) {
  if (actor.role === "ADMIN") return {};
  return { OR: actor.zones.map((zone) => ({ province: zone.province, district: zone.district, ...(zone.locality ? { locality: zone.locality } : {}) })) };
}
function actorAllowsZone(actor: MonitorActor, province: string, district: string, locality: string | null) {
  if (actor.role === "ADMIN") return true;
  const norm = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("es-AR");
  return actor.zones.some((zone) => norm(zone.province) === norm(province) && norm(zone.district) === norm(district) && (!zone.locality || norm(zone.locality) === norm(locality)));
}

export async function GET() {
  try {
    const actor = await getMonitorActor();
    if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    if (!canUseTracking(actor)) return NextResponse.json({ success: false, error: "Tu perfil no tiene acceso a seguimientos." }, { status: 403 });
    const targets = await prisma.trackingTarget.findMany({ where: zoneWhere(actor), orderBy: [{ active: "desc" }, { updatedAt: "desc" }] });
    return NextResponse.json({ success: true, targets });
  } catch (error) {
    console.error("Error cargando seguimientos:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar los seguimientos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getMonitorActor();
    if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    if (!canUseTracking(actor)) return NextResponse.json({ success: false, error: "Tu perfil no puede crear seguimientos." }, { status: 403 });
    const body = await request.json();
    const type = String(body.type ?? "").toUpperCase();
    const title = String(body.title ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const province = String(body.province ?? "").trim();
    const district = String(body.district ?? "").trim();
    const locality = clean(body.locality);
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) return NextResponse.json({ success: false, error: "Tipo de seguimiento inválido." }, { status: 400 });
    if (title.length < 2 || reason.length < 2) return NextResponse.json({ success: false, error: "Completá una referencia y el motivo." }, { status: 400 });
    if (!province || !district) return NextResponse.json({ success: false, error: "La jurisdicción está incompleta." }, { status: 400 });
    if (!actorAllowsZone(actor, province, district, locality)) return NextResponse.json({ success: false, error: "No tenés permiso para crear seguimientos en esa jurisdicción." }, { status: 403 });
    const target = await prisma.trackingTarget.create({ data: {
      type, title, reason, description: clean(body.description), imageUrl: clean(body.imageUrl), province, district, locality, active: true,
      createdById: actor.id, createdByName: actor.name,
      personAge: type === "PERSON" ? clean(body.personAge) : null,
      personFeatures: type === "PERSON" ? clean(body.personFeatures) : null,
      vehiclePlate: type === "VEHICLE" ? clean(body.vehiclePlate)?.toUpperCase() ?? null : null,
      vehicleMake: type === "VEHICLE" ? clean(body.vehicleMake) : null,
      vehicleModel: type === "VEHICLE" ? clean(body.vehicleModel) : null,
      vehicleColor: type === "VEHICLE" ? clean(body.vehicleColor) : null,
      vehicleType: type === "VEHICLE" ? clean(body.vehicleType) : null,
      distinctive: type === "VEHICLE" ? clean(body.distinctive) : null,
    }});
    await audit(actor, "TRACKING_TARGET_CREATED", `${type === "PERSON" ? "Persona" : "Vehículo"} #${target.id}: ${title}`);
    return NextResponse.json({ success: true, target }, { status: 201 });
  } catch (error) {
    console.error("Error creando seguimiento:", error);
    return NextResponse.json({ success: false, error: "No se pudo crear el seguimiento." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getMonitorActor();
    if (!actor) return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    if (!canUseTracking(actor)) return NextResponse.json({ success: false, error: "Tu perfil no puede modificar seguimientos." }, { status: 403 });
    const body = await request.json(); const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Seguimiento inválido." }, { status: 400 });
    const existing = await prisma.trackingTarget.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Seguimiento no encontrado." }, { status: 404 });
    if (!existing.province || !existing.district || !actorAllowsZone(actor, existing.province, existing.district, existing.locality)) return NextResponse.json({ success: false, error: "No tenés permiso para modificar este seguimiento." }, { status: 403 });
    if (typeof body.active !== "boolean") return NextResponse.json({ success: false, error: "Indicá el nuevo estado del seguimiento." }, { status: 400 });
    const target = await prisma.trackingTarget.update({ where: { id }, data: { active: body.active, closedAt: body.active ? null : new Date() } });
    await audit(actor, body.active ? "TRACKING_TARGET_REACTIVATED" : "TRACKING_TARGET_CLOSED", `Seguimiento #${id}: ${existing.title}`);
    return NextResponse.json({ success: true, target });
  } catch (error) {
    console.error("Error actualizando seguimiento:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el seguimiento." }, { status: 500 });
  }
}
