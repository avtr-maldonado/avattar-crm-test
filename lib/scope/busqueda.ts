import type { CountryCode, OpportunityStatus } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { withScope } from "./opportunities";
import { withOrganizationScope } from "./organizations";
import { withPersonScope } from "./people";

/**
 * El buscador global de la barra superior.
 *
 * Busca oportunidades, cuentas y personas **dentro del alcance del rol**
 * (INV-01): lo que un vendedor no puede ver en el pipeline tampoco lo encuentra
 * buscándolo. Cada grupo pasa por su propio `withScope`, que antepone el
 * alcance al término (AC-25).
 *
 * No recorta por oficina activa, a propósito: buscar es para encontrar, y
 * Dirección que busca una cuenta de Colombia con México activo debe hallarla.
 * Cada resultado trae su país para que se note cuando es de otra oficina.
 *
 * Tres consultas en paralelo, cinco resultados por grupo: es un menú de
 * sugerencias, no un reporte. Con `pg_trgm` instalado se podría afinar la
 * relevancia; hoy `contains` sin distinguir mayúsculas alcanza.
 */
export type ResultadosDeBusqueda = {
  oportunidades: {
    id: string;
    folio: string;
    nombre: string;
    organizacion: string;
    countryCode: CountryCode;
    status: OpportunityStatus;
  }[];
  /** `countryCode` es la sede, informativa y opcional (decisiones §18). */
  cuentas: { id: string; nombre: string; ciudad: string | null; countryCode: CountryCode | null }[];
  personas: {
    id: string;
    nombre: string;
    cargo: string | null;
    organizacion: { id: string; nombre: string };
  }[];
};

const MINIMO_DE_CARACTERES = 2;
const POR_GRUPO = 5;

const VACIO: ResultadosDeBusqueda = { oportunidades: [], cuentas: [], personas: [] };

export async function buscarGlobal(session: Session, texto: string): Promise<ResultadosDeBusqueda> {
  const termino = texto.trim();
  if (termino.length < MINIMO_DE_CARACTERES) return VACIO;

  const contiene = { contains: termino, mode: "insensitive" as const };

  const [oportunidades, cuentas, personas] = await Promise.all([
    prisma.opportunity.findMany({
      where: withScope(session, {
        OR: [{ name: contiene }, { folio: contiene }, { organization: { name: contiene } }],
      }),
      select: {
        id: true,
        folio: true,
        name: true,
        status: true,
        countryCode: true,
        organization: { select: { name: true } },
      },
      // Las abiertas primero: son las que se están trabajando.
      orderBy: [{ status: "asc" }, { expectedCloseDate: "asc" }],
      take: POR_GRUPO,
    }),
    prisma.organization.findMany({
      where: withOrganizationScope(session, { name: contiene }),
      select: { id: true, name: true, city: true, countryCode: true },
      orderBy: { name: "asc" },
      take: POR_GRUPO,
    }),
    prisma.person.findMany({
      where: withPersonScope(session, { name: contiene }),
      select: {
        id: true,
        name: true,
        jobTitle: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      take: POR_GRUPO,
    }),
  ]);

  return {
    oportunidades: oportunidades.map((o) => ({
      id: o.id,
      folio: o.folio,
      nombre: o.name,
      organizacion: o.organization.name,
      countryCode: o.countryCode,
      status: o.status,
    })),
    cuentas: cuentas.map((c) => ({
      id: c.id,
      nombre: c.name,
      ciudad: c.city,
      countryCode: c.countryCode,
    })),
    personas: personas.map((p) => ({
      id: p.id,
      nombre: p.name,
      cargo: p.jobTitle,
      organizacion: { id: p.organization.id, nombre: p.organization.name },
    })),
  };
}
