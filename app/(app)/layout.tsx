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
  const contadores = await contadoresDeNavegacion(session);

  const comercial = [
    {
      href: "/oportunidades",
      etiqueta: "Oportunidades",
      contador: contadores.oportunidades,
    },
    { href: "/contactos", etiqueta: "Contactos" },
    { href: "/productos", etiqueta: "Productos" },
    {
      href: "/actividades",
      etiqueta: "Actividades",
      contador: contadores.actividades,
    },
    { href: "/objetivos", etiqueta: "Objetivos" },
    ...(can(session, "VER_ANALISIS") ? [{ href: "/analisis", etiqueta: "Análisis" }] : []),
    {
      href: "/autorizaciones",
      etiqueta: "Autorizaciones",
      contador: contadores.autorizaciones,
      // Coral: tienen SLA corriendo (RN-21) y bloquean el avance a cierre.
      urgente: true,
    },
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
