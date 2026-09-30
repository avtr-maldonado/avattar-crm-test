/**
 * Lo que dice una pastilla de filtro · §9: su valor, no su nombre.
 *
 * Puro y aparte del componente: un archivo de componentes que exporta cosas
 * que no son componentes rompe el Fast Refresh de React.
 */
export type OpcionDeFiltro = { valor: string; etiqueta: string };

export function resumenDeUno(opciones: OpcionDeFiltro[], elegido: string | null): string {
  if (!elegido) return "todos";
  return opciones.find((o) => o.valor === elegido)?.etiqueta ?? "uno";
}

export function resumenDeVarios(opciones: OpcionDeFiltro[], elegidos: string[]): string {
  if (elegidos.length === 0) return "todos";
  if (elegidos.length === 1) {
    return opciones.find((o) => o.valor === elegidos[0])?.etiqueta ?? "1 elegido";
  }
  return `${elegidos.length} elegidos`;
}
