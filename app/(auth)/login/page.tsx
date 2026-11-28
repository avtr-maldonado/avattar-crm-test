"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Inicio de sesión · F-1101, rediseñado el 27-nov-2026 con la marca Avattar v4 (decisiones §73).
 *
 * Un solo botón: Entra ID. No hay usuario y contraseña porque no hay
 * autoregistro — el alta es un acto administrativo. Ofrecer un formulario que
 * nadie puede usar solo genera intentos fallidos y llamadas a soporte.
 *
 * Fondo sólido `#0E1D35` (el del ícono y del tema de la PWA, §72); logo AVATTAR y «Work smart.» originales, azules sobre la tarjeta blanca, y
 * «Work smart.» chico en su franja del pie, sin nada encima.
 *
 * El botón va dentro de `<Suspense>` porque usa `useSearchParams`: sin esa
 * frontera, Next renderiza toda la página en el cliente y se pierde el HTML
 * estático del encabezado (regla `nextjs-no-use-search-params-without-suspense`).
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-navy-900 px-4 py-10">
      <section className="relative w-full max-w-[26rem] overflow-hidden rounded-[1.5rem] bg-white px-6 pt-9 text-center sm:px-9">
        <Image src="/marca/avattar-azul.png" alt="Avattar IT Solutions" width={220} height={40} priority className="mx-auto h-10 w-[220px]" />

        <div className="mt-7 flex items-center justify-center gap-3">
          <Image src="/pwa/icono-192.png" alt="" width={56} height={56} priority className="size-12 sm:size-14" />
          <h1 className="text-[2rem] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[2.25rem]">CRM Avattar</h1>
        </div>

        <p className="mt-7 text-sm font-bold text-navy-900">Entra con tu cuenta corporativa de Microsoft.</p>
        <p className="mt-1 text-sm text-navy-700">Es la misma que usas para el correo.</p>

        <Suspense fallback={<BotonPlaceholder />}>
          <BotonEntrar />
        </Suspense>

        <div className="mt-6 flex items-center gap-4" aria-hidden>
          <span className="h-px flex-1 bg-navy-100" />
          <IconoEscudo />
          <span className="h-px flex-1 bg-navy-100" />
        </div>

        <div className="mt-6 flex gap-3 rounded-2xl bg-navy-50 p-4 text-left">
          <IconoInfo />
          <div>
            <p className="text-sm font-bold text-navy-600">¿No tienes acceso?</p>
            <p className="mt-1 text-sm leading-relaxed text-navy-700">
              Solicita tu acceso a Administración.
            </p>
          </div>
        </div>

        {/* La franja del pie: ondas claras a la izquierda y «Work smart.» a la derecha, sin encimarse. */}
        <div className="relative mt-2 h-14">
          <OndasDelPie />
          <Image
            src="/marca/work-smart-azul.png"
            alt="Work smart."
            width={60}
            height={24}
            className="absolute bottom-3 right-0 h-6 w-[60px] sm:-right-3"
          />
        </div>
      </section>
    </main>
  );
}

function BotonPlaceholder() {
  return <div aria-hidden className="mt-6 h-12 w-full rounded-xl bg-navy-100" />;
}

function BotonEntrar() {
  const searchParams = useSearchParams();
  const [entrando, setEntrando] = useState(false);
  // El callback y el proveedor devuelven aquí con `?error=`: el intercambio del
  // código que falló, la base que no respondió. Si no se leyera, esas fallas se
  // verían como una pantalla de login sin explicación.
  const [error, setError] = useState<string | null>(() => searchParams.get("error"));

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
        <p role="status" className="mt-5 rounded-xl bg-navy-50 p-3 text-sm text-navy-700">
          Cerraste sesión en el CRM.
        </p>
      )}

      <button
        type="button"
        onClick={entrar}
        disabled={entrando}
        className="mt-6 flex h-12 w-full items-center gap-3 rounded-xl bg-navy-600 px-5 text-sm font-bold text-white transition-colors duration-rapido ease-estandar hover:bg-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:opacity-70"
      >
        <IconoCandado />
        <span className="flex-1 text-center">{entrando ? "Abriendo Microsoft…" : "Entrar con Microsoft"}</span>
        <IconoFlecha />
      </button>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-coral/40 bg-coral/10 p-3 text-left text-sm text-navy-700">
          {error}
        </p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────── Dibujos

/** Las ondas claras del pie de la tarjeta; se quedan a la izquierda para no tocar «Work smart.». */
function OndasDelPie() {
  return (
    <svg aria-hidden className="pointer-events-none absolute -bottom-px -left-6 h-full w-[78%] sm:-left-12" viewBox="0 0 360 80" preserveAspectRatio="none">
      <path className="fill-navy-50" d="M0 18C80 2 170 10 250 40c40 15 75 30 110 40H0Z" />
      <path className="fill-blue-100" d="M0 44c60-10 130-6 190 14 30 10 55 16 80 22H0Z" />
    </svg>
  );
}

function IconoCandado() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function IconoEscudo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-navy-600" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconoInfo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0 text-navy-600" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
