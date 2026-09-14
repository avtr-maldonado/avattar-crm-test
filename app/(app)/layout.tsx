import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { contadoresDeNavegacion } from "@/lib/scope/contadores";
import { BarraLateral, type SeccionNavegacion } from "@/components/ui/BarraLateral";
import { NavegacionAngosta } from "@/components/ui/NavegacionAngosta";
import { Notificaciones } from "@/components/ui/Notificaciones";
import { iniciales } from "@/lib/etiquetas";

/**
 * Estructura de la aplicación · §13.5.
 *
 * Dos regiones: la navegación, que ocupa el alto exacto de la pantalla y no se
 * desplaza, y el contenido, que es lo único con scroll. Cada pantalla pone su
 * propio encabezado con `BarraSuperior`, porque el subtítulo de contexto
 * —conteos, totales— cambia con la pantalla y un layout no puede conocerlo.
 *
 * `requireSession` redirige a `/login` o a `/sin-acceso` según la causa, que
 * son situaciones distintas. De aquí en adelante toda pantalla asume usuario.
 *
 * Los rubros se recortan por permiso, pero **ocultar un enlace no es
 * autorización**: la ruta de análisis responde 403 por su cuenta (AC-02). Lo
 * que el recorte evita es ofrecer una puerta que se va a cerrar en la cara.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();

  // Sin `await`, a propósito: los contadores viajan como promesa hasta
  // `ContadorRubro`, que los resuelve dentro de `Suspense`. Esperarlos aquí
  // retrasaba toda la pantalla ~300 ms por la consulta, incluido el esqueleto
  // de carga de la página (docs/latencia-dev.md, 4e).
  const contadores = contadoresDeNavegacion(session);

  // Objetivos (P-08, E4) y Autorizaciones (P-10, fuera de este alcance) no
  // están en la lista a propósito: sus rutas todavía no existen, y un rubro
  // que lleva a un 404 enseña a desconfiar del menú. Al volver, Autorizaciones
  // va con `contador: contadores.then((c) => c.autorizaciones)` y `urgente`,
  // porque tienen SLA corriendo (RN-21); el lector ya calcula ese conteo.
  const comercial = [
    {
      href: "/oportunidades",
      etiqueta: "Oportunidades",
      contador: contadores.then((c) => c.oportunidades),
    },
    { href: "/contactos", etiqueta: "Contactos" },
    { href: "/productos", etiqueta: "Productos" },
    {
      href: "/actividades",
      etiqueta: "Actividades",
      contador: contadores.then((c) => c.actividades),
    },
    ...(can(session, "VER_ANALISIS") ? [{ href: "/analisis", etiqueta: "Análisis" }] : []),
  ];

  const sistema = can(session, "EDITAR_CATALOGOS")
    ? [{ href: "/admin", etiqueta: "Administración" }]
    : [];

  const secciones: SeccionNavegacion[] = [
    { titulo: "Comercial", rubros: comercial },
    { titulo: "Sistema", rubros: sistema },
  ];

  const usuario = {
    nombre: session.name,
    iniciales: iniciales(session.name),
    rol: session.role,
    paises: session.countryCodes,
  };

  return (
    <div className="flex min-h-screen bg-superficie-pagina">
      <BarraLateral secciones={secciones} usuario={usuario} />

      <div className="flex min-w-0 flex-1 flex-col">
        <NavegacionAngosta rubros={[...comercial, ...sistema]} />
        {children}
      </div>

      {/*
        Montado una sola vez, aquí: sobrevive a la navegación dentro del grupo,
        y eso es lo que permite avisar antes de cambiar de pantalla y que el
        aviso siga visible al llegar.
      */}
      <Notificaciones />
    </div>
  );
}
