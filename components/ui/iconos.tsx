import { clsx } from "clsx";

/**
 * Los iconos de la interfaz, trazados a mano sobre una rejilla de 20 px.
 *
 * Un solo estilo —trazo de 1.6, puntas redondeadas, sin relleno— y
 * `currentColor`, para que hereden el color del texto que acompañan y se
 * apaguen o enciendan con él. Sin librería: son nueve dibujos, y una
 * dependencia por nueve dibujos no se justifica.
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
  | "chevron";

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
