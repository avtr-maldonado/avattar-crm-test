import type { MetadataRoute } from "next";
import { FONDO_OSCURO } from "@/lib/marca";

/**
 * El manifiesto de la app instalable · decisiones §72. Next lo sirve en `/manifest.webmanifest` y lo
 * enlaza solo. El fondo y el tema son el del ícono, para que la pantalla de arranque no destelle.
 *
 * Íconos: «any» con esquinas redondeadas y fondo transparente (escritorio y lanzadores que no
 * recortan los muestran tal cual); «maskable» a sangre completa, porque Android aplica su propia
 * máscara y el arte ya cabe en su zona segura del 80 %. iOS no lee esto: usa `app/apple-icon.png`.
 *
 * Sin service worker a propósito: ni Chrome ni Safari lo exigen para instalar, y una caché en un CRM
 * muestra datos viejos.
 */
const FONDO = FONDO_OSCURO;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Avattar",
    short_name: "CRM",
    description: "CRM comercial de Avattar IT Solutions",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "es-MX",
    theme_color: FONDO,
    background_color: FONDO,
    icons: [
      { src: "/pwa/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
