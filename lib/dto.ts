import type {
  ApprovalStatus,
  BusinessType,
  CountryCode,
  Currency,
  ForecastCategory,
  MeddicComponent,
  MeddicStatus,
  MilestoneStatus,
  OpportunityStatus,
  OrganizationType,
  PriceModel,
  QuoteStatus,
  Role,
  StageGateMode,
} from "@prisma/client";

/**
 * Los tipos que la capa de presentación sí puede usar.
 *
 * `app/**` y `components/**` no pueden importar `@prisma/client` (INV-01, y lo
 * impide `eslint.config.mjs`). Pero los enums de negocio no son un riesgo: no
 * arrastran el cliente ni permiten consultar nada. Son cadenas.
 *
 * Este módulo es la puerta explícita para eso. Lo que NO debe aparecer aquí son
 * los tipos de fila completos —`Opportunity`, `Quote`— porque incluyen las
 * columnas de costo y volverían tentador tipar un componente con ellas, cuando
 * lo que la UI recibe son objetos ya recortados por `lib/scope` (INV-02).
 *
 * El dinero viaja como `string` hasta la pantalla (INV-03); el tipo `Money` de
 * `lib/money` es para el servidor.
 */
export type {
  ApprovalStatus,
  BusinessType,
  CountryCode,
  Currency,
  ForecastCategory,
  MeddicComponent,
  MeddicStatus,
  MilestoneStatus,
  OpportunityStatus,
  OrganizationType,
  PriceModel,
  QuoteStatus,
  Role,
  StageGateMode,
};

/** Las banderas de riesgo, que se calculan y no se guardan (INV-11). */
export type RiskFlag = "SIN_ACTIVIDAD" | "ESTANCADA" | "MARGEN_BAJO";
