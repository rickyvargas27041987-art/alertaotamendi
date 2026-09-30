import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;

  if (host === "monitoreo.alertaotamendi.com" && pathname === "/") {
    const hasSession =
      Boolean(request.cookies.get("monitor_session")?.value) ||
      Boolean(request.cookies.get("admin_session")?.value);

    const url = request.nextUrl.clone();
    url.pathname = hasSession ? "/admin" : "/admin/login";

    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
