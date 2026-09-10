import Image from "next/image";
import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL } from "@/lib/etiquetas";
import { RubrosNavegacion, type Rubro } from "./RubrosNavegacion";

/**
 * Barra lateral fija · §13.5.
 *
 * ## Alto y desplazamiento
 *
 * Ocupa exactamente el alto de la pantalla y no se desplaza: `h-screen` con
 * `sticky top-0` y `overflow-hidden`. Quien hace scroll es el contenido. Una
 * barra que se va hacia arriba obliga a subir para cambiar de pantalla, y en
 * una aplicación que se usa ocho horas eso se paga en cada cambio de contexto.
 *
 * Si algún día los rubros no caben, el que gana scroll es el bloque central
 * —`overflow-y-auto`—, nunca la barra completa: el logotipo y la sesión se
 * quedan anclados.
 *
 * ## El bloque de sesión
 *
 * No es una firma decorativa al pie. En un sistema cuyo eje es el alcance por
 * rol (§2.3), **bajo qué alcance estoy operando** es información de trabajo:
 * explica por qué el pipeline muestra catorce oportunidades y no cuarenta, y
 * por qué Análisis aparece o no en el menú. Por eso está siempre a la vista y
 * no escondido tras el avatar.
 *
 * No es un conmutador. El prototipo mostraba tres roles seleccionables, que es
 * un recurso de demostración: con autenticación real, dejar que alguien cambie
 * su propio rol es escalada de privilegios. El rol lo cambia Administración.
 */
export type SeccionNavegacion = {
  titulo: string;
  rubros: Rubro[];
};

export function BarraLateral({
  secciones,
  usuario,
}: {
  secciones: SeccionNavegacion[];
  usuario: {
    nombre: string;
    iniciales: string;
    rol: Role;
    paises: CountryCode[];
  };
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-navy-900 lg:flex">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <Image
          src="/marca/avattar-blanco.png"
          alt="Avattar IT Solutions"
          width={534}
          height={200}
          priority
          className="h-6 w-auto"
        />
        <span className="border-l border-navy-700 pl-3 text-sm font-semibold tracking-wide text-white">
          CRM
        </span>
      </div>

      <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {secciones.map((s) => (
          <Seccion key={s.titulo} seccion={s} />
        ))}
      </nav>

      <BloqueDeSesion usuario={usuario} />
    </aside>
  );
}

function Seccion({ seccion }: { seccion: SeccionNavegacion }) {
  if (seccion.rubros.length === 0) return null;

  return (
    <div className="pb-5 pt-3 first:pt-0">
      <p className="eyebrow px-2.5 pb-2 text-navy-400">{seccion.titulo}</p>
      <RubrosNavegacion rubros={seccion.rubros} />
    </div>
  );
}

/**
 * Quién soy y sobre qué datos opero. Lo segundo es lo que casi nunca se muestra
 * y aquí es lo que más explica: el alcance decide todo lo que la pantalla dice.
 */
function BloqueDeSesion({
  usuario,
}: {
  usuario: { nombre: string; iniciales: string; rol: Role; paises: CountryCode[] };
}) {
  return (
    <div className="shrink-0 border-t border-navy-800 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-acento text-xs font-semibold text-navy-900"
        >
          {usuario.iniciales}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium text-white">{usuario.nombre}</p>
          <p className="truncate text-xs text-navy-300">{ETIQUETA_ROL[usuario.rol]}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span className="eyebrow text-navy-500">Alcance</span>
        <span className="flex gap-1">
          {usuario.paises.map((p) => (
            <span
              key={p}
              className="rounded-xs bg-navy-800 px-1.5 py-0.5 text-xs font-medium text-navy-200"
            >
              {p}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
