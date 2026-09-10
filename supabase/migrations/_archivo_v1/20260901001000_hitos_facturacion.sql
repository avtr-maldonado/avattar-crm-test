-- HITOS DE FACTURACIÓN
-- ============================================================================

create table hitos_facturacion (
  id                uuid primary key default gen_random_uuid(),
  oportunidad_id    uuid not null references oportunidades(id) on delete cascade,
  orden             int not null,
  descripcion       text not null,
  fecha_esperada    date not null,
  modo_captura      text not null check (modo_captura in ('porcentaje','monto')),
  porcentaje        numeric(5,2),
  monto             numeric(18,2),                 -- USD
  condicion         text,
  estatus           text not null default 'proyectado' check (estatus in ('proyectado','facturado','cobrado','cancelado')),
  referencia_erp    text,          -- folio de Defontana, cuando exista esa integración
  creado_en         timestamptz not null default now(),
  check (
    (modo_captura = 'porcentaje' and porcentaje is not null)
    or (modo_captura = 'monto' and monto is not null)
  )
);
create index idx_hitos_oportunidad on hitos_facturacion (oportunidad_id, orden);
comment on table hitos_facturacion is 'HF-01/HF-04: la suma debe cuadrar exactamente contra el total antes de poder ganar la oportunidad. Esa validación se hace en la capa de aplicación al momento de cambiar el estatus a "ganada", no aquí, porque necesita leer el total vigente de cotizacion_lineas.';

-- ============================================================================
