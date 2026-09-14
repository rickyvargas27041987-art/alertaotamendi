import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host")?.split(":")[0] ?? "";

  // DOMINIO EXCLUSIVO DEL CENTRO DE MONITOREO
  // Si entran a monitoreo.alertaotamendi.com,
  // enviamos directamente al acceso del Centro.
  if (
    hostname === "monitoreo.alertaotamendi.com" &&
    pathname === "/"
  ) {
    return NextResponse.redirect(
      new URL("/admin/login", request.url)
    );
  }

  // PROTECCIÓN DEL CENTRO DE MONITOREO
  if (
    !pathname.startsWith("/admin") ||
    pathname === "/admin/login"
  ) {
    return NextResponse.next();
  }

  const hasLegacy = Boolean(
    request.cookies.get("admin_session")?.value
  );

  const hasUser = Boolean(
    request.cookies.get("monitor_session")?.value
  );

  if (!hasLegacy && !hasUser) {
    return NextResponse.redirect(
      new URL("/admin/login", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
