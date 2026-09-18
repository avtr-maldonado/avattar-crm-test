import type { CountryCode, OrganizationType, Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { iniciales } from "@/lib/etiquetas";
import type { OrganizacionConGente } from "@/lib/scope/organizations";
import type { PersonaEditable } from "@/lib/scope/people";

/**
 * Contactos: la ficha de la cuenta y su gente · P-03 y P-04.
 *
 * ## Dos permisos distintos, y la diferencia importa · `Q-15`
 *
 * El spec no dice quién edita un contacto. Se derivan dos reglas, no una:
 *
 * - **La ficha de la empresa** —razón social, identificador fiscal, giro, días
 *   de crédito, propietario— la edita su propietario o quien tenga alcance de
 *   oficina. El registro de la cuenta es de quien la lleva.
 * - **Las personas** las edita cualquiera que alcance la organización.
 *
 * La razón de la asimetría: capturar al contacto que acabas de conocer es parte
 * de trabajar la oportunidad. Si un vendedor con una oportunidad en cuenta
 * ajena no pudiera hacerlo, o no lo captura —y el dato se pierde— o le pide a
 * otro que lo haga —y no se hace—. La ficha, en cambio, sí es del dueño.
 *
 * Queda registrada como `Q-15` para confirmar con el Director junto con `Q-01`,
 * `Q-13` y `Q-14`: son de la misma familia.
 */

// ═══════════════════════════════════════════════════════════════ Personas

export type DatosDePersona = {
  name?: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  committeeRoleId?: string | null;
};

/**
 * Traduce los datos a un `update` de Prisma, o devuelve el problema.
 *
 * Las **iniciales se derivan del nombre**, aquí y al crear: es un campo más que
 * llenar por un dato que el nombre ya contiene, y capturarlo a mano garantiza
 * que un día alguien cambie el nombre y las iniciales se queden viejas.
 */
function datosDePersona(
  entrada: DatosDePersona,
): { ok: true; datos: Prisma.PersonUpdateInput } | { ok: false; campo: string; mensaje: string } {
  const datos: Prisma.PersonUpdateInput = {};

  if (entrada.name !== undefined) {
    const nombre = entrada.name.trim();
    if (nombre.length < 3) {
      return { ok: false, campo: "name", mensaje: "Escribe el nombre completo del contacto." };
    }
    datos.name = nombre;
    datos.initials = iniciales(nombre);
  }

  if (entrada.jobTitle !== undefined) datos.jobTitle = entrada.jobTitle?.trim() || null;
  if (entrada.phone !== undefined) datos.phone = entrada.phone?.trim() || null;

  if (entrada.email !== undefined) {
    const correo = entrada.email?.trim() || null;
    // Q-11 · dato de contacto profesional. Se valida la forma, no se pide
    // consentimiento: son representantes de una empresa, no clientes finales.
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return { ok: false, campo: "email", mensaje: "Ese correo no tiene forma de correo." };
    }
    datos.email = correo;
  }

  if (entrada.committeeRoleId !== undefined) {
    datos.committeeRole = entrada.committeeRoleId
      ? { connect: { id: entrada.committeeRoleId } }
      : { disconnect: true };
  }

  return { ok: true, datos };
}

/**
 * Da de alta un contacto en una organización que la sesión ya alcanza.
 *
 * Recibe la organización cargada por `lib/scope`: si llegó, la sesión la ve.
 */
export async function crearPersona(
  _session: Session,
  organizacion: OrganizacionConGente,
  entrada: DatosDePersona & { name: string },
): Promise<ResultadoAccion<{ id: string }>> {
  const traducido = datosDePersona(entrada);
  if (!traducido.ok) {
    return falla("VALIDACION", { campo: traducido.campo, mensaje: traducido.mensaje });
  }

  const persona = await prisma.person.create({
    data: {
      ...(traducido.datos as Prisma.PersonCreateInput),
      name: entrada.name.trim(),
      initials: iniciales(entrada.name),
      organization: { connect: { id: organizacion.id } },
    },
    select: { id: true },
  });

  return ok(persona);
}

/**
 * Edita un contacto.
 *
 * **La empresa no se cambia aquí.** Mover a alguien de compañía cambiaría en
 * silencio quién puede verlo, y casi siempre no es la misma persona en otra
 * empresa: es una persona nueva que hay que dar de alta allá.
 */
export async function editarPersona(
  _session: Session,
  persona: PersonaEditable,
  entrada: DatosDePersona,
): Promise<ResultadoAccion> {
  const traducido = datosDePersona(entrada);
  if (!traducido.ok) {
    return falla("VALIDACION", { campo: traducido.campo, mensaje: traducido.mensaje });
  }
  if (Object.keys(traducido.datos).length === 0) return ok(null);

  await prisma.person.update({ where: { id: persona.id }, data: traducido.datos });
  return ok(null);
}

// ══════════════════════════════════════════════════════════ Organizaciones

export type DatosDeOrganizacion = {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  type?: OrganizationType;
  industry?: string | null;
  city?: string | null;
  employees?: number | null;
  creditDays?: number | null;
  isStrategic?: boolean;
  ownerId?: string;
  /** País sede, informativo y opcional (§18). Nulo es «sin sede». */
  countryCode?: CountryCode | null;
};

/** Los campos de la ficha que el alta y la edición validan igual. */
type CamposDeOrganizacion = Partial<
  Pick<
    Prisma.OrganizationUncheckedCreateInput,
    | "name"
    | "legalName"
    | "taxId"
    | "type"
    | "industry"
    | "city"
    | "employees"
    | "creditDays"
    | "isStrategic"
    | "countryCode"
  >
>;

/**
 * Traduce los datos de la ficha, o devuelve el problema.
 *
 * Lo comparten el alta y la edición para que digan lo mismo ante el mismo dato:
 * un nombre de una letra o un número negativo se rechazan igual entren por
 * donde entren. Vacío significa «sin dato» y se guarda como `null`, no como una
 * cadena de espacios.
 */
function camposDeOrganizacion(
  entrada: Omit<DatosDeOrganizacion, "ownerId">,
): { ok: true; campos: CamposDeOrganizacion } | { ok: false; campo: string; mensaje: string } {
  const campos: CamposDeOrganizacion = {};

  if (entrada.name !== undefined) {
    const nombre = entrada.name.trim();
    if (nombre.length < 2) {
      return { ok: false, campo: "name", mensaje: "La cuenta necesita un nombre." };
    }
    campos.name = nombre;
  }

  if (entrada.legalName !== undefined) campos.legalName = entrada.legalName?.trim() || null;
  if (entrada.taxId !== undefined) campos.taxId = entrada.taxId?.trim() || null;
  if (entrada.type !== undefined) campos.type = entrada.type;
  if (entrada.industry !== undefined) campos.industry = entrada.industry?.trim() || null;
  if (entrada.city !== undefined) campos.city = entrada.city?.trim() || null;
  if (entrada.isStrategic !== undefined) campos.isStrategic = entrada.isStrategic;
  // La sede: informativa y opcional (§18). Vacía se guarda como nulo.
  if (entrada.countryCode !== undefined) campos.countryCode = entrada.countryCode;

  if (entrada.employees !== undefined) {
    if (entrada.employees !== null && entrada.employees < 0) {
      return {
        ok: false,
        campo: "employees",
        mensaje: "El número de empleados no puede ser negativo.",
      };
    }
    campos.employees = entrada.employees;
  }

  if (entrada.creditDays !== undefined) {
    if (entrada.creditDays !== null && entrada.creditDays < 0) {
      return {
        ok: false,
        campo: "creditDays",
        mensaje: "Los días de crédito no pueden ser negativos.",
      };
    }
    campos.creditDays = entrada.creditDays;
  }

  return { ok: true, campos };
}

export type DatosDeOrganizacionNueva = Omit<
  DatosDeOrganizacion,
  "ownerId" | "name" | "type" | "countryCode"
> & {
  name: string;
  type: OrganizationType;
  /** País sede, informativo. Nulo si no se conoce o no aplica (§18). */
  countryCode?: CountryCode | null;
};

/**
 * Da de alta una cuenta desde P-03.
 *
 * ## La sede es un dato, no una llave · decisiones §18
 *
 * Las cuentas no son de un país. El negocio revisó la regla original —una
 * cuenta pertenece al país donde nace y solo se ve desde ahí— y no le resultó
 * conveniente: una empresa se atiende desde cualquier oficina y se le venden
 * oportunidades en cualquier pipeline. El país queda como **sede**, opcional e
 * informativa: dice dónde está la empresa, no quién puede verla. Por eso ya no
 * se exige que quien crea opere en ese país; el alcance por oficina vive en
 * las oportunidades, que sí tienen país (el del pipeline).
 *
 * ## El propietario es quien la crea
 *
 * «La empresa que un vendedor da de alta es suya: es quien la trabaja.»
 * Reasignarla es de Gerencia (Q-13, Q-14) y se hace desde la ficha, donde ya
 * se valida que el destinatario opere en ese país.
 *
 * ## Los duplicados se rechazan por nombre, sin mirar el alcance ni la sede
 *
 * Si quien captura no ve que «Hidrosistemas del Valle» ya existe porque la
 * ficha es de otro, va a crear «Hidrosistemas del Valle SA» y el histórico de
 * esa cuenta queda partido en dos para siempre. El mensaje revela que la cuenta
 * existe aunque la sesión no la alcance; es la misma decisión que
 * decisiones-pendientes §11.1 tomó para el alta de oportunidad: el duplicado es
 * daño permanente, la fuga del nombre no. Solo el nombre: nunca el propietario
 * ni cifras. Y sin mirar la sede: la misma empresa con sede en dos países
 * seguiría siendo la misma empresa (decisiones-pendientes §14 y §18).
 */
export async function crearOrganizacion(
  session: Session,
  entrada: DatosDeOrganizacionNueva,
): Promise<ResultadoAccion<{ id: string }>> {
  const traducido = camposDeOrganizacion(entrada);
  if (!traducido.ok) {
    return falla("VALIDACION", { campo: traducido.campo, mensaje: traducido.mensaje });
  }
  const nombre = entrada.name.trim();

  // Un solo nombre para toda la operación: las cuentas no son de un país
  // (decisiones §18), así que la homónima se busca sin mirar la sede.
  const homonima = await prisma.organization.findFirst({
    where: { deletedAt: null, name: { equals: nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (homonima) {
    return falla("VALIDACION", {
      campo: "name",
      mensaje: `Ya existe una cuenta llamada «${nombre}». Si es la misma empresa, pide que te asignen una oportunidad ahí; si es otra, distingue el nombre.`,
    });
  }

  const creada = await prisma.organization.create({
    data: {
      ...traducido.campos,
      name: nombre,
      type: entrada.type,
      // La sede es informativa y opcional. No decide quién la ve.
      countryCode: entrada.countryCode ?? null,
      ownerId: session.userId,
    },
    select: { id: true },
  });

  return ok(creada);
}

/**
 * Edita la ficha de una cuenta.
 *
 * ## Lo que NO se edita, y no por olvido
 *
 * **La organización matriz.** La jerarquía matriz-filial es `F-402`, Fase 2. La
 * columna existe para no migrar después, pero nada la mantiene todavía.
 *
 * La sede sí se edita: desde decisiones §18 es un dato informativo que no mueve
 * ninguna oportunidad de país ni cambia quién ve qué.
 */
export async function editarOrganizacion(
  session: Session,
  organizacion: OrganizacionConGente,
  entrada: DatosDeOrganizacion,
): Promise<ResultadoAccion> {
  // Q-15 · la ficha es del dueño de la cuenta. Alcanzarla por tener una
  // oportunidad ahí (§5.3) da lectura, no edición.
  const esSuya = organizacion.owner.id === session.userId;
  if (!esSuya && !can(session, "VER_OPORTUNIDADES_OFICINA")) {
    return falla(
      "AUTORIZACION",
      "La ficha de la cuenta la edita su propietario o Gerencia. Los contactos sí los puedes capturar.",
    );
  }

  const traducido = camposDeOrganizacion(entrada);
  if (!traducido.ok) {
    return falla("VALIDACION", { campo: traducido.campo, mensaje: traducido.mensaje });
  }
  const datos: Prisma.OrganizationUpdateInput = { ...traducido.campos };

  if (entrada.ownerId !== undefined && entrada.ownerId !== organizacion.owner.id) {
    if (!can(session, "VER_OPORTUNIDADES_OFICINA")) {
      return falla("AUTORIZACION", "Cambiar de propietario la cuenta es de Gerencia.");
    }
    // Cualquier usuario activo: las cuentas no son de un país (decisiones
    // §18), así que la restricción de Q-14 por país queda solo para las
    // oportunidades, que sí lo tienen.
    const valido = await prisma.user.findFirst({
      where: { id: entrada.ownerId, active: true, deletedAt: null },
      select: { id: true },
    });
    if (!valido) {
      return falla("VALIDACION", {
        campo: "ownerId",
        mensaje: `Ese usuario no está activo o no opera en ${organizacion.countryCode}.`,
      });
    }
    datos.owner = { connect: { id: entrada.ownerId } };
  }

  if (Object.keys(datos).length === 0) return ok(null);

  await prisma.organization.update({ where: { id: organizacion.id }, data: datos });
  return ok(null);
}
