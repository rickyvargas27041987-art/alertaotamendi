import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, error: "Contraseña de administrador no configurada." },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { success: false, error: "Contraseña incorrecta." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set("admin_session", adminPassword, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Error al iniciar sesión." },
      { status: 500 }
    );
  }
}
