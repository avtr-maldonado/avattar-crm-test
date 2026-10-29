-- §55 · Gerencia administra a su equipo. ADMINISTRAR_USUARIOS se concede a
-- GERENTE_PAIS; a quién puede administrar lo decide el dominio
-- (lib/domain/userAccess.ts): vendedores y preventas de sus países.
UPDATE "role_permissions" rp
SET "granted" = true
FROM "permissions" p
WHERE rp."permission_id" = p."id"
  AND p."code" = 'ADMINISTRAR_USUARIOS'
  AND rp."role" = 'GERENTE_PAIS'::"Role";

-- Por si un ambiente nuevo no trae la fila (la matriz se siembra completa, pero
-- una celda ausente se leería como «denegado»).
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'GERENTE_PAIS'::"Role", p."id", true
FROM "permissions" p
WHERE p."code" = 'ADMINISTRAR_USUARIOS'
ON CONFLICT ("role", "permission_id") DO NOTHING;

UPDATE "permissions"
SET "description" = 'Dar de alta perfiles, asignar rol y país, y dar acceso a quien ya entró con Microsoft. Gerencia solo a vendedores y preventas de sus países. Deja traza (INV-09).'
WHERE "code" = 'ADMINISTRAR_USUARIOS';
