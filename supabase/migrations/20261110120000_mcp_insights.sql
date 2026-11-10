-- §61 · Servidor MCP: recomendaciones guardadas por un cliente de IA y el
-- registro de acceso de las herramientas. Esquema generado con prisma migrate
-- diff y revisado; RLS deny-all como en el resto (la autorización vive en
-- lib/scope, INV-01).

-- CreateEnum
CREATE TYPE "McpCallResult" AS ENUM ('OK', 'RECHAZADO', 'ERROR');

-- CreateTable
CREATE TABLE "opportunity_insights" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source_activity_ids" TEXT[],
    "model" TEXT,
    "generated_by" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tool_calls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "opportunity_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER NOT NULL,
    "result" "McpCallResult" NOT NULL,
    "message" TEXT,

    CONSTRAINT "mcp_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_insights_opportunity_id_generated_at_idx" ON "opportunity_insights"("opportunity_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "mcp_tool_calls_user_id_at_idx" ON "mcp_tool_calls"("user_id", "at");

-- CreateIndex
CREATE INDEX "mcp_tool_calls_opportunity_id_at_idx" ON "mcp_tool_calls"("opportunity_id", "at");

-- AddForeignKey
ALTER TABLE "opportunity_insights" ADD CONSTRAINT "opportunity_insights_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_insights" ADD CONSTRAINT "opportunity_insights_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS deny-all como respaldo, igual que el resto de las tablas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['opportunity_insights', 'mcp_tool_calls'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
