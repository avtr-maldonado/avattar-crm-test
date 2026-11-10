/**
 * Lo que la pantalla de consentimiento dice de cada alcance · decisiones §61.
 *
 * Puro y en español (INV-14). Los dos del CRM se explican con lo que de verdad
 * permiten; los estándar de OpenID se traducen; lo que no se reconoce se
 * muestra tal cual y marcado, nunca se inventa.
 */
export type EtiquetaDeAlcance = { alcance: string; titulo: string; detalle: string };

const CONOCIDOS: Record<string, Omit<EtiquetaDeAlcance, "alcance">> = {
  "crm:read": {
    titulo: "Consultar tus oportunidades",
    detalle: "Ver tus oportunidades, sus actividades, notas y transcripciones. Nunca costo ni utilidad.",
  },
  "crm:write": {
    titulo: "Guardar recomendaciones",
    detalle: "Escribir en el CRM el análisis de una oportunidad, con sus fuentes. Cada guardado queda en la bitácora.",
  },
  openid: { titulo: "Saber quién eres", detalle: "Tu identidad de Microsoft, para actuar en tu nombre." },
  email: { titulo: "Ver tu correo", detalle: "La dirección con la que entras al CRM." },
  profile: { titulo: "Ver tu nombre", detalle: "Tu nombre tal como aparece en Microsoft." },
  phone: { titulo: "Ver tu teléfono", detalle: "El teléfono de tu cuenta, si lo tiene." },
};

export function etiquetaDeAlcance(alcance: string): EtiquetaDeAlcance {
  const conocido = CONOCIDOS[alcance];
  return conocido ? { alcance, ...conocido } : { alcance, titulo: alcance, detalle: "Alcance que el CRM no reconoce." };
}

/** La cadena `scope` de OAuth como lista, sin vacíos ni repetidos. */
export function alcancesPedidos(scope: string): string[] {
  return [...new Set(scope.split(/\s+/).filter(Boolean))];
}
