"use client";

import { Boton } from "@/components/ui/primitivas";

/**
 * Lo que ve quien llega a una excepción del servidor que nadie atrapó.
 *
 * Sin este archivo, Next pinta su pantalla genérica en inglés y sin más dato
 * que «a server-side exception has occurred». Aquí se dice en español qué pasó
 * y se da el código con el que el error se encuentra en el registro del
 * servidor: en producción Next no envía el mensaje al navegador, solo ese
 * `digest`, así que es lo único que quien administra puede buscar.
 *
 * §13.5 · el error dice qué hacer a continuación: reintentar, o pasar el código.
 */
export default function ErrorDelServidor({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-superficie-sutil px-4">
      <div className="w-full max-w-md rounded-lg bg-superficie-tarjeta p-8 shadow-md">
        <p className="eyebrow">Error del servidor</p>
        <h1 className="mt-2 text-h4 font-semibold text-texto-titulo">
          Algo falló al preparar esta pantalla
        </h1>
        <p className="mt-4 text-sm text-texto-cuerpo">
          El detalle quedó en el registro del servidor
          {error.digest ? (
            <>
              {" "}
              con el código <code className="tabular rounded-xs bg-superficie-sutil px-1.5 py-0.5 text-xs">{error.digest}</code>
            </>
          ) : null}
          . Vuelve a intentar; si sigue igual, pásale ese código a quien administra el CRM.
        </p>
        <div className="mt-6 flex gap-3">
          <Boton onClick={reset}>Reintentar</Boton>
          <Boton href="/oportunidades" variante="secundario">
            Ir al pipeline
          </Boton>
        </div>
      </div>
    </main>
  );
}
