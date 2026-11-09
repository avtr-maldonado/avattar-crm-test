import { NextResponse } from "next/server";
import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { aCsv, BOM } from "@/lib/domain/csv";
import { estadoDeSla, ETIQUETA_DE_SLA } from "@/lib/domain/leadSla";
import { ETIQUETA_DE_ETAPA } from "@/lib/domain/leadStages";
import { parseFiltrosDeProspectos, whereDeProspectos } from "@/lib/filters/leads";
import { getCountry } from "@/lib/policy";
import { listLeads } from "@/lib/scope/leads";
import { formateadoresDe } from "@/components/prospectos/formato";

/**
 * `GET /prospectos/exportar?…` · decisiones §58. Los mismos filtros de la
 * pantalla, el mismo alcance (`leadScope`) y la misma oficina: lo que se ve es
 * lo que se baja. CSV con BOM para que Excel lea los acentos. Nada de costo ni
 * utilidad aquí, así que INV-02 no tiene nada que proteger.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await requireSession();
  if (!can(session, "VER_PROSPECTOS")) return new NextResponse("Sin permiso.", { status: 403 });

  const url = new URL(request.url);
  const filtros = parseFiltrosDeProspectos(url.searchParams);
  const pais = await oficinaActiva(session);
  const { timezone } = await getCountry(pais);
  const f = formateadoresDe(timezone);
  const ahora = new Date();

  const leads = await listLeads(session, { pais, where: whereDeProspectos(filtros, session) });
  const filas = [
    ["Folio", "Contacto", "Correo", "Teléfono", "Empresa", "País", "Canal", "Campaña", "Etapa", "Puntaje", "Vendedor", "Ingreso", "Próxima actividad", "SLA"],
    ...leads.map((l) => [
      l.folio,
      l.contactName,
      l.email ?? "",
      l.phone ?? "",
      l.companyName,
      l.countryCode,
      l.channel.name,
      l.campaign?.name ?? "",
      ETIQUETA_DE_ETAPA[l.stage],
      l.score === null ? "" : String(l.score),
      l.assignedTo?.name ?? "",
      f.fechaCorta.format(l.createdAt),
      l.nextActivityAt ? f.fechaHora.format(l.nextActivityAt) : "",
      ETIQUETA_DE_SLA[estadoDeSla(l, ahora)],
    ]),
  ];

  return new NextResponse(BOM + aCsv(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prospectos-${pais.toLowerCase()}-${ahora.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
