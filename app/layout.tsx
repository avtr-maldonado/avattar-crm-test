import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { FONDO_OSCURO } from "@/lib/marca";
import { temaPreferido } from "@/lib/auth/session";

/**
 * §13.2 · Montserrat para cuerpo y títulos.
 *
 * Clash Display, que el manual pide para títulos cortos, es de Fontshare y no
 * está en Google Fonts. La pila de respaldo del propio §13.2 ya declara
 * Montserrat como su sustituto, así que la interfaz es correcta sin él; cuando
 * se consiga el archivo, entra por `next/font/local` sin tocar nada más.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM Avattar",
  description: "CRM comercial de Avattar IT Solutions · México, Colombia, Chile",
  // §72 · instalable en el teléfono. El manifiesto (app/manifest.ts) y los íconos (app/icon.png,
  // app/apple-icon.png, app/favicon.ico) los enlaza Next por convención de archivo.
  applicationName: "CRM Avattar",
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

/** La barra del navegador y la de estado toman el fondo del ícono (§72). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: FONDO_OSCURO,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // §76 · el tema llega pintado desde el servidor: sin destello claro al cargar en oscuro.
  const tema = await temaPreferido();
  return (
    <html lang="es-MX" className={montserrat.variable} data-tema={tema}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
