-- §58 · Prospectos (leads): tablas, catálogos, permisos y SLA de primer
-- contacto. Esquema generado con prisma migrate diff contra DEV y revisado;
-- despues los datos: RLS deny-all como en el resto, permisos con su matriz
-- (seis roles), catálogos iniciales.

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NUEVO', 'EN_VALIDACION', 'CONTACTADO', 'CALIFICADO', 'ASIGNADO', 'ACEPTADO', 'RECHAZADO', 'CONVERTIDO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "lead_id" TEXT;

-- AlterTable
ALTER TABLE "commercial_policies" ADD COLUMN     "lead_first_contact_sla_hours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "job_title" TEXT,
    "company_name" TEXT NOT NULL,
    "company_industry" TEXT,
    "country_code" "CountryCode" NOT NULL,
    "channel_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NUEVO',
    "score" INTEGER,
    "notes" TEXT,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "stage_entered_at" TIMESTAMP(3) NOT NULL,
    "first_contact_due_at" TIMESTAMP(3) NOT NULL,
    "contacted_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "next_activity_at" TIMESTAMP(3),
    "discard_reason_id" TEXT,
    "organization_id" TEXT,
    "person_id" TEXT,
    "opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_transitions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage" "LeadStage",
    "to_stage" "LeadStage" NOT NULL,
    "at_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by_user_id" TEXT NOT NULL,

    CONSTRAINT "lead_stage_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_folio_counters" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lead_folio_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "lead_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lead_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lead_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_discard_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lead_discard_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_folio_key" ON "leads"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "leads_opportunity_id_key" ON "leads"("opportunity_id");

-- CreateIndex
CREATE INDEX "leads_country_code_stage_idx" ON "leads"("country_code", "stage");

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_stage_idx" ON "leads"("assigned_to_id", "stage");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_campaign_id_idx" ON "leads"("campaign_id");

-- CreateIndex
CREATE INDEX "lead_stage_transitions_lead_id_at_date_idx" ON "lead_stage_transitions"("lead_id", "at_date");

-- CreateIndex
CREATE UNIQUE INDEX "lead_channels_name_key" ON "lead_channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_campaigns_name_key" ON "lead_campaigns"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_discard_reasons_name_key" ON "lead_discard_reasons"("name");

-- CreateIndex
CREATE INDEX "activities_lead_id_idx" ON "activities"("lead_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "lead_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "lead_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_discard_reason_id_fkey" FOREIGN KEY ("discard_reason_id") REFERENCES "lead_discard_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_transitions" ADD CONSTRAINT "lead_stage_transitions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_transitions" ADD CONSTRAINT "lead_stage_transitions_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaigns" ADD CONSTRAINT "lead_campaigns_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "lead_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS deny-all en las tablas nuevas, como en todas (init_crm_avtr).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','lead_stage_transitions','lead_folio_counters','lead_channels','lead_campaigns','lead_discard_reasons'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Permisos de prospectos.
INSERT INTO "permissions" ("id", "code", "name", "description") VALUES
  ('perm_ver_prospectos', 'VER_PROSPECTOS', 'Ver prospectos', 'La pantalla de prospectos. El vendedor ve los que tiene asignados; Marketing y Gerencia, los de sus países.'),
  ('perm_gestionar_prospectos', 'GESTIONAR_PROSPECTOS', 'Gestionar prospectos', 'Crear, importar, validar, calificar, asignar y descartar prospectos. Deja traza (INV-09).'),
  ('perm_convertir_prospecto', 'CONVERTIR_PROSPECTO', 'Convertir prospecto', 'Abrir una oportunidad a partir de un prospecto aceptado, reutilizando cuenta y persona si ya existen.')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT r.role, p.id, r.granted FROM (VALUES
  ('VENDEDOR'::"Role", true), ('GERENTE_PAIS'::"Role", true), ('DIRECCION'::"Role", true),
  ('ADMINISTRADOR'::"Role", true), ('PREVENTA'::"Role", false), ('MARKETING'::"Role", true)
) AS r(role, granted) CROSS JOIN "permissions" p WHERE p.code = 'VER_PROSPECTOS'
ON CONFLICT ("role", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT r.role, p.id, r.granted FROM (VALUES
  ('VENDEDOR'::"Role", false), ('GERENTE_PAIS'::"Role", true), ('DIRECCION'::"Role", true),
  ('ADMINISTRADOR'::"Role", true), ('PREVENTA'::"Role", false), ('MARKETING'::"Role", true)
) AS r(role, granted) CROSS JOIN "permissions" p WHERE p.code = 'GESTIONAR_PROSPECTOS'
ON CONFLICT ("role", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT r.role, p.id, r.granted FROM (VALUES
  ('VENDEDOR'::"Role", true), ('GERENTE_PAIS'::"Role", true), ('DIRECCION'::"Role", true),
  ('ADMINISTRADOR'::"Role", true), ('PREVENTA'::"Role", false), ('MARKETING'::"Role", false)
) AS r(role, granted) CROSS JOIN "permissions" p WHERE p.code = 'CONVERTIR_PROSPECTO'
ON CONFLICT ("role", "permission_id") DO NOTHING;

-- Marketing en la columna de los permisos que ya existian: todos denegados.
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'MARKETING'::"Role", p.id, false FROM "permissions" p
ON CONFLICT ("role", "permission_id") DO NOTHING;

-- Catálogos iniciales.
INSERT INTO "lead_channels" ("id", "name") VALUES
  ('lch_web', 'Web'), ('lch_linkedin', 'LinkedIn'), ('lch_redes', 'Redes sociales'),
  ('lch_evento', 'Evento'), ('lch_referido', 'Referido')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "lead_campaigns" ("id", "name", "channel_id") VALUES
  ('lcp_demo_crm_q4', 'Demo CRM Q4', 'lch_web'), ('lcp_expo_tic_2026', 'Expo TIC 2026', 'lch_evento')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "lead_discard_reasons" ("id", "name") VALUES
  ('ldr_sin_presupuesto', 'Sin presupuesto'), ('ldr_sin_interes', 'Sin interés'), ('ldr_no_perfil', 'No es el perfil'),
  ('ldr_datos_invalidos', 'Datos inválidos'), ('ldr_duplicado', 'Duplicado'), ('ldr_competencia', 'Competencia'), ('ldr_otro', 'Otro')
ON CONFLICT ("name") DO NOTHING;
