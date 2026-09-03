import { NextResponse } from "next/server";

type Report = {
  id: number;
  category: string;
  description: string;
  status: string;
  createdAt: string;
};

const reports: Report[] = [];

export async function GET() {
  return NextResponse.json({
    success: true,
    total: reports.length,
    reports: reports,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const category = body.category;
    const description = body.description;

    if (!category || !description) {
      return NextResponse.json(
        {
          success: false,
          message: "Falta la categoría o la descripción.",
        },
        { status: 400 }
      );
    }

    const newReport: Report = {
      id: reports.length + 1,
      category: category,
      description: description,
      status: "pendiente",
      createdAt: new Date().toISOString(),
    };

    reports.push(newReport);

    console.log("🚨 NUEVA ALERTA RECIBIDA");
    console.log(newReport);

    return NextResponse.json(
      {
        success: true,
        message: "Alerta recibida correctamente.",
        report: newReport,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al procesar la alerta.",
      },
      { status: 500 }
    );
  }
}