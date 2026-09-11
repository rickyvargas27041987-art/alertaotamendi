import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/monitorAuth";
export async function POST() {
  const store = await cookies();
  const token = store.get("monitor_session")?.value;
  if (token) await prisma.monitorSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } }).catch(()=>{});
  const response = NextResponse.json({ success: true });
  for (const name of ["admin_session", "monitor_session"]) response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 0, path: "/" });
  return response;
}
