/**
 * El estado de la tabla de cotización mientras se edita.
 *
 * Tres cosas que se mueven juntas: si se está editando, la **generación** del
 * formulario (subirla lo remonta y devuelve cada campo a su valor guardado) y
 * el **borrador**: lo tecleado en cada celda, por su nombre de campo
 * `linea.<id>.<campo>`, que es lo que la vista previa recalcula al momento.
 * Cerrar —por cancelar o por guardar— vacía el borrador: un borrador viejo no
 * puede pintar cifras de una edición anterior.
 */
export type EstadoDeEdicion = {
  editando: boolean;
  generacion: number;
  borrador: Record<string, string>;
};

export type AccionDeEdicion =
  | { tipo: "editar" }
  | { tipo: "cerrar" }
  | { tipo: "teclear"; nombre: string; valor: string };

export const INICIAL: EstadoDeEdicion = { editando: false, generacion: 0, borrador: {} };

const CELDA = /^linea\.[^.]+\.(quantity|unitPrice|discountPct|unitCost)$/;

export function reducirEdicion(estado: EstadoDeEdicion, accion: AccionDeEdicion): EstadoDeEdicion {
  switch (accion.tipo) {
    case "editar":
      return { ...estado, editando: true };
    case "cerrar":
      return { editando: false, generacion: estado.generacion + 1, borrador: {} };
    case "teclear":
      // Solo las celdas de línea alimentan la vista previa; lo demás del
      // formulario (ids, acción) no es un dato que recalcular.
      if (!CELDA.test(accion.nombre)) return estado;
      return { ...estado, borrador: { ...estado.borrador, [accion.nombre]: accion.valor } };
  }
}
