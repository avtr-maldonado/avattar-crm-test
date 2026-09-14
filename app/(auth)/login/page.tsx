"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Inicio de sesión · F-1101.
 *
 * Un solo botón: Entra ID. No hay usuario y contraseña porque no hay
 * autoregistro — `enable_signup` está en `false` y el alta es un acto
 * administrativo. Ofrecer un formulario que nadie puede usar solo genera
 * intentos fallidos y llamadas a soporte.
 *
 * El botón va dentro de `<Suspense>` porque usa `useSearchParams`: sin esa
 * frontera, Next renderiza toda la página en el cliente y se pierde el HTML
 * estático del encabezado (regla `nextjs-no-use-search-params-without-suspense`).
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-superficie-sutil px-4">
      <div className="w-full max-w-sm rounded-lg bg-superficie-tarjeta p-8 shadow-md">
        <p className="eyebrow">Avattar IT Solutions</p>
        <h1 className="mt-2 text-h3 font-semibold">CRM comercial</h1>
        <p className="mt-3 text-sm text-texto-tenue">
          Entra con tu cuenta corporativa de Microsoft. Es la misma que usas para
          el correo.
        </p>

        <Suspense fallback={<BotonPlaceholder />}>
          <BotonEntrar />
        </Suspense>

        <p className="mt-6 text-xs text-texto-tenue">
          ¿No tienes acceso? El alta de usuarios la hace Administración; no hay
          registro por cuenta propia.
        </p>
      </div>
    </main>
  );
}

function BotonPlaceholder() {
  return (
    <div
      aria-hidden
      className="mt-6 h-11 w-full rounded-sm bg-superficie-tinte"
    />
  );
}

function BotonEntrar() {
  const searchParams = useSearchParams();
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A dónde iba el usuario antes de que el middleware lo mandara aquí.
  const destino = searchParams.get("destino") ?? "/oportunidades";
  // Viene de «Cerrar sesión» (/auth/signout). Se confirma con el mismo verbo.
  const cerroSesion = searchParams.get("salida") === "1";

  async function entrar() {
    setEntrando(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid profile email",
        redirectTo: `${window.location.origin}/auth/callback?destino=${encodeURIComponent(destino)}`,
      },
    });

    if (error) {
      setEntrando(false);
      // §13.5 · el error dice qué falta con el dato concreto, no «algo salió mal».
      setError(
        error.message.includes("provider is not enabled")
          ? "El proveedor de Entra ID todavía no está habilitado en este proyecto de Supabase. Es configuración pendiente, no una falla de tu cuenta."
          : error.message,
      );
    }
  }

  return (
    <>
      {cerroSesion && (
        <p role="status" className="mt-4 rounded-sm bg-superficie-tinte p-3 text-xs text-texto-cuerpo">
          Cerraste sesión en el CRM.
        </p>
      )}

      <button
        type="button"
        onClick={entrar}
        disabled={entrando}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-acento px-4 py-3 text-sm font-semibold text-acento-texto transition-colors duration-rapido ease-estandar hover:bg-acento-hover disabled:opacity-60"
      >
        {entrando ? "Abriendo Microsoft…" : "Entrar con Microsoft"}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-sm border border-coral/40 bg-coral/10 p-3 text-xs text-texto-cuerpo"
        >
          {error}
        </p>
      )}
    </>
  );
}
