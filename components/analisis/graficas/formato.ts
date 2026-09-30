/**
 * Formato corto para ejes y etiquetas de barra: «$328.8K», «56 %».
 *
 * Es el único formateo de dinero que vive en el cliente, y solo porque Recharts
 * entrega los ticks como número. No se opera nada con él (INV-03): el importe
 * exacto, «$328,835.00», lo formatea el servidor con `Decimal` y viaja en el
 * tooltip como texto.
 */
export function formatoCompacto(valor: number): string {
  const signo = valor < 0 ? "−" : "";
  const abs = Math.abs(valor);
  if (abs < 1000) return `${signo}$${Math.round(abs)}`;
  const enMillones = abs / 1_000_000;
  if (enMillones >= 0.99995) return `${signo}$${enMillones.toFixed(1)}M`;
  return `${signo}$${(abs / 1000).toFixed(1)}K`;
}

/** Un tick del eje: como el compacto, pero «$85K» y no «$85.0K». La etiqueta de barra sí conserva el decimal. */
export function formatoDeEje(valor: number): string {
  return formatoCompacto(valor).replace(/\.0([KM])$/, "$1");
}

/** Una fracción como por ciento entero, con el espacio del español: «56 %». */
export function formatoDePorcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)} %`;
}

/** Una etiqueta de eje que no cabe: «Consultoría de arquitec…». El nombre completo va en el tooltip. */
export function acortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, Math.max(1, maximo - 1)).trimEnd()}…`;
}
