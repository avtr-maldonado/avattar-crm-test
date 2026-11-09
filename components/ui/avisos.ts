"use client";

import { sileo } from "sileo";
import type { ResultadoAccion } from "@/lib/acciones";

/**
 * Cómo se avisa · la única forma de notificar en la aplicación.
 *
 * Se exponen envueltos y no `sileo` directo para que exista **una** manera: si
 * mañana hay que cambiar posición, duración o biblioteca, se cambia aquí y no
 * en quince pantallas. El `Toaster` que los pinta vive en `Notificaciones.tsx`,
 * montado una sola vez en el layout del grupo.
 *
 * ## Qué va en un aviso y qué NO
 *
 * Un aviso se va solo: si lo que dice hace falta para corregir algo, no puede
 * irse solo.
 *
 * | Motivo de `ResultadoAccion` | Dónde | Por qué |
 * |---|---|---|
 * | `VALIDACION` | **en el campo** | Se corrige ahí mismo. §13.5 pide el dato concreto junto al control |
 * | `COMPUERTA` | **en el formulario** | §13.5: «alertas de política dentro del formulario, no en un modal: se ven mientras se teclea». Y la lista completa de requisitos no cabe en un aviso |
 * | `CONFIRMACION` | **en el formulario** | El DEBE de §12.4 exige preguntar y reenviar, no avisar y desvanecerse |
 * | `AUTORIZACION` | **aviso** | No hay nada que corregir: la respuesta es sobre quién eres, no sobre lo que escribiste |
 * | `CONFLICTO` | **aviso** | El formulario está viejo. El mensaje es sobre el mundo, no sobre lo tecleado |
 *
 * Los tres primeros ya se pintan con `AvisosDeAccion` y `problemaDe`, y **no se
 * reemplazan**: tienen un trabajo específico en la pantalla.
 */

/** Cuánto dura cada tipo. Un error se lee más despacio que una confirmación. */
/** El `id` de la capa donde `Notificaciones` monta los avisos. */
export const ID_CAPA_DE_AVISOS = "capa-de-avisos";

/**
 * Sube la capa de avisos al frente · decisiones §59.
 *
 * Un `Panel` abierto es un `<dialog>` modal: vive en el top layer del
 * navegador, por encima de cualquier `z-index`, y los avisos se pintaban detrás
 * de su fondo oscurecido («Etapa actualizada» no se veía con el popup del
 * prospecto abierto). La capa de avisos es un `popover` manual, que también va
 * al top layer, y el top layer ordena por llegada: volver a mostrarla la pone
 * encima de lo que esté abierto. Lo llaman cada aviso y el `Panel` al abrir.
 *
 * Ocultar y mostrar en el mismo tick **no reordena**: el navegador deja el
 * elemento en el top layer, en su sitio, hasta el siguiente frame (para las
 * animaciones de salida). Por eso se vuelve a mostrar dos frames después; la
 * capa parpadea un instante que no se ve. Sin un diálogo modal abierto no hay
 * nada que subir, y sin soporte de `popover` la capa es un `div` normal.
 */
export function elevarCapaDeAvisos() {
  if (typeof document === "undefined") return;
  const capa = document.getElementById(ID_CAPA_DE_AVISOS);
  if (!capa || typeof capa.showPopover !== "function") return;
  if (!document.querySelector("dialog:modal")) return;
  try {
    if (capa.matches(":popover-open")) capa.hidePopover();
  } catch {
    return;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        if (!capa.matches(":popover-open")) capa.showPopover();
      } catch {
        // Un popover sin conexión al documento: se queda donde está.
      }
    }),
  );
}

const DURACION = {
  exito: 4000,
  advertencia: 7000,
  error: 8000,
  informacion: 5000,
} as const;

/**
 * Los cuatro avisos del sistema.
 *
 * Se exponen envueltos y no `sileo` directo para que exista **una** forma de
 * notificar: si mañana hay que cambiar posición, duración o biblioteca, se
 * cambia aquí y no en quince pantallas.
 */
export const avisar = {
  /** Una operación terminó y la pantalla no lo deja ver por sí sola. */
  exito(titulo: string, detalle?: string) {
    elevarCapaDeAvisos();
    return sileo.success({ title: titulo, description: detalle, duration: DURACION.exito });
  },

  /** Pasó algo que el usuario necesita saber, pero que no lo detiene. */
  advertencia(titulo: string, detalle?: string) {
    elevarCapaDeAvisos();
    return sileo.warning({
      title: titulo,
      description: detalle,
      duration: DURACION.advertencia,
    });
  },

  /** Falló y no hay nada que corregir en el formulario. */
  error(titulo: string, detalle?: string) {
    elevarCapaDeAvisos();
    return sileo.error({ title: titulo, description: detalle, duration: DURACION.error });
  },

  informacion(titulo: string, detalle?: string) {
    elevarCapaDeAvisos();
    return sileo.info({
      title: titulo,
      description: detalle,
      duration: DURACION.informacion,
    });
  },
};

/**
 * Traduce un `ResultadoAccion` fallido a un aviso, **solo cuando corresponde**.
 *
 * Devuelve `true` si lo notificó. Cuando devuelve `false`, el problema es de los
 * que se pintan dentro del formulario y quien llama no debe hacer nada: la
 * pantalla ya lo está mostrando con `AvisosDeAccion`.
 *
 * Tenerlo en una función y no repartido evita el error que este sistema tiene
 * que evitar: que el mismo problema salga dos veces, una en el campo y otra
 * flotando encima.
 */
export function avisarSiCorresponde(resultado: ResultadoAccion<unknown> | null): boolean {
  if (!resultado || resultado.ok) return false;
  if (resultado.motivo !== "AUTORIZACION" && resultado.motivo !== "CONFLICTO") return false;

  const [primero, ...resto] = resultado.problemas;
  if (!primero) return false;

  const titulo = resultado.motivo === "AUTORIZACION" ? "No tienes permiso" : "Algo cambió";
  const detalle = [primero.mensaje, ...resto.map((p) => p.mensaje)].join(" ");

  avisar.error(titulo, detalle);
  return true;
}
