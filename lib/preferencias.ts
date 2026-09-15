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
