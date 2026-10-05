"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";

export type PermisoDeMatriz = {
  code: string;
  name: string;
  description: string | null;
  porRol: Record<string, { granted: boolean; limite: string | null }>;
};

type Resultado = ResultadoAccion;

/**
 * La matriz de roles y permisos · P-11, decisiones §40 y §43.
 *
 * Se abre siempre en lectura: la tabla de siempre, con «—», «✓» y el tope.
 * Quien puede editar —Administración, por rol y no por permiso— tiene arriba
 * un botón que enciende la edición: cada celda pasa a ser una casilla que
 * guarda al cambiar, y los permisos con tope llevan además el porcentaje.
 * «Terminar» devuelve la lectura. La columna de Administración se queda en
 * solo lectura siempre: es la que permite editar las demás. Un cambio
 * rechazado vuelve como aviso y la casilla regresa a su valor al releer.
 */
export function MatrizDePermisos({
  permisos,
  roles,
  etiquetas,
  usuariosPorRol,
  conTope,
  puedeEditar,
  accion,
}: {
  permisos: PermisoDeMatriz[];
  roles: readonly string[];
  etiquetas: Record<string, string>;
  usuariosPorRol: Record<string, number>;
  /** Códigos que admiten tope (autorizar descuento). */
  conTope: readonly string[];
  puedeEditar: boolean;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const admitenTope = new Set(conTope);

  function guardar(role: string, code: string, granted: boolean, limite?: string) {
    const form = new FormData();
    form.set("role", role);
    form.set("code", code);
    form.set("granted", granted ? "true" : "false");
    if (limite !== undefined) form.set("limite", limite);
    iniciar(async () => {
      const r = await accion(null, form);
      if (!r.ok) {
        if (!avisarSiCorresponde(r)) avisar.error("No se guardó", r.problemas.map((p) => p.mensaje).join(" "));
      }
      router.refresh();
    });
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-3 flex items-center justify-end">
          <Boton
            variante={editando ? "secundario" : "primario"}
            onClick={() => setEditando((e) => !e)}
            disabled={guardando}
            title={editando ? "Volver a la vista de lectura" : "Marcar y desmarcar permisos por rol"}
          >
            {editando ? "Terminar edición" : "Editar permisos"}
          </Boton>
        </div>
      ) : null}

      <section
        className={clsx(
          "overflow-x-auto rounded-md border bg-superficie-tarjeta",
          editando ? "border-acento" : "border-borde",
          guardando && "opacity-70",
        )}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-superficie-sutil">
            <tr>
              <th className="eyebrow px-3 py-2 text-left font-medium">Permiso</th>
              {roles.map((r) => (
                <th key={r} className="eyebrow px-3 py-2 text-center font-medium">
                  {etiquetas[r] ?? r}
                  <span className="tabular block text-xs font-normal normal-case tracking-normal text-texto-tenue">
                    {usuariosPorRol[r] ?? 0} {(usuariosPorRol[r] ?? 0) === 1 ? "usuario" : "usuarios"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permisos.map((p) => (
              <tr key={p.code} className="border-t border-borde">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-texto-titulo" title={p.description ?? undefined}>
                    {p.name}
                  </p>
                  <p className="font-mono text-xs text-texto-tenue">{p.code}</p>
                </td>
                {roles.map((r) => {
                  const v = p.porRol[r] ?? { granted: false, limite: null };
                  const bloqueada = !editando || r === "ADMINISTRADOR";
                  const admiteTope = admitenTope.has(p.code);
                  return (
                    <td key={r} className="px-3 py-2.5 text-center align-middle">
                      {bloqueada ? (
                        <Lectura granted={v.granted} limite={v.limite} />
                      ) : (
                        <div className="inline-flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            aria-label={`${p.name} · ${etiquetas[r] ?? r}`}
                            checked={v.granted}
                            disabled={guardando}
                            onChange={(e) => guardar(r, p.code, e.target.checked, admiteTope && e.target.checked ? (v.limite ?? "") : undefined)}
                            className="h-4 w-4 accent-acento"
                          />
                          {admiteTope && v.granted ? (
                            <label className="tabular flex items-center gap-1 text-xs text-texto-tenue">
                              hasta
                              <input
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                aria-label={`Tope de ${p.name} · ${etiquetas[r] ?? r}`}
                                defaultValue={v.limite ? Math.round(Number(v.limite) * 100) : ""}
                                placeholder="sin tope"
                                disabled={guardando}
                                onBlur={(e) => {
                                  const porCiento = e.target.value.trim();
                                  const fraccion = porCiento === "" ? "" : String(Number(porCiento) / 100);
                                  if (fraccion !== (v.limite ?? "")) guardar(r, p.code, true, fraccion);
                                }}
                                className="w-14 rounded-sm border border-borde bg-superficie-pagina px-1.5 py-0.5 text-right text-xs text-texto-cuerpo outline-none focus:border-acento"
                              />
                              %
                            </label>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Lectura({ granted, limite }: { granted: boolean; limite: string | null }) {
  if (!granted) {
    return (
      <span className="text-texto-tenue" title="No concedido">
        —
      </span>
    );
  }
  if (limite) {
    return <span className="tabular text-xs font-semibold text-exito">hasta {Math.round(Number(limite) * 100)} %</span>;
  }
  return (
    <span className="font-semibold text-exito" title="Concedido">
      ✓
    </span>
  );
}
