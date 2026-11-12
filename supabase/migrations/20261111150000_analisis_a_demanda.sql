-- Análisis con IA a demanda · decisiones §63 (enmienda §62).
-- Nada corre solo: la marca pasa a ser «cuándo cambió por última vez», el
-- arriendo del barrido pasa a ser el bloqueo «analizando», y los reintentos
-- desaparecen. Entra el permiso ANALIZAR_CON_IA a la matriz.

ALTER TABLE "opportunities" RENAME COLUMN "analysis_due_at" TO "last_changed_at";
ALTER TABLE "opportunities" RENAME COLUMN "analysis_leased_at" TO "analysis_started_at";
ALTER TABLE "opportunities" DROP COLUMN "analysis_attempts";
DROP INDEX IF EXISTS "opportunities_status_analysis_due_at_idx";

-- Arranca con la última modificación conocida para no avisar «nada cambió» en falso.
UPDATE "opportunities" SET "last_changed_at" = "updated_at" WHERE "last_changed_at" IS NULL;
UPDATE "opportunities" SET "analysis_started_at" = NULL;

INSERT INTO "permissions" ("id", "code", "name", "description")
VALUES (
  'perm_analizar_con_ia',
  'ANALIZAR_CON_IA',
  'Analizar con IA',
  'Pedir desde el detalle la ficha de estado que escribe el agente (decisiones §63). Sin él, queda el MCP.'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT r.role, p.id, r.granted
FROM (
  VALUES
    ('VENDEDOR'::"Role", true),
    ('GERENTE_PAIS'::"Role", true),
    ('DIRECCION'::"Role", true),
    ('ADMINISTRADOR'::"Role", true),
    ('PREVENTA'::"Role", false),
    ('MARKETING'::"Role", false)
) AS r(role, granted)
CROSS JOIN "permissions" p
WHERE p.code = 'ANALIZAR_CON_IA'
ON CONFLICT ("role", "permission_id") DO NOTHING;
