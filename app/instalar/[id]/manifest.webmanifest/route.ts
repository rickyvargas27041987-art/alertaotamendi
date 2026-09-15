import { localManifest } from "@/lib/localInstallation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const manifest = localManifest((await params).id);
  if (!manifest) return Response.json({ error: "Localidad inválida." }, { status: 404 });
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
