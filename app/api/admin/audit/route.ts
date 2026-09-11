import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonitorActor } from "@/lib/monitorAuth";
export async function GET() {
  const actor = await getMonitorActor();
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ success:false, error:"No autorizado." }, { status:403 });
  const logs = await prisma.auditLog.findMany({ orderBy:{createdAt:"desc"}, take:300 });
  return NextResponse.json({ success:true, logs });
}
