"use client";

import { useActionState, useId, useState, useTransition } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
  useProblemas,
  useResultadoVivo,
} from "@/components/ui/formulario";

type Guardar = (previo: ResultadoAccion<unknown> | null, form: FormData) => Promise<ResultadoAccion<unknown>>;
type Activar = (id: string, active: boolean) => Promise<ResultadoAccion<unknown>>;

export type FilaDeCatalogo = {
  id: string;
  name: string;
  active: boolean;
  usos: number;
  /** Solo campañas: el canal ligado. */
  channelId?: string | null;
  canal?: string | null;
};

type Tipo = "canal" | "campana";

const TEXTOS: Record<Tipo, { titulo: string; nuevo: string; editar: string; creado: string; guardado: string; desactivado: string; reactivado: string; vacio: string }> = {
  canal: {
    titulo: "Canales",
    nuevo: "Nuevo canal",
    editar: "Editar canal",
    creado: "Canal creado",
    guardado: "Canal actualizado",
    desactivado: "Canal desactivado",
    reactivado: "Canal reactivado",
    vacio: "Sin canales. Crea el primero para dar de alta prospectos.",
  },
  campana: {
    titulo: "Campañas",
    nuevo: "Nueva campaña",
    editar: "Editar campaña",
    creado: "Campaña creada",
    guardado: "Campaña actualizada",
    desactivado: "Campaña desactivada",
    reactivado: "Campaña reactivada",
    vacio: "Sin campañas. Crea una para ligar los prospectos que entren por ella.",
  },
};

/**
 * Canales o campañas de prospectos en Configuración · decisiones §68.
 *
 * Alta y renombre en un panel; «Desactivar» es la baja (MD-05): la fila se
 * queda, atenuada, con cuántos prospectos la usan, y se puede reactivar. La
 * campaña elige su canal entre los activos, más el que ya tenga.
 */
export function CatalogoDeProspectos({
  tipo,
  filas,
  canales = [],
  guardar,
  activar,
}: {
  tipo: Tipo;
  filas: FilaDeCatalogo[];
  /** Solo campañas: los canales para elegir. */
  canales?: { id: string; name: string; active: boolean }[];
  guardar: Guardar;
  activar: Activar;
}) {
  const t = TEXTOS[tipo];
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-texto-titulo">{t.titulo}</h2>
        <FormularioDeCatalogo tipo={tipo} canales={canales} guardar={guardar} />
      </div>

      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-texto-tenue">{t.vacio}</p>
      ) : (
        <ul className="mt-3 divide-y divide-borde">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className={f.active ? "text-texto-cuerpo" : "text-texto-tenue line-through"}>{f.name}</span>
              {tipo === "campana" && <span className="text-xs text-texto-tenue">{f.canal ?? "Sin canal"}</span>}
              {!f.active && <Pastilla>Inactivo</Pastilla>}
              <span className="tabular ml-auto text-xs text-texto-tenue" title="Prospectos que lo usan">
                {f.usos}
              </span>
              <FormularioDeCatalogo tipo={tipo} fila={f} canales={canales} guardar={guardar} />
              <AlternarActivo tipo={tipo} fila={f} activar={activar} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AlternarActivo({ tipo, fila, activar }: { tipo: Tipo; fila: FilaDeCatalogo; activar: Activar }) {
  const [pendiente, iniciar] = useTransition();
  const t = TEXTOS[tipo];
  const alPulsar = () =>
    iniciar(async () => {
      const r = await activar(fila.id, !fila.active);
      if (!r.ok) {
        avisarSiCorresponde(r);
        if (r.motivo === "VALIDACION") avisar.advertencia(r.problemas[0]?.mensaje ?? "No se pudo guardar.");
        return;
      }
      avisar.exito(fila.active ? t.desactivado : t.reactivado, fila.name);
    });
  return (
    <Boton variante="fantasma" onClick={alPulsar} disabled={pendiente} className="px-2 py-1 text-xs">
      {fila.active ? "Desactivar" : "Reactivar"}
    </Boton>
  );
}

/** Sin `fila` da de alta; con ella, renombra (y en campañas, cambia el canal). */
function FormularioDeCatalogo({
  tipo,
  fila,
  canales,
  guardar,
}: {
  tipo: Tipo;
  fila?: FilaDeCatalogo;
  canales: { id: string; name: string; active: boolean }[];
  guardar: Guardar;
}) {
  const [abierto, setAbierto] = useState(false);
  const t = TEXTOS[tipo];
  const esAlta = fila === undefined;

  const [resultado, enviar, enviando] = useActionState(async (previo: ResultadoAccion<unknown> | null, form: FormData) => {
    const r = await guardar(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    setAbierto(false);
    avisar.exito(esAlta ? t.creado : t.guardado);
    return r;
  }, null);
  const resultadoVivo = useResultadoVivo(resultado, abierto);
  const problemas = useProblemas(resultadoVivo);
  const alEnviar = useEnvioQueConserva(enviar);

  // §58: hay un panel por fila en la misma página; con ids fijos el botón del
  // pie enviaría el formulario de otra.
  const id = useId();
  const campo = (n: string) => `${id}-${n}`;
  const opcionesDeCanal = canales.filter((c) => c.active || c.id === fila?.channelId);

  return (
    <>
      {esAlta ? (
        <Boton variante="secundario" onClick={() => setAbierto(true)} className="px-2.5 py-1 text-xs">
          {t.nuevo}
        </Boton>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`${t.editar}: ${fila.name}`}
          title={t.editar}
          className="rounded-xs p-1.5 text-texto-tenue transition-colors duration-rapido ease-estandar hover:bg-superficie-sutil hover:text-texto-titulo focus:shadow-ring focus:outline-none"
        >
          <Icono nombre="lapiz" className="size-4" />
        </button>
      )}

      <Panel
        titulo={esAlta ? t.nuevo : t.editar}
        subtitulo={esAlta ? undefined : fila.name}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <div className="ml-auto flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" form={campo("form")} disabled={enviando}>
              {enviando ? "Guardando…" : esAlta ? (tipo === "canal" ? "Crear canal" : "Crear campaña") : "Guardar cambios"}
            </Boton>
          </div>
        }
      >
        <form id={campo("form")} onSubmit={alEnviar} onChange={problemas.alCambiar} className="flex flex-col gap-5">
          {fila && <input type="hidden" name="id" value={fila.id} />}
          <AvisosDeAccion resultado={resultadoVivo} />
          <Campo etiqueta="Nombre" htmlFor={campo("name")} problema={problemas.problema("name")}>
            <Entrada id={campo("name")} name="name" defaultValue={fila?.name ?? ""} autoComplete="off" maxLength={80} problema={problemas.problema("name")} />
          </Campo>
          {tipo === "campana" && (
            <Campo etiqueta="Canal" htmlFor={campo("channelId")} problema={problemas.problema("channelId")}>
              <Seleccion id={campo("channelId")} name="channelId" defaultValue={fila?.channelId ?? ""} problema={problemas.problema("channelId")}>
                <option value="">Sin canal</option>
                {opcionesDeCanal.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.active ? c.name : `${c.name} (inactivo)`}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          )}
        </form>
      </Panel>
    </>
  );
}
