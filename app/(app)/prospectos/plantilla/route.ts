import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { aCsv, BOM } from "@/lib/domain/csv";
import { CABECERAS_DE_IMPORTACION, ETIQUETA_DE_CABECERA } from "@/lib/domain/leadImport";

/** `GET /prospectos/plantilla` · la cabecera que la importación espera, con una fila de ejemplo. */
export async function GET(): Promise<Response> {
  const session = await requireSession();
  if (!can(session, "GESTIONAR_PROSPECTOS")) return new NextResponse("Sin permiso.", { status: 403 });

  const filas = [
    CABECERAS_DE_IMPORTACION.map((c) => ETIQUETA_DE_CABECERA[c]),
    ["Laura García", "laura.garcia@novatek.com", "+52 55 9876 5432", "Gerente de TI", "Novatek S.A.", "Tecnología", "MX", "Web", "Demo CRM Q4", "82", "Pidió una demo del CRM"],
  ];
  return new NextResponse(BOM + aCsv(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-prospectos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
