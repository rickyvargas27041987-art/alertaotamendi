import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alerta Otamendi",
  description: "Sistema comunitario de alertas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}