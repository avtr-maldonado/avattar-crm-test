import Link from "next/link";
import { getSessionResult } from "@/lib/auth/session";

/**
 * El usuario autenticó bien en Entra ID pero no tiene perfil en el CRM.
 *
 * Esta pantalla existe porque mandarlo a /login lo metería en un ciclo:
 * autentica correctamente, vuelve a empezar, y no entiende por qué. El alta es
 * un acto administrativo y hay que decirlo.
 */
export default async function SinAccesoPage() {
  const resultado = await getSessionResult();
  const correo = resultado.ok ? resultado.session.email : resultado.email;

  return (
    <main className="grid min-h-screen place-items-center bg-superficie-sutil px-4">
      <div className="w-full max-w-md rounded-lg bg-superficie-tarjeta p-8 shadow-md">
        <p className="eyebrow">Acceso no configurado</p>
        <h1 className="mt-2 text-h4 font-semibold">
          Tu cuenta entró, pero todavía no tiene perfil en el CRM
        </h1>

        <p className="mt-4 text-sm text-texto-cuerpo">
          Te autenticaste correctamente con Microsoft
          {correo ? (
            <>
              {" "}
              como <strong className="font-semibold">{correo}</strong>
            </>
          ) : null}
          . Lo que falta es el alta de tu usuario dentro del CRM, que hace
          Administración: aquí no hay registro por cuenta propia.
        </p>

        <div className="mt-6 rounded-sm bg-superficie-tinte p-4 text-sm">
          <p className="font-semibold text-texto-titulo">Qué hacer</p>
          <p className="mt-1 text-texto-cuerpo">
            Administración ya puede verte en su lista de pendientes de acceso y
            asignarte rol y país. Avísales; en cuanto lo hagan, vuelve a entrar y
            ya no verás esta pantalla.
          </p>
        </div>

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-acento hover:text-acento-hover"
        >
          Volver a intentar
        </Link>
      </div>
    </main>
  );
}
