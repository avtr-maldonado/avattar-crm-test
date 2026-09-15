import { menuColapsado, oficinaActiva, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { contadoresDeNavegacion } from "@/lib/scope/contadores";
import { BarraLateral, type SeccionNavegacion } from "@/components/ui/BarraLateral";
import { ProveedorDeBarra } from "@/components/ui/ContextoDeBarra";
import { NavegacionAngosta } from "@/components/ui/NavegacionAngosta";
import { Notificaciones } from "@/components/ui/Notificaciones";
import type { Rubro } from "@/components/ui/RubrosNavegacion";
import { iniciales } from "@/lib/etiquetas";
import { buscarGlobalAccion, elegirOficinaAccion } from "./acciones";

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
  // Las dos cookies de preferencia, sin viaje a la base.
  const [oficina, colapsado] = await Promise.all([oficinaActiva(session), menuColapsado()]);

  // Sin `await`, a propósito: los contadores viajan como promesa hasta
  // `ContadorRubro`, que los resuelve dentro de `Suspense`. Esperarlos aquí
  // retrasaba toda la pantalla ~300 ms por la consulta, incluido el esqueleto
  // de carga de la página (docs/latencia-dev.md, 4e). Se acotan a la oficina
  // activa, igual que las pantallas.
  const contadores = contadoresDeNavegacion(session, oficina);

  // Autorizaciones (P-10) sigue fuera a propósito: su ruta todavía no existe, y
  // un rubro que lleva a un 404 enseña a desconfiar del menú. Al volver, va con
  // `contador: contadores.then((c) => c.autorizaciones)` y `urgente`, porque
  // tienen SLA corriendo (RN-21); el lector ya calcula ese conteo.
  const comercial: Rubro[] = [
    {
      href: "/oportunidades",
      etiqueta: "Oportunidades",
      icono: "oportunidades",
      contador: contadores.then((c) => c.oportunidades),
    },
    { href: "/contactos", etiqueta: "Contactos", icono: "contactos" },
    { href: "/productos", etiqueta: "Productos", icono: "productos" },
    {
      href: "/actividades",
      etiqueta: "Actividades",
      icono: "actividades",
      contador: contadores.then((c) => c.actividades),
    },
    // Sin contador: un objetivo no es un pendiente que se resuelve, y un número
    // al lado se leería como «tienes 4 cosas que atender».
    { href: "/objetivos", etiqueta: "Objetivos", icono: "objetivos" },
    ...(can(session, "VER_ANALISIS")
      ? [{ href: "/analisis", etiqueta: "Análisis", icono: "analisis" as const }]
      : []),
  ];

  const sistema: Rubro[] =
    can(session, "EDITAR_CATALOGOS") || can(session, "ADMINISTRAR_USUARIOS")
      ? [{ href: "/admin", etiqueta: "Administración", icono: "admin" }]
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
    // La oficina activa y las dos acciones globales llegan a la barra superior
    // de cualquier pantalla por contexto, sin que cada pantalla las cablee.
    <ProveedorDeBarra
      valor={{
        oficinaActiva: oficina,
        oficinas: session.countryCodes,
        elegirOficina: elegirOficinaAccion,
        buscar: buscarGlobalAccion,
      }}
    >
      <div className="flex min-h-screen bg-superficie-pagina">
        <BarraLateral secciones={secciones} usuario={usuario} colapsadoInicial={colapsado} />

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
    </ProveedorDeBarra>
  );
}
