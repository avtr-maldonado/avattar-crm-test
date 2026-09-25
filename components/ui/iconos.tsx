import { clsx } from "clsx";

/**
 * Los iconos de la interfaz, trazados a mano sobre una rejilla de 20 px.
 *
 * Un solo estilo —trazo de 1.6, puntas redondeadas, sin relleno— y
 * `currentColor`, para que hereden el color del texto que acompañan y se
 * apaguen o enciendan con él. Sin librería: son diecinueve dibujos, y una
 * dependencia por diecinueve dibujos no se justifica.
 *
 * Cada nombre dice qué es la cosa, no cómo se ve: el día que Oportunidades
 * cambie de dibujo, nadie tiene que renombrar nada.
 */
export type NombreDeIcono =
  | "oportunidades"
  | "contactos"
  | "productos"
  | "actividades"
  | "analisis"
  | "objetivos"
  | "admin"
  | "lupa"
  | "contraer"
  | "expandir"
  | "chevron"
  | "riesgo"
  | "telefono"
  | "video"
  | "correo"
  | "sitio"
  | "reloj"
  | "lapiz"
  | "palomita"
  | "ayuda"
  | "filtro";

const TRAZOS: Record<NombreDeIcono, React.ReactNode> = {
  // Tres columnas de alturas distintas: el kanban.
  oportunidades: (
    <>
      <path d="M3.5 3.5h3.5v13H3.5zM8.25 3.5h3.5v8h-3.5zM13 3.5h3.5v10.5H13z" />
    </>
  ),
  // Dos personas, una delante de la otra.
  contactos: (
    <>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16.5c0-2.9 2.2-5 5-5s5 2.1 5 5" />
      <path d="M13 4.6a2.75 2.75 0 0 1 0 4.8M15 11.8c1.6.8 2.5 2.4 2.5 4.7" />
    </>
  ),
  // Una caja en isométrico.
  productos: (
    <>
      <path d="m3.5 6.5 6.5-3 6.5 3v7l-6.5 3-6.5-3z" />
      <path d="m3.5 6.5 6.5 3 6.5-3M10 9.5v7" />
    </>
  ),
  // Un calendario con una palomita: lo que hay que hacer y ya se hizo.
  actividades: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" />
      <path d="M3 8.5h14M7 2.75v3M13 2.75v3" />
      <path d="m7.5 12.6 1.7 1.7 3.3-3.5" />
    </>
  ),
  // Barras.
  analisis: (
    <>
      <path d="M3 17h14" />
      <path d="M5.5 14v-4.5M10 14V6M14.5 14V8.5" />
    </>
  ),
  // Una diana. Es el único icono del juego que nombra una meta y no una cosa,
  // y por eso vale la excepción: un objetivo no tiene forma propia.
  objetivos: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 1.75v2.25M10 16v2.25M1.75 10H4M16 10h2.25" />
    </>
  ),
  // Dos deslizadores: configuración.
  admin: (
    <>
      <path d="M3 6.5h14M3 13.5h14" />
      <circle cx="7.5" cy="6.5" r="2" />
      <circle cx="12.5" cy="13.5" r="2" />
    </>
  ),
  lupa: (
    <>
      <circle cx="9" cy="9" r="5.25" />
      <path d="m13 13 3.75 3.75" />
    </>
  ),
  // Doble chevrón hacia la izquierda: el menú se pliega hacia su borde.
  contraer: <path d="m11 5-5 5 5 5M15.5 5l-5 5 5 5" />,
  expandir: <path d="m9 5 5 5-5 5M4.5 5l5 5-5 5" />,
  // Apunta hacia abajo: lo giran los controles que se despliegan.
  chevron: <path d="m5 7.5 5 5 5-5" />,
  // Triángulo con admiración: la bandera de riesgo cuando no hay lugar para
  // escribirla. Su color dice la gravedad; el `title` dice cuál es.
  riesgo: (
    <>
      <path d="M8.7 3.9a1.5 1.5 0 0 1 2.6 0l6.2 11a1.5 1.5 0 0 1-1.3 2.25H3.8a1.5 1.5 0 0 1-1.3-2.25z" />
      <path d="M10 8v3.75M10 14.25v.01" />
    </>
  ),

  // ── Tipos de actividad ──────────────────────────────────────────────────
  // Un auricular descolgado.
  telefono: (
    <path d="M7.2 3.2 8.6 6 7.2 7.8c.9 1.8 2.2 3.1 4 4l1.8-1.4 2.8 1.4v2.4c0 .8-.7 1.4-1.5 1.3-2.9-.3-5.5-1.6-7.5-3.6S3.5 7.3 3.2 4.4c-.1-.8.5-1.5 1.3-1.5z" />
  ),
  // Una cámara: la reunión que no es presencial.
  video: (
    <>
      <rect x="2.75" y="5.5" width="10" height="9" rx="1.5" />
      <path d="m12.75 10.2 4.5-2.6v4.8l-4.5-2.6z" />
    </>
  ),
  // Un sobre.
  correo: (
    <>
      <rect x="2.5" y="4.75" width="15" height="10.5" rx="1.5" />
      <path d="m3 6 7 4.75L17 6" />
    </>
  ),
  // Un alfiler de mapa: la visita al sitio del cliente.
  sitio: (
    <>
      <path d="M10 17.5s5.5-5 5.5-9a5.5 5.5 0 1 0-11 0c0 4 5.5 9 5.5 9z" />
      <circle cx="10" cy="8.5" r="2" />
    </>
  ),
  // Un reloj: el seguimiento es una promesa con hora.
  reloj: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M10 6v4.25l2.75 1.75" />
    </>
  ),
  // Un lápiz: lo que se corrige sin salir de la ficha.
  lapiz: (
    <>
      <path d="m12.8 3.7 3.5 3.5-8.4 8.4-4.2.7.7-4.2z" />
      <path d="m11.2 5.3 3.5 3.5" />
    </>
  ),
  palomita: <path d="m4.5 10.5 3.6 3.6 7.4-8.2" />,

  // Un embudo: los filtros del tablero.
  filtro: <path d="M3.5 4.5h13l-5 6v4.5l-3 1.5v-6z" />,

  // Un círculo con signo de interrogación: «¿qué quiere decir esto?».
  ayuda: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M8 8.1a2.1 2.1 0 1 1 2.9 1.9c-.6.3-.9.7-.9 1.4v.3M10 14.3v.01" />
    </>
  ),
};

export function Icono({ nombre, className }: { nombre: NombreDeIcono; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("shrink-0", className)}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
