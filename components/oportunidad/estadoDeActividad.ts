import { duracionEnMinutos, sumarMinutos } from "@/lib/tiempo";

export type EstadoDeActividad = {
  tipoId: string;
  asunto: string;
  /** Si quien captura ya escribió su propio asunto, distinto del sugerido. */
  asuntoTocado: boolean;
  /** `YYYY-MM-DD` y `HH:mm`, como hora de pared en la zona de la oportunidad. */
  fecha: string;
  inicio: string;
  fin: string;
  /** Si ya pasó. Por omisión no: lo normal es agendar lo que sigue. */
  hecha: boolean;
  /** Cuántas veces se limpió. Es la `key` del <form>: cambiarla lo remonta. */
  generacion: number;
};

export type AccionDeActividad =
  | { tipo: "ELEGIR_TIPO"; id: string; nombre: string }
  | { tipo: "ESCRIBIR_ASUNTO"; asunto: string }
  | { tipo: "CAMBIAR_FECHA"; fecha: string }
  | { tipo: "CAMBIAR_INICIO"; inicio: string }
  | { tipo: "CAMBIAR_FIN"; fin: string }
  | { tipo: "MARCAR_HECHA"; hecha: boolean }
  | { tipo: "LIMPIAR"; inicial: EstadoDeActividad };

/**
 * El estado con el que abre el composer: vacío para una actividad nueva, o
 * cargado con la que se está editando. Si viene `asunto`, es del usuario y no
 * se pisa al cambiar de tipo.
 */
export function estadoInicial(base: {
  tipo: { id: string; name: string } | undefined;
  asunto?: string;
  fecha: string;
  inicio: string;
  fin: string;
  hecha?: boolean;
}): EstadoDeActividad {
  return {
    tipoId: base.tipo?.id ?? "",
    asunto: base.asunto ?? base.tipo?.name ?? "",
    asuntoTocado: base.asunto !== undefined && base.asunto.trim() !== "",
    fecha: base.fecha,
    inicio: base.inicio,
    fin: base.fin,
    hecha: base.hecha ?? false,
    generacion: 0,
  };
}

/**
 * El estado acoplado del composer de actividad.
 *
 * ## El asunto sale del tipo, hasta que alguien escribe el suyo
 *
 * Elegir «Llamada» deja el asunto en «Llamada», y con eso la actividad ya se
 * puede guardar: dos clics. Pero si quien captura ya escribió «Cerrar
 * condiciones comerciales», cambiar de tipo **no lo pisa** —el mismo cuidado
 * que el nombre de la oportunidad en el alta—, porque un formulario que borra
 * lo que escribiste se usa una vez. Borrar el asunto entero sí lo vuelve a
 * dejar sugerible: quien vacía el campo está empezando de nuevo.
 *
 * ## Inicio y fin van juntos
 *
 * Mover el inicio arrastra el fin y conserva la duración: quien cambia
 * «10:30» por «11:00» está moviendo la reunión, no acortándola. Mover el fin
 * solo cambia el fin. Un fin antes del inicio se deja como está: la etiqueta
 * de duración lo delata y el servidor lo rechaza con su campo; adivinar qué
 * quiso decir el usuario sería peor.
 */
export function reducir(estado: EstadoDeActividad, accion: AccionDeActividad): EstadoDeActividad {
  switch (accion.tipo) {
    case "ELEGIR_TIPO":
      return {
        ...estado,
        tipoId: accion.id,
        asunto: estado.asuntoTocado ? estado.asunto : accion.nombre,
      };

    case "ESCRIBIR_ASUNTO":
      return {
        ...estado,
        asunto: accion.asunto,
        asuntoTocado: accion.asunto.trim() !== "",
      };

    case "CAMBIAR_FECHA":
      return { ...estado, fecha: accion.fecha };

    case "CAMBIAR_INICIO": {
      const duracion = Math.max(duracionEnMinutos(estado.inicio, estado.fin), 0);
      return { ...estado, inicio: accion.inicio, fin: sumarMinutos(accion.inicio, duracion) };
    }

    case "CAMBIAR_FIN":
      return { ...estado, fin: accion.fin };

    case "MARCAR_HECHA":
      return { ...estado, hecha: accion.hecha };

    case "LIMPIAR":
      return { ...accion.inicial, generacion: estado.generacion + 1 };
  }
}
