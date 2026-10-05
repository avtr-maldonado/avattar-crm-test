-- §39 · Responsable de preventa. El permiso CREAR_OPORTUNIDAD entra a la
-- matriz: todos los roles comerciales lo tienen; PREVENTA no. Preventa ve las
-- oportunidades donde está asignado como apoyo y les agrega actividades.
INSERT INTO "permissions" ("id", "code", "name", "description")
VALUES (
  'perm_crear_oportunidad',
  'CREAR_OPORTUNIDAD',
  'Crear oportunidades',
  'Dar de alta oportunidades y trabajarlas en el tablero. Preventa las apoya: las ve y les agrega actividades.'
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
    ('PREVENTA'::"Role", false)
) AS r(role, granted)
CROSS JOIN "permissions" p
WHERE p.code = 'CREAR_OPORTUNIDAD'
ON CONFLICT ("role", "permission_id") DO NOTHING;
