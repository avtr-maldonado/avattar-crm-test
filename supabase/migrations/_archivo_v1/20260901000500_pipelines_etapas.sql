-- PIPELINES Y ETAPAS
-- ============================================================================

create table pipelines (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  pais_codigo  char(2) not null references paises(codigo),
  activo       boolean not null default true
);

create table etapas (
  id                  uuid primary key default gen_random_uuid(),
  pipeline_id         uuid not null references pipelines(id),
  nombre              text not null,
  orden               int not null,
  probabilidad        int not null check (probabilidad between 0 and 100),
  dias_estancada      int not null,          -- RN-11
  etapa_corporativa   text not null check (etapa_corporativa in (
                        'calificacion','descubrimiento','propuesta','negociacion','cierre'
                      )),                     -- mapeo a las 5 etapas corporativas
  requisito_avance    jsonb not null default '[]',  -- RN-12: lista de requisitos estructurados
  activo              boolean not null default true,
  unique (pipeline_id, orden)
);
create index idx_etapas_pipeline on etapas (pipeline_id);

-- ============================================================================
