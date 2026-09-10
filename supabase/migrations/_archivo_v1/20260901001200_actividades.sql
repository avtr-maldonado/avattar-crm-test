-- ACTIVIDADES
-- ============================================================================

-- Catálogo de tipos con comportamiento propio (no es un catálogo genérico
-- porque tiene columnas de comportamiento, no solo nombre).
create table tipos_actividad (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  icono                 text,
  color                 text,
  requiere_duracion     boolean not null default false,
  ocupa_calendario      boolean not null default false,
  requiere_resultado    boolean not null default false,
  cuenta_como_contacto  boolean not null default true,
  activo                boolean not null default true
);

create table actividades (
  id                    uuid primary key default gen_random_uuid(),
  tipo_actividad_id     uuid not null references tipos_actividad(id),
  asunto                text not null,
  inicio                timestamptz,
  fin                   timestamptz,
  duracion_min          int,
  estatus               text not null default 'planeada' check (estatus in ('planeada','realizada','cancelada','reprogramada')),
  oportunidad_id        uuid references oportunidades(id),
  organizacion_id       uuid references organizaciones(id),
  persona_id            uuid references personas(id),
  prospecto_id          uuid references prospectos(id),   -- actividades sobre un prospecto (§10b)
  ubicacion             text,
  enlace                text,
  resultado             text,
  notas                 text,
  siguiente_paso_texto  text,
  siguiente_paso_fecha  date,
  fecha_original        timestamptz,       -- RN-42: se conserva al reprogramar
  motivo_cancelacion    text,              -- RN-44
  creado_por            uuid references usuarios(id),
  creado_en             timestamptz not null default now(),
  check (
    oportunidad_id is not null or organizacion_id is not null
    or persona_id is not null or prospecto_id is not null
  )
);
create index idx_actividades_oportunidad on actividades (oportunidad_id) where estatus = 'planeada';
create index idx_actividades_prospecto on actividades (prospecto_id) where estatus = 'planeada';

create table actividad_participantes (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references actividades(id) on delete cascade,
  usuario_id    uuid references usuarios(id),
  persona_id    uuid references personas(id),
  check (usuario_id is not null or persona_id is not null)
);

-- ============================================================================
