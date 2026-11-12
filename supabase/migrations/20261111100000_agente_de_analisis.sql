-- Agente de análisis de oportunidades · decisiones §62.
-- Marca de análisis pendiente en la oportunidad, origen y tokens de la ficha,
-- y bitácora sin usuario cuando escribe el agente.

CREATE TYPE "InsightOrigin" AS ENUM ('MCP', 'AGENTE');

ALTER TABLE "opportunities"
  ADD COLUMN "analysis_due_at"    TIMESTAMP(3),
  ADD COLUMN "analysis_leased_at" TIMESTAMP(3),
  ADD COLUMN "analysis_attempts"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "analysis_error"     TEXT;

CREATE INDEX "opportunities_status_analysis_due_at_idx" ON "opportunities"("status", "analysis_due_at");

ALTER TABLE "opportunity_insights"
  ALTER COLUMN "generated_by" DROP NOT NULL,
  ADD COLUMN "origin"        "InsightOrigin" NOT NULL DEFAULT 'MCP',
  ADD COLUMN "input_tokens"  INTEGER,
  ADD COLUMN "output_tokens" INTEGER;

ALTER TABLE "audit_logs" ALTER COLUMN "by_user_id" DROP NOT NULL;
