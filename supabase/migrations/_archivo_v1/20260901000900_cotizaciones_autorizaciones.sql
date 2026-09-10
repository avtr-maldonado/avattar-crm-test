-- COTIZACIÓN (versionado congelado, RN-28)
-- ============================================================================

create table cotizaciones (
  id              uuid primary key default gen_random_uuid(),
  oportunidad_id  uuid not null references oportunidades(id),
  version         int not null,
  estatus         text not null default 'borrador' check (estatus in ('borrador','congelada')),
  congelada_en    timestamptz,
  creado_por      uuid references usuarios(id),
  creado_en       timestamptz not null default now(),
  unique (oportunidad_id, version)
);
create index idx_cotizaciones_oportunidad on cotizaciones (oportunidad_id);

create table cotizacion_lineas (
  id                uuid primary key default gen_random_uuid(),
  cotizacion_id     uuid not null references cotizaciones(id) on delete cascade,
  producto_id       uuid references productos(id),     -- null si es línea libre (RN-33)
  descripcion       text not null,
  unidad            text not null,
  cantidad          numeric(18,4) not null check (cantidad > 0),
  precio_lista      numeric(18,2) not null,        -- USD
  descuento_pct     numeric(5,2),
  descuento_monto   numeric(18,2),                 -- USD
  costo_unitario    numeric(18,2) not null default 0,   -- USD
  orden             int not null default 0,
  check (descuento_pct is null or descuento_monto is null)   -- RN-24: nunca ambos
);
create index idx_cotizacion_lineas_cotizacion on cotizacion_lineas (cotizacion_id);
comment on table cotizacion_lineas is 'Solo columnas de entrada. Importe/utilidad/margen se calculan en la vista v_cotizacion_lineas_calc, no como columnas generadas, para poder ajustar la fórmula sin migrar.';

-- Vista con los cálculos del motor de precio (§04 de la especificación).
-- Incluye costo: usar solo para roles con permiso de ver costo (SEG-01).
create view v_cotizacion_lineas_calc as
select
  cl.*,
  (cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) as precio_neto,
  (cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) * cl.cantidad as importe,
  cl.costo_unitario * cl.cantidad as costo_total,
  ((cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) * cl.cantidad)
    - (cl.costo_unitario * cl.cantidad) as utilidad,
  case
    when ((cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) * cl.cantidad) > 0
    then (
      (((cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) * cl.cantidad)
        - (cl.costo_unitario * cl.cantidad))
      / ((cl.precio_lista * (1 - coalesce(cl.descuento_pct, 0) / 100.0) - coalesce(cl.descuento_monto, 0)) * cl.cantidad)
    )
    else 0
  end as margen
from cotizacion_lineas cl;

-- Vista "segura" sin costo, para roles con ver-margen-sin-ver-costo (SEG-01,
-- RN-27). La app decide cuál de las dos vistas consultar según el rol —
-- Postgres RLS no filtra columnas, solo filas.
create view v_cotizacion_lineas_sin_costo as
select
  id, cotizacion_id, producto_id, descripcion, unidad, cantidad,
  precio_lista, descuento_pct, descuento_monto, orden,
  precio_neto, importe, utilidad, margen
from v_cotizacion_lineas_calc;

-- Solicitudes de autorización de descuento/margen (M9/M10 del catálogo).
create table autorizaciones_descuento (
  id                    uuid primary key default gen_random_uuid(),
  oportunidad_id        uuid not null references oportunidades(id),
  cotizacion_id         uuid not null references cotizaciones(id),
  valor_neto            numeric(18,2) not null,     -- USD
  descuento_solicitado_pct numeric(5,2) not null,
  margen_resultante_pct numeric(5,2) not null,
  justificacion         text,
  estatus               text not null default 'pendiente' check (estatus in ('pendiente','autorizada','rechazada','devuelta')),
  decidido_por          uuid references usuarios(id),
  decidido_en           timestamptz,
  nota_devolucion       text,
  vence_en              timestamptz,        -- D-05: plazo aún sin definir, se calcula en app al crear el registro
  creado_por            uuid references usuarios(id),
  creado_en             timestamptz not null default now()
);
create index idx_autorizaciones_pendientes on autorizaciones_descuento (estatus, vence_en) where estatus = 'pendiente';

-- ============================================================================
