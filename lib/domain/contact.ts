import type { CountryCode, OrganizationType, Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
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

export type DatosDeOrganizacionNueva = Omit<DatosDeOrganizacion, "ownerId" | "name" | "type"> & {
  name: string;
  type: OrganizationType;
  countryCode: CountryCode;
};

/**
 * Da de alta una cuenta desde P-03.
 *
 * ## El país sale de la sesión, nunca de un campo libre
 *
 * Una cuenta nace en un país donde quien la crea opera. Si opera en uno, no se
 * pregunta; si opera en varios, elige entre los suyos. Que alguien pudiera
 * elegir otro sería darle una llave a ese país por la puerta de atrás (AC-05).
 * Es la misma regla del alta en línea de oportunidad, que ahí resuelve la
 * ambigüedad con el país del pipeline; aquí no hay pipeline y se pregunta.
 *
 * ## El propietario es quien la crea
 *
 * «La empresa que un vendedor da de alta es suya: es quien la trabaja.»
 * Reasignarla es de Gerencia (Q-13, Q-14) y se hace desde la ficha, donde ya
 * se valida que el destinatario opere en ese país.
 *
 * ## Los duplicados se rechazan por nombre, sin mirar el alcance
 *
 * Si quien captura no ve que «Hidrosistemas del Valle» ya existe porque la
 * ficha es de otro, va a crear «Hidrosistemas del Valle SA» y el histórico de
 * esa cuenta queda partido en dos para siempre. El mensaje revela que la cuenta
 * existe aunque la sesión no la alcance; es la misma decisión que
 * decisiones-pendientes §11.1 tomó para el alta de oportunidad: el duplicado es
 * daño permanente, la fuga del nombre no. Solo el nombre: nunca el propietario
 * ni cifras. Regla derivada al construir, anotada en decisiones-pendientes §14.
 */
export async function crearOrganizacion(
  session: Session,
  entrada: DatosDeOrganizacionNueva,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!session.countryCodes.includes(entrada.countryCode)) {
    return falla("AUTORIZACION", `No operas en ${NOMBRE_PAIS[entrada.countryCode]}.`);
  }

  const traducido = camposDeOrganizacion(entrada);
  if (!traducido.ok) {
    return falla("VALIDACION", { campo: traducido.campo, mensaje: traducido.mensaje });
  }
  const nombre = entrada.name.trim();

  const homonima = await prisma.organization.findFirst({
    where: {
      deletedAt: null,
      countryCode: entrada.countryCode,
      name: { equals: nombre, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (homonima) {
    return falla("VALIDACION", {
      campo: "name",
      mensaje: `Ya existe una cuenta llamada «${nombre}» en ${NOMBRE_PAIS[entrada.countryCode]}. Si es la misma empresa, pide que te asignen una oportunidad ahí; si es otra, distingue el nombre.`,
    });
  }

  const creada = await prisma.organization.create({
    data: {
      ...traducido.campos,
      name: nombre,
      type: entrada.type,
      countryCode: entrada.countryCode,
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
 * **El país.** Cambiarlo movería de país todas sus oportunidades y con ellas
 * quién las ve: el alcance por rol se aplicaría bien en cada consulta y el dato
 * habría cruzado la frontera igual (`AC-05`). Eso no es editar, es migrar.
 *
 * **La organización matriz.** La jerarquía matriz-filial es `F-402`, Fase 2. La
 * columna existe para no migrar después, pero nada la mantiene todavía.
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
    // Q-14 · mismo país, por la misma razón que en las oportunidades: quien no
    // opera en ese país no debería quedar con la cuenta en su cartera.
    const valido = await prisma.user.findFirst({
      where: {
        id: entrada.ownerId,
        active: true,
        deletedAt: null,
        countryCodes: { has: organizacion.countryCode },
      },
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
