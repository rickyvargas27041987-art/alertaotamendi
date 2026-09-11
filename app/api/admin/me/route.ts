import { NextResponse } from "next/server";
import { getMonitorActor } from "@/lib/monitorAuth";
export async function GET() {
  const actor = await getMonitorActor();
  if (!actor) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({ success: true, user: actor });
}
