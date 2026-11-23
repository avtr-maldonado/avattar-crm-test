-- La matriz solo lleva permisos que alguna funcionalidad consulta · decisiones §66.
-- Solo datos: el esquema no cambia (la columna limit_value queda para cuando
-- vuelvan las autorizaciones de descuento).

-- Salen tres que nada consultaba.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN ('AUTORIZAR_DESCUENTO', 'EXPORTAR_CON_COSTO', 'VER_OPORTUNIDADES_PROPIAS')
);
DELETE FROM "permissions"
WHERE "code" IN ('AUTORIZAR_DESCUENTO', 'EXPORTAR_CON_COSTO', 'VER_OPORTUNIDADES_PROPIAS');

-- Tres cambian de nombre para decir lo que hacen. El código no cambia.
UPDATE "permissions" SET
  "name" = 'Gestionar oportunidades de la oficina',
  "description" = 'Reasignar, editar las de otros y elegir propietario al convertir un prospecto. Lo que cada quien ve lo decide su rol (decisiones §66).'
WHERE "code" = 'VER_OPORTUNIDADES_OFICINA';

UPDATE "permissions" SET
  "name" = 'Editar productos y cuotas',
  "description" = 'Dar de alta y editar productos, y fijar las cuotas de Objetivos (decisiones §66).'
WHERE "code" = 'EDITAR_CATALOGOS';

UPDATE "permissions" SET
  "name" = 'Ver política comercial',
  "description" = 'La pestaña de solo lectura con umbrales, mínimos MEDDIC y SLA por país (INV-05, decisiones §66).'
WHERE "code" = 'EDITAR_POLITICA_COMERCIAL';
