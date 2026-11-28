/**
 * Las cookies de preferencia de la sesión: nombres y valores.
 *
 * Módulo puro, sin `next/headers`, para que lo importen tanto el servidor
 * (`lib/auth/session`, las acciones) como los componentes cliente que escriben
 * la cookie del menú con `document.cookie`. Los valores son cadenas fijas y no
 * booleanos para que la cookie se lea igual desde cualquier lado.
 */
export const COOKIE_OFICINA = "crm-oficina";
export const COOKIE_MENU = "crm-menu";

export const MENU_COLAPSADO = "colapsado";
export const MENU_EXPANDIDO = "expandido";

/** Un año: una preferencia no caduca antes que la costumbre de quien la puso. */
export const UN_ANIO_EN_SEGUNDOS = 60 * 60 * 24 * 365;

/**
 * El tema de la interfaz · decisiones §76. «Sistema» sigue al sistema operativo con una media query,
 * así que el servidor pinta `data-tema` desde la cookie sin saber nada del dispositivo. Sin cookie,
 * claro: nadie amanece con la app oscura sin haberlo pedido.
 */
export const COOKIE_TEMA = "crm-tema";
export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];

export function temaDe(valor: string | undefined): Tema {
  return (TEMAS as readonly string[]).includes(valor ?? "") ? (valor as Tema) : "claro";
}
