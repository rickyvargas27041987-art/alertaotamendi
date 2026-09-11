import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession, monitorSessionCookie, verifyPassword } from "@/lib/monitorAuth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const cleanPassword = String(password ?? "");
    const cleanUsername = String(username ?? "").trim().toLowerCase();

    // Compatibilidad: el acceso administrativo original sigue funcionando.
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.ADMIN_SESSION_SECRET;
    if ((!cleanUsername || cleanUsername === "admin") && adminPassword && sessionSecret && cleanPassword === adminPassword) {
      const response = NextResponse.json({ success: true, role: "ADMIN", legacy: true });
      response.cookies.set("admin_session", sessionSecret, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 60 * 60 * 8, path: "/" });
      return response;
    }

    if (!cleanUsername) return NextResponse.json({ success: false, error: "Ingresá tu usuario." }, { status: 400 });
    const user = await prisma.monitoringUser.findUnique({ where: { username: cleanUsername } });
    if (!user || !user.active || !verifyPassword(cleanPassword, user.passwordHash)) {
      return NextResponse.json({ success: false, error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }
    const { token } = await createUserSession(user.id);
    await prisma.monitoringUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const response = NextResponse.json({ success: true, role: user.role, name: user.name });
    response.cookies.set(monitorSessionCookie.name, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: monitorSessionCookie.maxAge, path: "/" });
    return response;
  } catch (error) {
    console.error("Login monitor:", error);
    return NextResponse.json({ success: false, error: "Error al iniciar sesión." }, { status: 500 });
  }
}
