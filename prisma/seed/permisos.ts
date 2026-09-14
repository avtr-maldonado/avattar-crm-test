import type { Role } from "@prisma/client";

/**
 * La matriz de permisos de §5.2, como datos.
 *
 * Es la tabla del spec transcrita literalmente. `PREVENTA` no aparece ahí —
 * §5.1 lo marca como pendiente de confirmación (Q-03)— así que se le asigna el
 * mínimo defendible: ve las oportunidades donde está asignado como apoyo, ve
 * margen, **no** ve costo, y no autoriza nada. Queda registrado en
 * `docs/decisiones-pendientes.md`.
 *
 * `limite` es la fracción máxima que ese rol puede autorizar. `null` con
 * `granted: true` significa **sin tope** (Dirección); `granted: false`
 * significa que no autoriza. Las dos cosas son distintas y `limitFor` las
 * distingue.
 */
type ValorPermiso = { granted: boolean; limite?: string };

type DefinicionPermiso = {
  nombre: string;
  descripcion: string;
  roles: Partial<Record<Role, ValorPermiso>>;
};

const no: ValorPermiso = { granted: false };
const si: ValorPermiso = { granted: true };

export const PERMISOS_POR_ROL: Record<string, DefinicionPermiso> = {
  VER_OPORTUNIDADES_PROPIAS: {
    nombre: "Ver oportunidades propias",
    descripcion: "Las oportunidades donde el usuario es propietario.",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: si },
  },
  VER_OPORTUNIDADES_OFICINA: {
    nombre: "Ver oportunidades de la oficina",
    descripcion: "Todas las oportunidades de los países asignados al usuario.",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  VER_MARGEN: {
    nombre: "Ver margen",
    descripcion: "El porcentaje de margen. Independiente de ver el costo (RN-09).",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: si },
  },
  VER_COSTO: {
    nombre: "Ver costo",
    descripcion: "El costo unitario y la utilidad. Un vendedor conoce su margen sin conocer el costo del proveedor.",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  AUTORIZAR_DESCUENTO: {
    nombre: "Autorizar descuento",
    descripcion: "Resolver solicitudes de autorización. Nadie autoriza la propia (RN-04).",
    roles: {
      VENDEDOR: no,
      GERENTE_PAIS: { granted: true, limite: "0.3000" },
      // Sin tope: `granted` en true y `limite` ausente.
      DIRECCION: si,
      ADMINISTRADOR: no,
      PREVENTA: no,
    },
  },
  EDITAR_CATALOGOS: {
    nombre: "Editar catálogos",
    descripcion: "Tipos de actividad, motivos de pérdida, roles de comité y demás.",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no },
  },
  REABRIR_OPORTUNIDAD: {
    nombre: "Reabrir oportunidad",
    descripcion: "Reabrir una cerrada, con motivo y traza. El folio no cambia (RN-18).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no },
  },
  EXPORTAR_CON_COSTO: {
    nombre: "Exportar con costo",
    descripcion: "Incluir columnas de costo y utilidad en las exportaciones. Deja traza (INV-09).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  VER_ANALISIS: {
    nombre: "Ver análisis",
    descripcion: "Las pantallas de análisis. Denegado a Vendedor: la ruta responde 403 (AC-02).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  VER_OBJETIVOS_EQUIPO: {
    nombre: "Ver objetivos del equipo",
    descripcion: "La cuota y el avance de otros. Un vendedor ve solo su renglón (§2.3).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  EDITAR_POLITICA_COMERCIAL: {
    nombre: "Editar política comercial",
    descripcion: "Pisos de margen, umbrales de descuento, mínimos MEDDIC y SLA (INV-05).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no },
  },
  // Agregado el 14-sep-2026 con el módulo de usuarios (decisiones-pendientes §15).
  // No está en la tabla original de §5.2: el alta de usuarios es un acto
  // administrativo y necesitaba un permiso propio, no «editar catálogos».
  ADMINISTRAR_USUARIOS: {
    nombre: "Administrar usuarios",
    descripcion:
      "Dar de alta perfiles, asignar rol y país, y dar acceso a quien ya entró con Microsoft. Deja traza (INV-09).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no },
  },
};
