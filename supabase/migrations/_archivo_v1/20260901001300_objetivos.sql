-- OBJETIVOS
-- ============================================================================

create table objetivos (
  id              uuid primary key default gen_random_uuid(),
  sujeto_tipo     text not null check (sujeto_tipo in ('vendedor','equipo','oficina','compania')),
  usuario_id      uuid references usuarios(id),     -- si sujeto_tipo = 'vendedor'
  equipo_id       uuid references equipos(id),      -- si sujeto_tipo = 'equipo'
  pais_codigo     char(2) references paises(codigo),-- si sujeto_tipo = 'oficina'
  metrica         text not null check (metrica in ('ingreso','utilidad_bruta','oportunidades_ganadas','pipeline_creado')),
  periodo_anio    int not null,
  periodo_trimestre int check (periodo_trimestre between 1 and 4),  -- null = objetivo anual
  monto_objetivo  numeric(18,2) not null,        -- USD
  distribucion    text not null default 'uniforme' check (distribucion in ('uniforme','estacional','manual')),
  alcance         text not null default 'todos' check (alcance in ('todos','pipeline_especifico','linea_producto')),
  pipeline_id     uuid references pipelines(id),
  familia_id      uuid references catalogos(id),
  estatus         text not null default 'borrador' check (estatus in ('borrador','aprobado','bloqueado')),
  version         int not null default 1,
  creado_en       timestamptz not null default now(),
  check (
    (sujeto_tipo = 'vendedor' and usuario_id is not null) or
    (sujeto_tipo = 'equipo' and equipo_id is not null) or
    (sujeto_tipo = 'oficina' and pais_codigo is not null) or
    (sujeto_tipo = 'compania')
  )
);
create index idx_objetivos_periodo on objetivos (periodo_anio, periodo_trimestre);

-- ============================================================================
