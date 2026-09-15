import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Home from "@/app/page";
import InstallationLanding from "@/app/components/InstallationLanding";
import { installationLocality, installationName } from "@/lib/localInstallation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ abrir?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locality = installationLocality(id);
  if (!locality) return {};
  const name = `Alerta ${installationName(locality.nombre)}`;
  return {
    title: name,
    applicationName: name,
    description: `${name} · Red comunitaria Alerta Otamendi`,
    manifest: `/instalar/${id}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "black-translucent" },
    icons: { apple: [{ url: `/instalar/${id}/icono?size=180`, sizes: "180x180", type: "image/png" }] },
  };
}

export default async function LocalInstallPage({ params, searchParams }: Props) {
  const { id } = await params;
  const locality = installationLocality(id);
  if (!locality) notFound();
  const name = `Alerta ${installationName(locality.nombre)}`;
  return <InstallationLanding id={id} name={name} province={locality.provincia} launch={(await searchParams).abrir === "1"}><Home /></InstallationLanding>;
}
