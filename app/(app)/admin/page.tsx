import { permanentRedirect } from "next/navigation";

/**
 * `/admin` fue la ruta de Administración hasta el 29-oct-2026; la pantalla es
 * Configuración y vive en `/configuracion` (decisiones §55). Lo que llegue
 * aquí —un marcador, un enlace viejo— sigue de largo con su pestaña.
 */
export default async function AdminRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const p = typeof sp.p === "string" ? `?p=${encodeURIComponent(sp.p)}` : "";
  permanentRedirect(`/configuracion${p}`);
}
