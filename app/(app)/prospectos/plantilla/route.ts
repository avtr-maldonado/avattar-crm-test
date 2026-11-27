import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { aCsv, BOM } from "@/lib/domain/csv";
import { CABECERAS_DE_IMPORTACION, ETIQUETA_DE_CABECERA } from "@/lib/domain/leadImport";
import { plantillaXlsx } from "@/lib/domain/xlsx";
import { catalogosDeProspectos } from "@/lib/scope/leads";

/**
 * `GET /prospectos/plantilla` · la cabecera que la importación espera, con una
 * fila de ejemplo. Excel por omisión (§69), con listas desplegables de país,
 * canal y campaña activos; `?formato=csv` sigue dando la de antes.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await requireSession();
  if (!can(session, "GESTIONAR_PROSPECTOS")) return new NextResponse("Sin permiso.", { status: 403 });
  const { canales, campanas } = await catalogosDeProspectos();

  if (request.nextUrl.searchParams.get("formato") === "csv") {
    const filas = [
      CABECERAS_DE_IMPORTACION.map((c) => ETIQUETA_DE_CABECERA[c]),
      ["Laura García", "laura.garcia@novatek.com", "+52 55 9876 5432", "Gerente de TI", "Novatek S.A.", "Tecnología", "MX", canales[0]?.name ?? "", campanas[0]?.name ?? "", "Pidió una demo del CRM"],
    ];
    return new NextResponse(BOM + aCsv(filas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="plantilla-prospectos.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(await plantillaXlsx({ canales, campanas }), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-prospectos.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
