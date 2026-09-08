import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alerta Otamendi",
  description: "Sistema comunitario de alertas de Comandante Nicanor Otamendi",
  applicationName: "Alerta Otamendi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Alerta Otamendi",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
