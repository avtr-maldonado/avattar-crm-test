-- ===========================================================================
-- CRM Avattar - migracion inicial
-- Generada desde prisma/schema.prisma con `pnpm db:diff`.
-- 32 tablas, 16 tipos enumerados.
--
-- No editar a mano: cambiar el schema de Prisma y regenerar.
-- ===========================================================================

-- Extensiones -------------------------------------------------------------
-- En el schema `extensions`, no en `public`: el advisor extension_in_public
-- marca lo segundo, y ahi es donde Supabase ya tiene pgcrypto y uuid-ossp.
-- Ese schema viene en el search_path por omision.
--
-- pg_trgm: indice trigram para la busqueda libre del subsistema de filtros
-- (spec 9.2, parametro `q`).
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA extensions;

-- citext NO se instala: este modelo no tiene ninguna columna citext. Los
-- correos son String. El esquema anterior la usaba; aqui seria peso muerto.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VENDEDOR', 'GERENTE_PAIS', 'DIRECCION', 'ADMINISTRADOR', 'PREVENTA');

-- CreateEnum
CREATE TYPE "CountryCode" AS ENUM ('MX', 'CO', 'CL');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CLIENTE', 'PROSPECTO', 'PARTNER', 'FABRICANTE', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('ABIERTA', 'GANADA', 'PERDIDA');

-- CreateEnum
CREATE TYPE "ForecastCategory" AS ENUM ('PIPELINE', 'MEJOR_CASO', 'COMPROMISO', 'OMITIDA');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('NUEVO', 'EXPANSION', 'RENOVACION');

-- CreateEnum
CREATE TYPE "PriceModel" AS ENUM ('PRECIO_FIJO', 'TIEMPO_Y_MATERIALES', 'RECURRENTE', 'RECURRENTE_ANUAL', 'POR_CONSUMO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BORRADOR', 'CONGELADA', 'REEMPLAZADA');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDIENTE', 'CUMPLIDO');

-- CreateEnum
CREATE TYPE "MeddicComponent" AS ENUM ('METRICAS', 'DECISOR_ECONOMICO', 'CRITERIOS_DECISION', 'PROCESO_DECISION', 'DOLOR_IDENTIFICADO', 'CAMPEON');

-- CreateEnum
CREATE TYPE "MeddicStatus" AS ENUM ('NO_EVALUADO', 'AUSENTE', 'PARCIAL', 'CONFIRMADO');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('GERENCIA', 'DIRECCION');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "ObjectivePeriod" AS ENUM ('ANUAL', 'TRIMESTRAL');

-- CreateEnum
CREATE TYPE "StageGateMode" AS ENUM ('ADVERTENCIA', 'BLOQUEANTE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "entra_object_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" VARCHAR(3) NOT NULL,
    "role" "Role" NOT NULL,
    "country_codes" "CountryCode"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" "CountryCode" NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "tax_rate" DECIMAL(7,4) NOT NULL,
    "tax_label" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "commercial_policies" (
    "id" TEXT NOT NULL,
    "country_code" "CountryCode" NOT NULL,
    "margin_floor" DECIMAL(7,4) NOT NULL,
    "line_margin_floor" DECIMAL(7,4) NOT NULL,
    "discount_threshold_mgmt" DECIMAL(7,4) NOT NULL,
    "discount_threshold_dir" DECIMAL(7,4) NOT NULL,
    "approval_sla_hours" INTEGER NOT NULL DEFAULT 24,
    "meddic_min_to_closing" INTEGER NOT NULL DEFAULT 70,
    "meddic_min_to_win" INTEGER NOT NULL DEFAULT 80,
    "meddic_min_to_commit" INTEGER NOT NULL DEFAULT 70,
    "healthy_coverage_min" DECIMAL(4,2) NOT NULL DEFAULT 3.00,

    CONSTRAINT "commercial_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" "CountryCode" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "is_renewal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" DECIMAL(5,4) NOT NULL,
    "stale_after_days" INTEGER NOT NULL,
    "gate_mode" "StageGateMode" NOT NULL DEFAULT 'ADVERTENCIA',
    "gate_requires" TEXT[],
    "is_closing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "type" "OrganizationType" NOT NULL,
    "industry" TEXT,
    "city" TEXT,
    "country_code" "CountryCode" NOT NULL,
    "employees" INTEGER,
    "credit_days" INTEGER,
    "parent_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "is_strategic" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" VARCHAR(3) NOT NULL,
    "job_title" TEXT,
    "committee_role_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "primary_person_id" TEXT,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "country_code" "CountryCode" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "estimated_amount" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "gross_margin" DECIMAL(7,4),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'ABIERTA',
    "forecast_category" "ForecastCategory" NOT NULL DEFAULT 'PIPELINE',
    "business_type" "BusinessType" NOT NULL,
    "source_id" TEXT,
    "partner_name" TEXT,
    "expected_close_date" DATE NOT NULL,
    "actual_close_date" DATE,
    "loss_reason_id" TEXT,
    "loss_competitor" TEXT,
    "meddic_score" INTEGER,
    "owner_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "stage_entered_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "next_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_counters" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "folio_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "stage_transitions" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "from_stage_id" TEXT,
    "to_stage_id" TEXT NOT NULL,
    "at_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by_user_id" TEXT NOT NULL,
    "gate_override" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stage_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_support" (
    "opportunity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_support_pkey" PRIMARY KEY ("opportunity_id","user_id")
);

-- CreateTable
CREATE TABLE "meddic_assessments" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "component" "MeddicComponent" NOT NULL,
    "status" "MeddicStatus" NOT NULL DEFAULT 'NO_EVALUADO',
    "evidence" TEXT,
    "person_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT NOT NULL,

    CONSTRAINT "meddic_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meddic_weights" (
    "pipeline_id" TEXT NOT NULL,
    "component" "MeddicComponent" NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "meddic_weights_pkey" PRIMARY KEY ("pipeline_id","component")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "family_id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price_model" "PriceModel" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cost_source" TEXT NOT NULL DEFAULT 'CARGA_MASIVA',
    "cost_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_families" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_entries" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "list_price" DECIMAL(18,4) NOT NULL,
    "min_price" DECIMAL(18,4) NOT NULL,
    "standard_cost" DECIMAL(18,4) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "gross_subtotal" DECIMAL(18,4) NOT NULL,
    "net_subtotal" DECIMAL(18,4) NOT NULL,
    "discount_rate" DECIMAL(7,4) NOT NULL,
    "tax_rate" DECIMAL(7,4) NOT NULL,
    "tax_amount" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "total_cost" DECIMAL(18,4) NOT NULL,
    "gross_profit" DECIMAL(18,4) NOT NULL,
    "gross_margin" DECIMAL(7,4) NOT NULL,
    "frozen_at" TIMESTAMP(3),
    "frozen_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_rate" DECIMAL(7,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDIENTE',
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_approval_requests" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDIENTE',
    "discount_rate" DECIMAL(7,4) NOT NULL,
    "resulting_margin" DECIMAL(7,4) NOT NULL,
    "justification" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_comment" TEXT,

    CONSTRAINT "discount_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER,
    "completed_at" TIMESTAMP(3),
    "outcome" TEXT,
    "organization_id" TEXT,
    "opportunity_id" TEXT,
    "user_id" TEXT NOT NULL,
    "external_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "organization_id" TEXT,
    "opportunity_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_contract" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requires_competitor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "committee_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "opportunity_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "country_code" "CountryCode" NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "period_type" "ObjectivePeriod" NOT NULL,
    "quarter" INTEGER,
    "revenue_quota" DECIMAL(18,4) NOT NULL,
    "gross_profit_quota" DECIMAL(18,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "by_user_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "Role" NOT NULL,
    "permission_id" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "limit_value" DECIMAL(7,4),

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_entra_object_id_key" ON "users"("entra_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_active_idx" ON "users"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_policies_country_code_key" ON "commercial_policies"("country_code");

-- CreateIndex
CREATE INDEX "pipelines_country_code_active_idx" ON "pipelines"("country_code", "active");

-- CreateIndex
CREATE INDEX "stages_pipeline_id_idx" ON "stages"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "stages_pipeline_id_position_key" ON "stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "organizations_country_code_type_idx" ON "organizations"("country_code", "type");

-- CreateIndex
CREATE INDEX "organizations_owner_id_idx" ON "organizations"("owner_id");

-- CreateIndex
CREATE INDEX "organizations_parent_id_idx" ON "organizations"("parent_id");

-- CreateIndex
CREATE INDEX "people_organization_id_idx" ON "people"("organization_id");

-- CreateIndex
CREATE INDEX "people_committee_role_id_idx" ON "people"("committee_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_folio_key" ON "opportunities"("folio");

-- CreateIndex
CREATE INDEX "opportunities_owner_id_status_idx" ON "opportunities"("owner_id", "status");

-- CreateIndex
CREATE INDEX "opportunities_country_code_status_expected_close_date_idx" ON "opportunities"("country_code", "status", "expected_close_date");

-- CreateIndex
CREATE INDEX "opportunities_pipeline_id_stage_id_idx" ON "opportunities"("pipeline_id", "stage_id");

-- CreateIndex
CREATE INDEX "opportunities_organization_id_idx" ON "opportunities"("organization_id");

-- CreateIndex
CREATE INDEX "opportunities_status_actual_close_date_idx" ON "opportunities"("status", "actual_close_date");

-- CreateIndex
CREATE INDEX "stage_transitions_opportunity_id_at_date_idx" ON "stage_transitions"("opportunity_id", "at_date");

-- CreateIndex
CREATE INDEX "opportunity_support_user_id_idx" ON "opportunity_support"("user_id");

-- CreateIndex
CREATE INDEX "meddic_assessments_person_id_idx" ON "meddic_assessments"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "meddic_assessments_opportunity_id_component_key" ON "meddic_assessments"("opportunity_id", "component");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_family_id_active_idx" ON "products"("family_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_families_name_key" ON "product_families"("name");

-- CreateIndex
CREATE INDEX "price_list_entries_product_id_valid_from_valid_to_idx" ON "price_list_entries"("product_id", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_product_id_valid_from_key" ON "price_list_entries"("product_id", "valid_from");

-- CreateIndex
CREATE INDEX "quotes_opportunity_id_status_idx" ON "quotes"("opportunity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_opportunity_id_version_key" ON "quotes"("opportunity_id", "version");

-- CreateIndex
CREATE INDEX "quote_lines_product_id_idx" ON "quote_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_quote_id_position_key" ON "quote_lines"("quote_id", "position");

-- CreateIndex
CREATE INDEX "milestones_due_date_status_idx" ON "milestones"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_opportunity_id_position_key" ON "milestones"("opportunity_id", "position");

-- CreateIndex
CREATE INDEX "discount_approval_requests_status_due_at_idx" ON "discount_approval_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "discount_approval_requests_opportunity_id_idx" ON "discount_approval_requests"("opportunity_id");

-- CreateIndex
CREATE INDEX "activities_user_id_starts_at_idx" ON "activities"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "activities_opportunity_id_idx" ON "activities"("opportunity_id");

-- CreateIndex
CREATE INDEX "activities_organization_id_idx" ON "activities"("organization_id");

-- CreateIndex
CREATE INDEX "documents_opportunity_id_idx" ON "documents"("opportunity_id");

-- CreateIndex
CREATE INDEX "documents_organization_id_idx" ON "documents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_types_name_key" ON "activity_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_name_key" ON "document_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "loss_reasons_name_key" ON "loss_reasons"("name");

-- CreateIndex
CREATE UNIQUE INDEX "committee_roles_name_key" ON "committee_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_sources_name_key" ON "opportunity_sources"("name");

-- CreateIndex
CREATE INDEX "objectives_country_code_fiscal_year_idx" ON "objectives"("country_code", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "objectives_user_id_fiscal_year_period_type_quarter_key" ON "objectives"("user_id", "fiscal_year", "period_type", "quarter");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_at_idx" ON "audit_logs"("entity", "entity_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_by_user_id_at_idx" ON "audit_logs"("by_user_id", "at");

-- CreateIndex
CREATE INDEX "saved_views_user_id_screen_idx" ON "saved_views"("user_id", "screen");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_user_id_screen_name_key" ON "saved_views"("user_id", "screen", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- AddForeignKey
ALTER TABLE "commercial_policies" ADD CONSTRAINT "commercial_policies_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_committee_role_id_fkey" FOREIGN KEY ("committee_role_id") REFERENCES "committee_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_person_id_fkey" FOREIGN KEY ("primary_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_loss_reason_id_fkey" FOREIGN KEY ("loss_reason_id") REFERENCES "loss_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "opportunity_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_support" ADD CONSTRAINT "opportunity_support_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_support" ADD CONSTRAINT "opportunity_support_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meddic_assessments" ADD CONSTRAINT "meddic_assessments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meddic_assessments" ADD CONSTRAINT "meddic_assessments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meddic_assessments" ADD CONSTRAINT "meddic_assessments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meddic_weights" ADD CONSTRAINT "meddic_weights_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "product_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_frozen_by_id_fkey" FOREIGN KEY ("frozen_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_approval_requests" ADD CONSTRAINT "discount_approval_requests_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_approval_requests" ADD CONSTRAINT "discount_approval_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_approval_requests" ADD CONSTRAINT "discount_approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_approval_requests" ADD CONSTRAINT "discount_approval_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- RLS de respaldo - deny-all
-- ===========================================================================
--
-- Va en ESTA migracion, no en una aparte. Separar el CREATE TABLE del ENABLE
-- ROW LEVEL SECURITY es exactamente lo que dejo once tablas descubiertas en el
-- esquema anterior: una lista escrita a mano se desincroniza. La regla
-- react-doctor/supabase-table-missing-rls marca esa separacion como error.
--
-- Habilitar RLS sin crear ninguna politica equivale, en Supabase, a negar todo
-- acceso a los roles `anon` y `authenticated`. Prisma entra con su propio rol,
-- que no queda sujeto.
--
-- Esto es defensa en profundidad, NO la autorizacion. La autorizacion vive en
-- lib/scope (INV-01), porque RLS filtra filas y el invariante mas delicado del
-- sistema, INV-02, es de columnas.
--
-- El bucle recorre pg_tables en vez de enumerar: asi no hay lista que mantener
-- y una tabla nueva queda protegida por omision.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
