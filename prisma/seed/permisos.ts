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
 * significa que no autoriza. Desde §66 ningún permiso lleva tope: el único
 * era «Autorizar descuento».
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
  VER_OPORTUNIDADES_OFICINA: {
    nombre: "Gestionar oportunidades de la oficina",
    descripcion: "Reasignar, editar las de otros y elegir propietario al convertir un prospecto. Lo que cada quien ve lo decide su rol (decisiones §66).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  CREAR_OPORTUNIDAD: {
    nombre: "Crear oportunidades",
    descripcion: "Dar de alta oportunidades y trabajarlas en el tablero. Preventa las apoya: las ve y les agrega actividades (decisiones §39).",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  ANALIZAR_CON_IA: {
    nombre: "Analizar con IA",
    descripcion: "Pedir desde el detalle la ficha de estado que escribe el agente (decisiones §63). Sin él, queda el MCP.",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  VER_MARGEN: {
    nombre: "Ver margen",
    descripcion: "El porcentaje de margen. Independiente de ver el costo (RN-09).",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: si, MARKETING: no },
  },
  VER_COSTO: {
    nombre: "Ver costo",
    descripcion: "El costo unitario y la utilidad. Un vendedor conoce su margen sin conocer el costo del proveedor.",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  EDITAR_CATALOGOS: {
    nombre: "Editar productos y cuotas",
    descripcion: "Dar de alta y editar productos, y fijar las cuotas de Objetivos (decisiones §66).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  REABRIR_OPORTUNIDAD: {
    nombre: "Reabrir oportunidad",
    descripcion: "Reabrir una cerrada, con motivo y traza. El folio no cambia (RN-18).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  VER_ANALISIS: {
    nombre: "Ver análisis",
    descripcion: "Las pantallas de análisis. Denegado a Vendedor: la ruta responde 403 (AC-02).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  VER_OBJETIVOS_EQUIPO: {
    nombre: "Ver objetivos del equipo",
    descripcion: "La cuota y el avance de otros. Un vendedor ve solo su renglón (§2.3).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  EDITAR_POLITICA_COMERCIAL: {
    nombre: "Ver política comercial",
    descripcion: "La pestaña de solo lectura con umbrales, mínimos MEDDIC y SLA por país (INV-05, decisiones §66).",
    roles: { VENDEDOR: no, GERENTE_PAIS: no, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  // Agregado el 14-sep-2026 con el módulo de usuarios (decisiones-pendientes §15).
  // No está en la tabla original de §5.2: el alta de usuarios es un acto
  // administrativo y necesitaba un permiso propio, no «editar catálogos».
  // Desde el 29-oct-2026 lo tiene también Gerencia (§55): administra a los
  // vendedores y preventas de sus países, y a nadie más (`administraUsuario`).
  ADMINISTRAR_USUARIOS: {
    nombre: "Administrar usuarios",
    descripcion:
      "Dar de alta perfiles, asignar rol y país, y dar acceso a quien ya entró con Microsoft. Gerencia solo a vendedores y preventas de sus países. Deja traza (INV-09).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: no, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
  // §58 · Prospectos. Marketing los capta y gestiona; ventas los convierte.
  VER_PROSPECTOS: {
    nombre: "Ver prospectos",
    descripcion: "La pantalla de prospectos. El vendedor ve los que tiene asignados; Marketing y Gerencia, los de sus países.",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: si },
  },
  GESTIONAR_PROSPECTOS: {
    nombre: "Gestionar prospectos",
    descripcion: "Crear, importar, validar, calificar, asignar y descartar prospectos. Deja traza (INV-09).",
    roles: { VENDEDOR: no, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: si },
  },
  CONVERTIR_PROSPECTO: {
    nombre: "Convertir prospecto",
    descripcion: "Abrir una oportunidad a partir de un prospecto aceptado, reutilizando cuenta y persona si ya existen.",
    roles: { VENDEDOR: si, GERENTE_PAIS: si, DIRECCION: si, ADMINISTRADOR: si, PREVENTA: no, MARKETING: no },
  },
};
