-- BITÁCORA DE AUDITORÍA
-- ============================================================================

create table bitacora (
  id            uuid primary key default gen_random_uuid(),
  tabla         text not null,
  registro_id   uuid not null,
  accion        text not null check (accion in ('crear','actualizar','eliminar','exportar','reautorizar','reabrir')),
  usuario_id    uuid references usuarios(id),
  detalle       jsonb not null default '{}',     -- valores anteriores/nuevos relevantes
  creado_en     timestamptz not null default now()
);
create index idx_bitacora_tabla_registro on bitacora (tabla, registro_id);
comment on table bitacora is 'RN-16, HF-06, SEG-03, SEG-05: toda reapertura, cambio de hito ya congelado, exportación y cambio de permisos debe dejar traza aquí.';

-- ============================================================================
