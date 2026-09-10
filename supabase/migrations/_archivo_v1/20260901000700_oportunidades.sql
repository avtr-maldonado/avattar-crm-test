-- OPORTUNIDADES
-- ============================================================================

-- Secuencia para el folio legible OPP-AAAA-NNNNN (RN: folio inmutable).
create sequence seq_oportunidad_folio;

create table oportunidades (
  id                        uuid primary key default gen_random_uuid(),
  folio                     text not null unique,
  nombre                    text not null,
  organizacion_id           uuid not null references organizaciones(id),
  persona_principal_id      uuid not null references personas(id),
  pipeline_id               uuid not null references pipelines(id),
  etapa_id                  uuid not null references etapas(id),
  estatus                   text not null default 'abierta' check (estatus in ('abierta','ganada','perdida','cancelada')),
  propietario_id            uuid not null references usuarios(id),
  equipo_id                 uuid references equipos(id),
  pais_codigo               char(2) not null references paises(codigo),   -- derivado del pipeline, desnormalizado por performance
  -- Sin moneda_codigo ni tipo_cambio_congelado: todo monto de la oportunidad
  -- (vía cotizacion_lineas y hitos_facturacion) está en USD. RN-13b ya no
  -- aplica — ver nota de arquitectura de moneda al inicio del archivo.
  fecha_cierre_estimada     date,
  fecha_cierre_real         date,
  probabilidad              int check (probabilidad between 0 and 100),
  categoria_pronostico      text check (categoria_pronostico in ('compromiso','mejor_caso','pipeline','omitido')),
  tipo_negocio              text check (tipo_negocio in ('nuevo_cliente','expansion','renovacion','licitacion')),
  origen_id                 uuid references catalogos(id),          -- catalogos.tipo = 'origen'
  partner_fabricante_id     uuid references organizaciones(id),
  motivo_perdida_id         uuid references catalogos(id),          -- catalogos.tipo = 'motivo_perdida'
  competidor_ganador        text,
  licitacion                jsonb,                    -- {numero_convocatoria, entidad, junta_aclaraciones, entrega, fallo}
  prospecto_origen_id       uuid references prospectos(id),         -- PR-04
  oportunidad_relacionada_id uuid references oportunidades(id),     -- RN-19: negocio ligado en otro país
  renovacion_de_oportunidad_id uuid references oportunidades(id),   -- RN-37
  reabierta                 boolean not null default false,         -- RN-16
  custom_fields             jsonb not null default '{}',
  creado_por                uuid references usuarios(id),
  creado_en                 timestamptz not null default now(),
  modificado_por            uuid references usuarios(id),
  modificado_en             timestamptz not null default now(),
  borrado_logico            boolean not null default false,
  check (
    (estatus <> 'perdida') or (motivo_perdida_id is not null)   -- RN-14
  ),
  check (
    (estatus <> 'ganada') or (fecha_cierre_real is not null)    -- parte de RN-13
  )
);
create index idx_oportunidades_pipeline_etapa on oportunidades (pipeline_id, etapa_id) where not borrado_logico;
create index idx_oportunidades_propietario on oportunidades (propietario_id) where estatus = 'abierta';
create index idx_oportunidades_pais on oportunidades (pais_codigo);
create trigger trg_oportunidades_modificado
  before update on oportunidades for each row execute function fn_set_modificado_en();

alter table prospectos
  add constraint fk_prospectos_oportunidad foreign key (oportunidad_id) references oportunidades(id);

-- Folio autogenerado OPP-AAAA-NNNNN.
create or replace function fn_generar_folio_oportunidad()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'OPP-' || to_char(now(), 'YYYY') || '-' ||
                 lpad(nextval('seq_oportunidad_folio')::text, 5, '0');
  end if;
  return new;
end;
$$;
create trigger trg_oportunidades_folio
  before insert on oportunidades for each row execute function fn_generar_folio_oportunidad();

-- Comité de compra (RN: roles declarados por persona en la oportunidad).
create table oportunidad_participantes (
  id                uuid primary key default gen_random_uuid(),
  oportunidad_id    uuid not null references oportunidades(id) on delete cascade,
  persona_id        uuid not null references personas(id),
  rol_contacto_id   uuid not null references catalogos(id),   -- catalogos.tipo = 'rol_contacto'
  unique (oportunidad_id, persona_id, rol_contacto_id)
);

-- Reparto de crédito entre vendedores (RN-20, RN-21). La suma exacta a 100
-- se valida con un trigger, no con un CHECK (requiere agregación).
create table oportunidad_copropietarios (
  id                uuid primary key default gen_random_uuid(),
  oportunidad_id    uuid not null references oportunidades(id) on delete cascade,
  usuario_id        uuid not null references usuarios(id),
  porcentaje        numeric(5,2) not null check (porcentaje > 0 and porcentaje <= 100),
  unique (oportunidad_id, usuario_id)
);

create or replace function fn_validar_suma_copropietarios()
returns trigger language plpgsql as $$
declare
  suma numeric;
begin
  select coalesce(sum(porcentaje), 0) into suma
  from oportunidad_copropietarios
  where oportunidad_id = coalesce(new.oportunidad_id, old.oportunidad_id);

  if suma > 100 then
    raise exception 'La suma de porcentajes de copropietarios no puede exceder 100%% (RN-20). Suma actual: %', suma;
  end if;
  return new;
end;
$$;
create trigger trg_copropietarios_valida
  after insert or update on oportunidad_copropietarios
  for each row execute function fn_validar_suma_copropietarios();
comment on function fn_validar_suma_copropietarios is 'Valida que no exceda 100%. La validación de "debe sumar EXACTAMENTE 100% para poder ganar" (RN-20) se hace al marcar la oportunidad como ganada, no en cada insert.';

-- ============================================================================
