/**
 * Qué se envía al soltar una tarjeta en una columna.
 *
 * ## Por qué esto es una función y no estado del componente
 *
 * La primera versión guardaba la tarjeta y el destino en estado, los pintaba en
 * campos ocultos y enviaba el formulario. **No funcionaba nunca**: las
 * actualizaciones de estado de React son asíncronas, así que al enviar en el
 * mismo tick los campos ocultos todavía tenían los valores anteriores —vacíos
 * en el primer arrastre—. La acción recibía identificadores en blanco, Zod
 * rechazaba con `VALIDACION`, y como no era `COMPUERTA` no se abría panel ni
 * salía aviso: el arrastre se veía como si no hiciera nada.
 *
 * Construir el envío aquí, con los valores que el soltar tiene en la mano,
 * elimina esa clase de error entera: no hay estado intermedio del que depender.
 */
export type TarjetaArrastrada = { id: string; nombre: string; etapaId: string };

/**
 * El `FormData` del movimiento, o `null` si no hay nada que mover.
 *
 * Soltar una tarjeta en su propia columna no es un error ni una operación: es
 * lo que pasa cuando alguien empieza a arrastrar y se arrepiente.
 */
export function envioDeMovimiento(
  arrastrada: TarjetaArrastrada | null,
  etapaDestinoId: string,
  opciones: { omitirCompuerta?: boolean } = {},
): FormData | null {
  if (!arrastrada) return null;
  if (arrastrada.etapaId === etapaDestinoId) return null;

  const datos = new FormData();
  datos.set("opportunityId", arrastrada.id);
  datos.set("toStageId", etapaDestinoId);
  if (opciones.omitirCompuerta) datos.set("omitirCompuerta", "true");
  return datos;
}
