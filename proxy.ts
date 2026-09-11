import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") return NextResponse.next();
  const hasLegacy = Boolean(request.cookies.get("admin_session")?.value);
  const hasUser = Boolean(request.cookies.get("monitor_session")?.value);
  if (!hasLegacy && !hasUser) return NextResponse.redirect(new URL("/admin/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*"] };
