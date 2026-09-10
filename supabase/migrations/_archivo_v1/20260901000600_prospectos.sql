-- PROSPECTOS (LEADS) — §10b del catálogo v2, nuevo módulo, Fase 2
-- ============================================================================

create table prospectos (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null,
  organizacion_id       uuid references organizaciones(id),   -- opcional (AV-1050)
  persona_id            uuid references personas(id),         -- opcional
  origen_id             uuid references catalogos(id),        -- catalogos.tipo = 'origen'
  valor_estimado        numeric(18,2),                        -- USD
  calificacion_id       uuid references catalogos(id),        -- catalogos.tipo = 'calificacion_prospecto'
  propietario_id        uuid not null references usuarios(id),
  estatus               text not null default 'abierto' check (estatus in ('abierto','convertido','descartado')),
  motivo_descarte_id    uuid references catalogos(id),        -- catalogos.tipo = 'motivo_descarte_prospecto'
  oportunidad_id        uuid,                                  -- FK diferida a oportunidades (PR-04)
  ultima_actividad_en   timestamptz,
  custom_fields         jsonb not null default '{}',
  creado_por            uuid references usuarios(id),
  creado_en             timestamptz not null default now(),
  modificado_por        uuid references usuarios(id),
  modificado_en         timestamptz not null default now(),
  borrado_logico        boolean not null default false
);
create index idx_prospectos_propietario on prospectos (propietario_id) where estatus = 'abierto';
create trigger trg_prospectos_modificado
  before update on prospectos for each row execute function fn_set_modificado_en();
comment on table prospectos is 'PR-01: no cuenta en valor de pipeline ni cobertura de cuota. PR-02: convertir es de un solo sentido salvo administrador.';

-- ============================================================================
