/**
 * Trimestres atados en la hoja de objetivos · decisiones §53.
 *
 * Casi toda cuota se captura igual en los cuatro trimestres y solo a veces uno
 * se mueve. Atarlos convierte cuatro capturas en una: lo que se teclea en un
 * trimestre atado se escribe en todos los atados de esa fila, al momento.
 *
 * Dos cosas que el control **no** hace, y no por olvido:
 *
 * - **Atar no pisa lo capturado.** Si la fila ya trae cuatro cifras distintas,
 *   pulsar el eslabón no las unifica: solo hace que la siguiente tecleada se
 *   propague. Así un clic por error no borra el trabajo de nadie.
 * - **El vínculo no tiene cabeza.** No es «Q1 manda»: teclear en cualquiera de
 *   los atados llena a los demás. Pedir que sea siempre Q1 obligaría a
 *   recordar cuál es el bueno.
 *
 * El estado es ayuda de captura, no dato: no viaja al servidor ni se guarda.
 * Vive mientras dura la hoja abierta.
 */

/** Ninguno atado: como se ve una fila que nunca usó el control. */
export const SIN_VINCULO: readonly boolean[] = [false, false, false, false];

/** Lo tecleado en el trimestre `i`, propagado a los que estén atados con él. */
export function teclearConVinculo(
  cuotas: readonly string[],
  vinculados: readonly boolean[],
  i: number,
  valor: string,
): string[] {
  if (!vinculados[i]) return cuotas.map((c, j) => (j === i ? valor : c));
  return cuotas.map((c, j) => (j === i || vinculados[j] ? valor : c));
}

/** El eslabón de la fila: ata los cuatro, y solo los suelta si ya estaban los cuatro. */
export function alternarTodos(vinculados: readonly boolean[]): boolean[] {
  return estanTodos(vinculados) ? [...SIN_VINCULO] : [true, true, true, true];
}

/** El eslabón de una celda: ata o suelta ese trimestre, sin tocar a los demás. */
export function alternarUno(vinculados: readonly boolean[], i: number): boolean[] {
  return vinculados.map((v, j) => (j === i ? !v : v));
}

export function estanTodos(vinculados: readonly boolean[]): boolean {
  return vinculados.length === 4 && vinculados.every(Boolean);
}

/** Si la fila usa el control: con alguno atado aparecen los eslabones de celda. */
export function hayVinculo(vinculados: readonly boolean[]): boolean {
  return vinculados.some(Boolean);
}
