"use client";

import clsx from "clsx";

export type EtapaElegible = {
  id: string;
  name: string;
  position: number;
  probability: string;
  requisitos: number;
  /** Decide si sus requisitos se pueden omitir con confirmación (§8.3). */
  gateMode: "ADVERTENCIA" | "BLOQUEANTE";
};

/**
 * Selector de etapa en galones, al estilo del que usa Pipedrive.
 *
 * ## Por qué azul y no verde
 *
 * La referencia usa verde. Aquí no puede: §13.1 dice que los colores de estado
 * **no deben** usarse como color decorativo, y en este sistema el verde ya
 * significa una cosa concreta —margen en o sobre el piso—, que es «la señal más
 * importante de toda la interfaz». Un verde aquí competiría con ella. Los
 * galones van en el azul de marca, que es el que §13.1 dice que domina.
 *
 * ## Por qué son radios de verdad
 *
 * Los galones son `<input type="radio">` ocultos visualmente, no `<div>` con
 * `onClick`. Así el grupo se recorre con las flechas, se anuncia con lector de
 * pantalla y el `name` viaja solo en el `FormData`. Un selector bonito que el
 * teclado no puede operar es la forma más común de romper un formulario.
 */
export function SelectorDeEtapa({
  name,
  etapas,
  valor,
  alCambiar,
}: {
  name: string;
  etapas: EtapaElegible[];
  valor: string;
  alCambiar: (id: string) => void;
}) {
  const ordenadas = [...etapas].sort((a, b) => a.position - b.position);
  const elegida = ordenadas.find((e) => e.id === valor) ?? ordenadas[0];
  const indice = ordenadas.findIndex((e) => e.id === elegida?.id);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Etapa"
        className="flex w-full items-stretch gap-[3px] rounded-sm"
      >
        {ordenadas.map((etapa, i) => {
          const alcanzada = i <= indice;
          const esLaElegida = i === indice;

          return (
            <label
              key={etapa.id}
              title={`${etapa.name} · ${Math.round(Number(etapa.probability) * 100)} %`}
              className={clsx(
                "group relative flex h-9 flex-1 cursor-pointer items-center justify-center",
                "transition-colors duration-rapido ease-estandar",
                // El galón: recortado en punta a la derecha y con muesca a la
                // izquierda, salvo en los extremos, que quedan rectos.
                i > 0 && "-ml-[10px]",
                alcanzada ? "bg-acento" : "bg-gray-10 hover:bg-gray-20",
                esLaElegida && "bg-acento-activo",
                "focus-within:z-10 focus-within:shadow-ring",
              )}
              style={{
                clipPath:
                  i === 0
                    ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                    : i === ordenadas.length - 1
                      ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)"
                      : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
                borderRadius: i === 0 ? "6px 0 0 6px" : i === ordenadas.length - 1 ? "0 6px 6px 0" : undefined,
              }}
            >
              <input
                type="radio"
                name={name}
                value={etapa.id}
                checked={esLaElegida}
                onChange={() => alCambiar(etapa.id)}
                className="sr-only"
              />
              <span
                className={clsx(
                  "px-2 text-center text-[11px] font-semibold leading-tight",
                  alcanzada ? "text-acento-texto" : "text-texto-tenue",
                  i > 0 && "pl-3",
                )}
              >
                {etapa.name}
              </span>
            </label>
          );
        })}
      </div>

      {elegida && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-tenue">
          <span className="font-semibold text-texto-cuerpo">{elegida.name}</span>
          <span aria-hidden>·</span>
          <span className="[font-variant-numeric:tabular-nums]">
            {Math.round(Number(elegida.probability) * 100)} % de probabilidad
          </span>
          {elegida.requisitos > 0 && (
            <>
              <span aria-hidden>·</span>
              {/*
                Decírselo ANTES de enviar. Que el servidor rechace es correcto,
                pero enterarse al momento de guardar es enterarse tarde.
              */}
              <span className="font-medium text-navy-500">
                {elegida.requisitos === 1 ? "1 requisito de entrada" : `${elegida.requisitos} requisitos de entrada`}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
