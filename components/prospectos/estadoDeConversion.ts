import type { Eleccion, Sugerencia } from "@/components/ui/Autocompletado";

/**
 * El estado acoplado del panel de conversión · decisiones §59.
 *
 * El prospecto trae una empresa y una persona; el servidor dice si ya existen
 * (`Coincidencias`) y con eso el formulario arranca: cuenta y persona elegidas
 * si se encontraron, o nuevas con los datos del prospecto si no. Como en el
 * alta (`estadoDeAlta`), cambiar de cuenta reinicia a la persona —los
 * contactos son de una empresa— y la lista que llega del servidor se acepta
 * solo si es de la cuenta vigente.
 */
export type Prellenado = {
  companyName: string;
  companyIndustry: string | null;
  contactName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
};

/** Lo que el lector encontró: la cuenta homónima, sus contactos y la persona por correo. */
export type Coincidencias = {
  cuenta: Sugerencia | null;
  contactos: Sugerencia[];
  persona: Sugerencia | null;
};

export type EstadoDeConversion = {
  cuenta: Eleccion;
  persona: Eleccion;
  /** Los contactos de la cuenta elegida, o `null` mientras no lleguen o no haya cuenta existente. */
  contactos: Sugerencia[] | null;
  prellenado: Prellenado;
};

export type AccionDeConversion =
  | { tipo: "ELEGIR_CUENTA"; eleccion: Eleccion }
  | { tipo: "ELEGIR_PERSONA"; eleccion: Eleccion }
  | { tipo: "RECIBIR_CONTACTOS"; de: string; lista: Sugerencia[] };

function personaDelProspecto(p: Prellenado): Eleccion {
  return { tipo: "NUEVA", nombre: p.contactName };
}

export function estadoInicialDeConversion(prellenado: Prellenado, c: Coincidencias): EstadoDeConversion {
  const cuenta: Eleccion = c.cuenta ? { tipo: "EXISTENTE", id: c.cuenta.id, nombre: c.cuenta.nombre } : { tipo: "NUEVA", nombre: prellenado.companyName };
  const persona: Eleccion = c.persona ? { tipo: "EXISTENTE", id: c.persona.id, nombre: c.persona.nombre } : personaDelProspecto(prellenado);
  return { cuenta, persona, contactos: c.cuenta ? c.contactos : null, prellenado };
}

export function reducirConversion(estado: EstadoDeConversion, accion: AccionDeConversion): EstadoDeConversion {
  switch (accion.tipo) {
    case "ELEGIR_CUENTA":
      return { ...estado, cuenta: accion.eleccion, persona: personaDelProspecto(estado.prellenado), contactos: null };
    case "ELEGIR_PERSONA":
      return { ...estado, persona: accion.eleccion };
    case "RECIBIR_CONTACTOS": {
      const vigente = estado.cuenta.tipo === "EXISTENTE" && estado.cuenta.id === accion.de;
      return vigente ? { ...estado, contactos: accion.lista } : estado;
    }
  }
}
