import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { PERMISOS } from "@/lib/auth/permissions";
import { PERMISOS_POR_ROL } from "@/prisma/seed/permisos";
import { veOportunidades } from "./opportunityAccess";
import { PERMISOS_CON_TOPE } from "./permisos";

/** §66 · la matriz solo lleva permisos que alguna funcionalidad consulta. */
const sesion = (role: Session["role"]) => ({ role }) as Session;

describe("catálogo de permisos · §66", () => {
  it("quedan catorce, sin los tres que nada consultaba", () => {
    expect(PERMISOS).toHaveLength(14);
    for (const quitado of ["AUTORIZAR_DESCUENTO", "EXPORTAR_CON_COSTO", "VER_OPORTUNIDADES_PROPIAS"]) {
      expect(PERMISOS as readonly string[]).not.toContain(quitado);
      expect(Object.keys(PERMISOS_POR_ROL)).not.toContain(quitado);
    }
    expect(Object.keys(PERMISOS_POR_ROL).sort()).toEqual([...PERMISOS].sort());
  });

  it("ningún permiso lleva tope mientras no haya autorizaciones de descuento", () => {
    expect(PERMISOS_CON_TOPE.size).toBe(0);
  });

  it("los tres renombrados dicen lo que hacen", () => {
    expect(PERMISOS_POR_ROL.EDITAR_POLITICA_COMERCIAL.nombre).toBe("Ver política comercial");
    expect(PERMISOS_POR_ROL.EDITAR_CATALOGOS.nombre).toBe("Editar productos y cuotas");
    expect(PERMISOS_POR_ROL.VER_OPORTUNIDADES_OFICINA.nombre).toBe("Gestionar oportunidades de la oficina");
  });
});

describe("veOportunidades · §66", () => {
  it("lo decide el rol, como el alcance: todos menos Marketing", () => {
    for (const r of ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"] as const) {
      expect(veOportunidades(sesion(r)), r).toBe(true);
    }
    expect(veOportunidades(sesion("MARKETING"))).toBe(false);
  });
});
