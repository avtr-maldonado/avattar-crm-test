-- §71 · Rúbrica de calificación de prospectos: criterios con peso (los activos suman 100) y la
-- calificación de cada prospecto criterio por criterio, con el nombre y el peso de ese momento.
-- Esquema generado con prisma migrate diff contra DEV; después RLS deny-all y la rúbrica inicial.

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "scored_at" TIMESTAMP(3),
ADD COLUMN     "scored_by_id" TEXT;

-- CreateTable
CREATE TABLE "lead_scoring_criteria" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lead_scoring_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_score_items" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "met" BOOLEAN NOT NULL,

    CONSTRAINT "lead_score_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_scoring_criteria_name_key" ON "lead_scoring_criteria"("name");

-- CreateIndex
CREATE INDEX "lead_score_items_lead_id_idx" ON "lead_score_items"("lead_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_scored_by_id_fkey" FOREIGN KEY ("scored_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_items" ADD CONSTRAINT "lead_score_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_items" ADD CONSTRAINT "lead_score_items_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "lead_scoring_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS deny-all en las tablas nuevas, como en todas (init_crm_avtr).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_scoring_criteria','lead_score_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Rúbrica inicial (suma 100). Se edita en Configuración › Prospectos.
INSERT INTO "lead_scoring_criteria" ("id", "name", "weight", "position") VALUES
  ('lsc_presupuesto', 'Tiene presupuesto asignado o aprobado', 25, 1),
  ('lsc_autoridad', 'Habla con quien decide o influye en la decisión', 20, 2),
  ('lsc_necesidad', 'Necesidad concreta que Avattar resuelve', 25, 3),
  ('lsc_plazo', 'Fecha o plazo para decidir (≤ 6 meses)', 15, 4),
  ('lsc_perfil', 'Empresa en el perfil (giro y tamaño objetivo)', 15, 5)
ON CONFLICT ("name") DO NOTHING;
