import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" className={montserrat.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
