"use client";

import { Suspense, use } from "react";

/**
 * El contador de un rubro de navegación, en streaming.
 *
 * El número llega como **promesa** desde el layout. Los contadores son tres
 * conteos con alcance —una consulta más, ~300 ms desde México— y esperarlos en
 * el layout retrasaba toda la pantalla: la barra, el encabezado y hasta el
 * esqueleto de carga de la página que ya podía estar pintado
 * (docs/latencia-dev.md, 4e). Con `Suspense` la barra sale de inmediato y el
 * número aparece cuando llega.
 *
 * Mientras llega no se pinta nada: un cero o un guion serían ruido justo donde
 * después habrá un pendiente. Y un cero tampoco se pinta cuando llega, por la
 * misma razón de siempre: los contadores cuentan pendientes que piden acción,
 * y «cero pendientes» no pide ninguna.
 */
export function ContadorRubro({
  valor,
  className,
  comoPunto = false,
}: {
  valor: Promise<number>;
  className: string;
  /** Con el menú contraído (§75): un punto en vez del número; el número va en `aria-label` y `title`. */
  comoPunto?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <Numero valor={valor} className={className} comoPunto={comoPunto} />
    </Suspense>
  );
}

function Numero({ valor, className, comoPunto }: { valor: Promise<number>; className: string; comoPunto: boolean }) {
  const n = use(valor);
  if (n <= 0) return null;
  if (comoPunto) return <span className={className} role="img" aria-label={`${n} pendientes`} title={`${n} pendientes`} />;
  return <span className={className}>{n}</span>;
}
