import { describe, expect, it } from "vitest";
import { construirBitacora, filtrarBitacora, type FuentesDeBitacora } from "./bitacora";

const MIGUEL = { name: "Miguel Maldonado" };
const JORGE = { name: "Jorge Medina" };

const BASE: FuentesDeBitacora = {
  oportunidad: { createdAt: new Date("2026-08-31T21:07:00Z"), createdBy: JORGE },
  transiciones: [
    {
      id: "t0",
      atDate: new Date("2026-08-31T21:07:00Z"),
      gateOverride: false,
      fromStage: null,
      toStage: { name: "Calificación" },
      byUser: JORGE,
    },
    {
      id: "t1",
      atDate: new Date("2026-09-09T20:38:00Z"),
      gateOverride: true,
      fromStage: { name: "Propuesta" },
      toStage: { name: "Negociación" },
      byUser: MIGUEL,
    },
  ],
  auditoria: [
    {
      id: "a1",
      at: new Date("2026-09-05T15:00:00Z"),
      action: "CAMBIAR_CIERRE_ESTIMADO",
      before: { expectedCloseDate: "2026-12-20T12:00:00.000Z" },
      after: { expectedCloseDate: "2027-01-15T12:00:00.000Z" },
      byUser: MIGUEL,
    },
    {
      id: "a2",
      at: new Date("2026-09-07T16:00:00Z"),
      action: "EDITAR_COTIZACION",
      before: { netSubtotal: "80000.0000" },
      after: {
        netSubtotal: "95000.0000",
        linea: { descripcion: "Servicios administrados", campo: "quantity", de: "2", a: "3" },
      },
      byUser: MIGUEL,
    },
    {
      id: "a3",
      at: new Date("2026-09-08T16:00:00Z"),
      action: "EDITAR_COTIZACION",
      before: { netSubtotal: "95000.0000" },
      after: {
        netSubtotal: "95000.0000",
        linea: { descripcion: "Servicios administrados", campo: "unitCost", de: "400", a: "350" },
      },
      byUser: MIGUEL,
    },
  ],
  actividades: [
    {
      id: "c1",
      subject: "Llamada con Miguel",
      completedAt: new Date("2026-08-31T21:00:00Z"),
      type: { name: "Llamada" },
      user: MIGUEL,
    },
    {
      id: "c2",
      subject: "Demostración técnica",
      completedAt: null,
      type: { name: "Reunión presencial" },
      user: MIGUEL,
    },
  ],
  verCosto: true,
};

describe("construirBitacora · una sola historia, de lo más reciente a lo más viejo", () => {
  it("mezcla las fuentes y ordena por fecha descendente", () => {
    const eventos = construirBitacora(BASE);
    expect(eventos.map((e) => e.tipo)).toEqual([
      "ETAPA",
      "COTIZACION",
      "COTIZACION",
      "CIERRE",
      "CREACION",
      "ACTIVIDAD",
    ]);
  });

  it("la transición inicial se funde con la creación: nadie «se movió» a la primera etapa", () => {
    const creacion = construirBitacora(BASE).find((e) => e.tipo === "CREACION");
    expect(creacion?.titulo).toBe("Creada en Calificación");
    expect(creacion?.quien).toBe("Jorge Medina");
    expect(construirBitacora(BASE).filter((e) => e.tipo === "ETAPA")).toHaveLength(1);
  });

  it("un movimiento de etapa dice de dónde a dónde, y si avanzó con advertencia", () => {
    const etapa = construirBitacora(BASE).find((e) => e.tipo === "ETAPA");
    expect(etapa?.titulo).toBe("Etapa: Propuesta → Negociación");
    expect(etapa?.conAdvertencia).toBe(true);
  });

  it("el cambio de cierre estimado se lee con las dos fechas", () => {
    const cierre = construirBitacora(BASE).find((e) => e.tipo === "CIERRE");
    expect(cierre?.titulo).toBe("Cierre estimado: 20 dic 2026 → 15 ene 2027");
  });

  it("un cambio de cotización dice el neto antes y después, y qué línea cambió", () => {
    const [, cantidad] = construirBitacora(BASE).filter((e) => e.tipo === "COTIZACION");
    expect(cantidad?.titulo).toBe("Cotización: $80,000.00 → $95,000.00");
    expect(cantidad?.detalle).toBe("Servicios administrados · cantidad 2 → 3");
  });

  it("sin VER_COSTO, un cambio de costo no enseña las cifras del costo · INV-02", () => {
    // El neto sí se ve —no es costo—, pero «de 400 a 350» sería filtrar el
    // costo unitario por la puerta de atrás.
    const [costo] = construirBitacora({ ...BASE, verCosto: false }).filter(
      (e) => e.tipo === "COTIZACION",
    );
    expect(costo?.titulo).toBe("Cotización: $95,000.00 → $95,000.00");
    expect(costo?.detalle).toBe("Servicios administrados · costo unitario");
  });

  it("con VER_COSTO, el cambio de costo sí se detalla", () => {
    const [costo] = construirBitacora(BASE).filter((e) => e.tipo === "COTIZACION");
    expect(costo?.detalle).toBe("Servicios administrados · costo unitario 400 → 350");
  });

  it("un guardado con varios cambios los lista todos en una sola entrada", () => {
    // Editar es abrir, cambiar lo que haga falta y guardar una vez. La
    // bitácora cuenta ese guardado, no cada tecla.
    const fuentes: FuentesDeBitacora = {
      ...BASE,
      auditoria: [
        {
          id: "a9",
          at: new Date("2026-09-10T16:00:00Z"),
          action: "EDITAR_COTIZACION",
          before: { netSubtotal: "80000.0000" },
          after: {
            netSubtotal: "91000.0000",
            lineas: [
              { descripcion: "Servicios administrados", campo: "quantity", de: "2", a: "3" },
              { descripcion: "Bolsa de horas", campo: "discountRate", de: "0", a: "10" },
            ],
          },
          byUser: MIGUEL,
        },
      ],
    };
    const [e] = construirBitacora(fuentes).filter((x) => x.tipo === "COTIZACION");
    expect(e?.titulo).toBe("Cotización: $80,000.00 → $91,000.00");
    expect(e?.detalle).toBe(
      "Servicios administrados · cantidad 2 → 3; Bolsa de horas · descuento 0 % → 10 %",
    );
  });

  it("solo las actividades hechas entran; las pendientes son agenda, no historia", () => {
    const actividades = construirBitacora(BASE).filter((e) => e.tipo === "ACTIVIDAD");
    expect(actividades).toHaveLength(1);
    expect(actividades[0]?.titulo).toBe("Llamada: Llamada con Miguel");
  });
});

describe("filtrarBitacora", () => {
  it("«todo» deja todo", () => {
    const eventos = construirBitacora(BASE);
    expect(filtrarBitacora(eventos, "todo")).toHaveLength(eventos.length);
  });

  it("«etapas» incluye la creación: es donde empieza la historia de etapas", () => {
    const tipos = filtrarBitacora(construirBitacora(BASE), "etapas").map((e) => e.tipo);
    expect(tipos).toEqual(["ETAPA", "CREACION"]);
  });

  it("«cambios» son los datos de la oportunidad: cierre y propietario", () => {
    const tipos = filtrarBitacora(construirBitacora(BASE), "cambios").map((e) => e.tipo);
    expect(tipos).toEqual(["CIERRE"]);
  });

  it("un filtro desconocido se trata como «todo», no como vacío", () => {
    const eventos = construirBitacora(BASE);
    expect(filtrarBitacora(eventos, "lo-que-sea")).toHaveLength(eventos.length);
  });
});

describe("ganada y perdida en la bitácora · decisiones §25", () => {
  const fuentes: FuentesDeBitacora = {
    ...BASE,
    auditoria: [
      {
        id: "g1",
        at: new Date("2026-09-24T15:00:00Z"),
        action: "MARCAR_GANADA",
        before: { status: "ABIERTA", stage: "Negociación" },
        after: { status: "GANADA", actualCloseDate: "2026-09-24T00:00:00.000Z", amount: "1000000.0000", stage: "Negociación" },
        byUser: MIGUEL,
      },
      {
        id: "p1",
        at: new Date("2026-09-25T15:00:00Z"),
        action: "MARCAR_PERDIDA",
        before: { status: "ABIERTA", stage: "Propuesta" },
        after: { status: "PERDIDA", actualCloseDate: "2026-09-25T00:00:00.000Z", lossReason: "Precio", lossCompetitor: "Rival S.A.", stage: "Propuesta" },
        byUser: MIGUEL,
      },
    ],
  };

  it("ganada: tipo propio, con el importe y desde qué etapa", () => {
    const e = construirBitacora(fuentes).find((x) => x.tipo === "GANADA")!;
    expect(e).toBeDefined();
    expect(e.titulo).toContain("Ganada");
    expect(e.titulo).toContain("$1,000,000.00");
    expect(e.detalle).toContain("Negociación");
  });

  it("perdida: con el motivo y el competidor", () => {
    const e = construirBitacora(fuentes).find((x) => x.tipo === "PERDIDA")!;
    expect(e).toBeDefined();
    expect(e.titulo).toContain("Perdida");
    expect(e.titulo).toContain("Precio");
    expect(e.detalle).toContain("Rival S.A.");
  });

  it("las dos entran en el filtro «Cambios»", () => {
    const tipos = filtrarBitacora(construirBitacora(fuentes), "cambios").map((e) => e.tipo);
    expect(tipos).toContain("GANADA");
    expect(tipos).toContain("PERDIDA");
  });
});
