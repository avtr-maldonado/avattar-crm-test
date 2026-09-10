-- DOCUMENTOS
-- ============================================================================

create table documentos (
  id                uuid primary key default gen_random_uuid(),
  oportunidad_id    uuid not null references oportunidades(id) on delete cascade,
  tipo_documento_id uuid references catalogos(id),     -- catalogos.tipo = 'tipo_documento'
  nombre_archivo    text not null,
  storage_path      text not null,        -- ruta en Supabase Storage
  version           int not null default 1,
  autor_id          uuid references usuarios(id),
  confidencial      boolean not null default false,    -- SEG-04
  creado_en         timestamptz not null default now()
);
create index idx_documentos_oportunidad on documentos (oportunidad_id);

-- ============================================================================
