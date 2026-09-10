-- PRODUCTOS Y LISTAS DE PRECIO
-- ============================================================================

create table productos (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  nombre              text not null,
  descripcion         text,
  familia_id          uuid references catalogos(id),      -- catalogos.tipo = 'familia_producto'
  subfamilia_id       uuid references catalogos(id),      -- catalogos.tipo = 'subfamilia_producto'
  unidad_medida       text not null,                       -- hora, día, mes, usuario, licencia, proyecto, pieza, GB
  modelo_precio       text not null check (modelo_precio in ('fijo','tiempo_materiales','recurrente','consumo')),
  recurrencia         text check (recurrencia in ('unica','mensual','trimestral','anual')),
  fabricante_id       uuid references organizaciones(id),
  tasa_impuesto       numeric(5,4),           -- puede diferir del impuesto general del país (RN-22)
  margen_objetivo_pct numeric(5,2),
  costo_referencia    numeric(18,2),          -- costo sugerido; el costo real se captura en la línea
  activo              boolean not null default true,
  vigencia_desde      date not null default current_date,
  vigencia_hasta      date,
  check (recurrencia is null or modelo_precio = 'recurrente')
);
create index idx_productos_familia on productos (familia_id);

-- Lista de precios ÚNICA para los 3 países, en USD (decisión explícita del
-- usuario: ya no hay una lista por país/moneda). Si en el futuro el costo
-- real difiere por país (p. ej. costos de staffing local), habrá que
-- reabrir esta decisión — costo_estandar hoy es un solo valor global.
create table listas_precio (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references productos(id),
  precio_lista      numeric(18,2) not null,      -- USD
  precio_minimo     numeric(18,2),               -- USD
  costo_estandar    numeric(18,2),               -- USD; riesgo C-01 si Defontana no lo sincroniza
  vigencia_desde    date not null default current_date,
  vigencia_hasta    date,
  unique (producto_id, vigencia_desde)
);
create index idx_listas_precio_producto on listas_precio (producto_id);
comment on table listas_precio is 'Lista única en USD para MX/CO/CL (decisión del usuario, no por país). Ver nota de arquitectura de moneda al inicio del archivo.';
comment on column listas_precio.costo_estandar is 'C-01: sin integración con Defontana en el MVP, este valor se desactualiza si nadie lo mantiene manualmente. Ver D-01 (responsable del catálogo y costos). Pendiente confirmar si el costo real varía por país aunque el precio de venta no varíe.';

-- ============================================================================
