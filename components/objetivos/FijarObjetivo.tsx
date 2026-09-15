"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { AvisosDeAccion, Campo, Entrada, Panel, Seleccion } from "@/components/ui/formulario";
import { Boton } from "@/components/ui/primitivas";

/**
 * Fijar la cuota de una persona · P-08.
 *
 * ## Por qué se captura una persona y un periodo a la vez
 *
 * La alternativa era una rejilla con todo el equipo y los cuatro trimestres, y
 * se descartó: son veinte campos de dinero en pantalla, un guardado masivo que
 * falla entero por un dedazo, y una bitácora que no sabría decir qué cambió.
 * Un periodo a la vez deja cada cambio con su renglón de auditoría, que es lo
 * que INV-09 pide para algo de lo que puede depender la variable de alguien.
 *
 * El formulario recuerda a la persona y el periodo tras guardar, porque el caso
 * real es cargar los cuatro trimestres de alguien seguidos: reiniciarlo obliga
 * a volver a elegir lo mismo tres veces.
 */
type Resultado = ResultadoAccion<{ id: string }>;

export type PersonaConCuota = { id: string; nombre: string };

export function FijarObjetivo({
  personas,
  pais,
  anio,
  accion,
}: {
  personas: PersonaConCuota[];
  pais: string;
  anio: number;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resultado, enviar, enviando] = useActionState(accion, null);
  const [periodo, setPeriodo] = useState<"TRIMESTRAL" | "ANUAL">("TRIMESTRAL");
  const yaAtendido = useRef<Resultado | null>(null);

  useEffect(() => {
    if (!resultado || yaAtendido.current === resultado) return;
    yaAtendido.current = resultado;

    if (!resultado.ok) {
      avisarSiCorresponde(resultado);
      return;
    }

    // Se queda abierto a propósito: cargar los cuatro trimestres de alguien es
    // el caso normal. El aviso confirma que el anterior quedó guardado.
    avisar.exito("Objetivo guardado");
    router.refresh();
  }, [resultado, router]);

  if (personas.length === 0) return null;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Fijar objetivo
      </Boton>

      <Panel
        titulo="Fijar objetivo"
        subtitulo={`${pais} · año fiscal ${anio} · USD`}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue">
              Reemplaza la cuota de ese periodo si ya existía. Queda en la bitácora con quién la
              cambió y desde qué cifra.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" onClick={() => setAbierto(false)}>
                Cerrar
              </Boton>
              <Boton type="submit" form="fijar-objetivo" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar objetivo"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="fijar-objetivo" action={enviar} className="flex flex-col gap-5">
          <input type="hidden" name="countryCode" value={pais} />
          <input type="hidden" name="fiscalYear" value={anio} />

          <Campo etiqueta="Persona" htmlFor="userId" problema={problemaDe(resultado, "userId")}>
            <Seleccion id="userId" name="userId" problema={problemaDe(resultado, "userId")}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Periodo" htmlFor="periodType">
              <Seleccion
                id="periodType"
                name="periodType"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as "TRIMESTRAL" | "ANUAL")}
              >
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="ANUAL">Anual</option>
              </Seleccion>
            </Campo>

            <Campo
              etiqueta="Trimestre"
              htmlFor="quarter"
              problema={problemaDe(resultado, "quarter")}
              ayuda={periodo === "ANUAL" ? "El anual no lleva trimestre." : undefined}
            >
              <Seleccion id="quarter" name="quarter" disabled={periodo === "ANUAL"}>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    T{q}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo
              etiqueta="Cuota de venta"
              htmlFor="revenueQuota"
              problema={problemaDe(resultado, "revenueQuota")}
            >
              <Entrada
                id="revenueQuota"
                name="revenueQuota"
                inputMode="decimal"
                placeholder="450000"
                required
                problema={problemaDe(resultado, "revenueQuota")}
              />
            </Campo>

            <Campo
              etiqueta="Cuota de utilidad"
              htmlFor="grossProfitQuota"
              problema={problemaDe(resultado, "grossProfitQuota")}
              ayuda="No puede ser mayor que la venta."
            >
              <Entrada
                id="grossProfitQuota"
                name="grossProfitQuota"
                inputMode="decimal"
                placeholder="135000"
                required
                problema={problemaDe(resultado, "grossProfitQuota")}
              />
            </Campo>
          </div>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
