import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";

  const hasLegacy = Boolean(
    request.cookies.get("admin_session")?.value
  );

  const hasUser = Boolean(
    request.cookies.get("monitor_session")?.value
  );

  // DOMINIO EXCLUSIVO DEL CENTRO DE MONITOREO
  // La URL visible queda limpia:
  // sin sesión muestra el login y con sesión muestra el Centro.
  if (
    hostname === "monitoreo.alertaotamendi.com" &&
    pathname === "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = hasLegacy || hasUser ? "/admin" : "/admin/login";
    return NextResponse.rewrite(url);
  }

  // PROTECCIÓN DEL CENTRO DE MONITOREO
  if (
    !pathname.startsWith("/admin") ||
    pathname === "/admin/login"
  ) {
    return NextResponse.next();
  }

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
