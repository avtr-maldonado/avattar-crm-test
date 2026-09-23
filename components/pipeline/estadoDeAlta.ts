import type { Eleccion, Sugerencia } from "@/components/ui/Autocompletado";

/** El separador del nombre sugerido. Es el que usa el resto del sistema. */
export const SEPARADOR = " · ";

export type EstadoDeAlta = {
  organizacion: Eleccion;
  persona: Eleccion;
  /**
   * Los contactos de la organización elegida, o `null` mientras no hayan
   * llegado. Siempre son de la organización vigente: elegir otra los descarta
   * y una respuesta para otra cuenta se ignora.
   */
  contactos: Sugerencia[] | null;
  nombre: string;
  /** Si quien captura ya escribió su propia descripción del servicio. */
  nombreTocado: boolean;
  /** Cuántas veces se limpió. Es la `key` del <form>: cambiarla lo remonta. */
  generacion: number;
};

export type AccionDeAlta =
  | { tipo: "ELEGIR_ORGANIZACION"; eleccion: Eleccion }
  | { tipo: "ELEGIR_PERSONA"; eleccion: Eleccion }
  | { tipo: "RECIBIR_CONTACTOS"; de: string; lista: Sugerencia[] }
  | { tipo: "ESCRIBIR_NOMBRE"; nombre: string }
  | { tipo: "LIMPIAR" };

export const ESTADO_INICIAL: EstadoDeAlta = {
  organizacion: { tipo: "VACIA" },
  persona: { tipo: "VACIA" },
  contactos: null,
  nombre: "",
  nombreTocado: false,
  generacion: 0,
};

export function prefijoDe(organizacion: Eleccion): string {
  return organizacion.tipo === "VACIA" ? "" : organizacion.nombre + SEPARADOR;
}

/** El nombre sigue siendo el que puso el sistema, sin nada añadido. */
export function nombreEsSugerido(estado: EstadoDeAlta): boolean {
  return estado.nombre === prefijoDe(estado.organizacion) || estado.nombre === "";
}

/**
 * El estado acoplado del alta, en un reductor.
 *
 * Los campos se mueven juntos: elegir organización reinicia la persona y su
 * lista de contactos —los contactos son de una empresa, no del formulario— y
 * reescribe el prefijo del nombre. Con `useState` sueltos, esa coordinación
 * queda repartida entre varios manejadores y basta olvidar uno para que la
 * pantalla muestre el contacto de la empresa anterior. Por lo mismo, la lista
 * que llega del servidor se acepta aquí y no en el componente: si ya se eligió
 * otra empresa, la respuesta vieja se descarta sin que nadie tenga que
 * acordarse de compararla.
 *
 * ## La regla del nombre, que es lo sutil de esta pantalla
 *
 * Al elegir organización, el nombre pasa a «Aceros del Norte · ». Si quien
 * captura ya escribió la descripción del servicio, **no se pisa**: solo se
 * cambia el prefijo y se conserva lo demás. Un formulario que borra lo que
 * escribiste es un formulario que se usa una vez.
 */
export function reducir(estado: EstadoDeAlta, accion: AccionDeAlta): EstadoDeAlta {
  switch (accion.tipo) {
    case "ELEGIR_ORGANIZACION": {
      const anterior = prefijoDe(estado.organizacion);
      const nuevo = prefijoDe(accion.eleccion);

      const nombre = !estado.nombreTocado
        ? nuevo
        : anterior && estado.nombre.startsWith(anterior)
          ? nuevo + estado.nombre.slice(anterior.length)
          : estado.nombre;

      return {
        ...estado,
        organizacion: accion.eleccion,
        // Los contactos cuelgan de la empresa: cambiar de empresa sin limpiar
        // la persona dejaría ligado a alguien que no trabaja ahí.
        persona: { tipo: "VACIA" },
        contactos: null,
        nombre,
      };
    }

    case "ELEGIR_PERSONA":
      return { ...estado, persona: accion.eleccion };

    case "RECIBIR_CONTACTOS": {
      const vigente =
        estado.organizacion.tipo === "EXISTENTE" && estado.organizacion.id === accion.de;
      return vigente ? { ...estado, contactos: accion.lista } : estado;
    }

    case "ESCRIBIR_NOMBRE":
      return { ...estado, nombre: accion.nombre, nombreTocado: true };

    case "LIMPIAR":
      return { ...ESTADO_INICIAL, generacion: estado.generacion + 1 };
  }
}
