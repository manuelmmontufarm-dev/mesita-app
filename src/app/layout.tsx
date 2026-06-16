import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Mesita QR — Paga y vete cuando quieras",
  description:
    "Mesita QR — La capa operativa para la hospitalidad moderna. Tus clientes escanean, dividen la cuenta y pagan en segundos. Sin esperar al mesero, sin apps.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MesitaQR",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
