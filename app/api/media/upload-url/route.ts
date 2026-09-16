import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consumeRateLimit } from "@/lib/rateLimit";

const LIMITS: Record<string, { maxBytes: number; mime: RegExp }> = {
  fotos: { maxBytes: 10 * 1024 * 1024, mime: /^image\/(jpeg|png|webp|heic|heif)$/i },
  videos: { maxBytes: 50 * 1024 * 1024, mime: /^video\/(mp4|webm|quicktime|3gpp)$/i },
  audios: { maxBytes: 15 * 1024 * 1024, mime: /^audio\/(webm|mpeg|mp4|aac|ogg|wav|x-wav|3gpp)$/i },
};

function safeExtension(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension && extension.length <= 8 ? extension : "bin";
}

export async function POST(request: Request) {
  try {
    if (!(await consumeRateLimit(request, "media-upload", 20, 15 * 60))) {
      return NextResponse.json({ success: false, error: "Demasiadas subidas. Esperá unos minutos." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const folder = String(body.folder || "");
    const fileName = String(body.fileName || "");
    const contentType = String(body.contentType || "");
    const size = Number(body.size);
    const rule = LIMITS[folder];

    if (!rule || !Number.isFinite(size) || size <= 0 || size > rule.maxBytes || !rule.mime.test(contentType)) {
      return NextResponse.json({ success: false, error: "El archivo no tiene un formato o tamaño permitido." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) {
      return NextResponse.json({ success: false, error: "La subida segura todavía no está configurada." }, { status: 503 });
    }

    const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${safeExtension(fileName)}`;
    const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.storage.from("alertas").createSignedUploadUrl(path);
    if (error || !data?.token) throw error || new Error("Supabase no generó el permiso de subida.");

    const publicUrl = admin.storage.from("alertas").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ success: true, path, token: data.token, publicUrl });
  } catch (error) {
    console.error("Error creando subida segura:", error);
    return NextResponse.json({ success: false, error: "No se pudo preparar la subida del archivo." }, { status: 500 });
  }
}
