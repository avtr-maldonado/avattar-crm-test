-- CATÁLOGOS
-- ============================================================================

-- Catálogo genérico para listas cortas administrables sin migración:
-- industria, tipo_organizacion, origen, motivo_perdida, rol_contacto,
-- tipo_documento, condicion_pago, tamano_organizacion,
-- motivo_descarte_prospecto, calificacion_prospecto, familia_producto,
-- subfamilia_producto, modelo_precio, recurrencia_producto.
-- MD-05: se desactivan, nunca se eliminan.
create table catalogos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,           -- ver lista de tipos arriba
  codigo        text,                    -- slug estable para uso en código, opcional
  nombre        text not null,
  orden         int default 0,
  metadata      jsonb not null default '{}',
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (tipo, codigo)
);
comment on table catalogos is 'Catálogos administrables sin despliegue (requisito no funcional §13). No usar para pipelines/etapas/productos, que tienen comportamiento propio.';

create table paises (
  codigo                char(2) primary key,   -- MX, CO, CL
  nombre                text not null,
  activo                boolean not null default true
);

-- NOTA: no hay tabla de monedas ni de tipo de cambio en este esquema — ver
-- "ARQUITECTURA DE MONEDA" al inicio del archivo. Todo monto es USD.

-- Política comercial parametrizable por país (resuelve C-04: impuesto fijo en
-- el prototipo debe ser parámetro; y D-07: umbrales aún provisionales).
create table politica_comercial_pais (
  pais_codigo                         char(2) primary key references paises(codigo),
  iva_pct                             numeric(5,4) not null,
  umbral_autorizacion_gerencia_pct    numeric(5,2) not null default 15.00,
  umbral_autorizacion_direccion_pct   numeric(5,2) not null default 30.00,
  piso_margen_global_pct              numeric(5,2) not null default 20.00,
  piso_margen_linea_pct               numeric(5,2) not null default 10.00,
  plazo_respuesta_autorizacion_horas  int,          -- D-05, aún sin definir
  vigente_desde                      date not null default current_date,
  modificado_por                     uuid,
  modificado_en                      timestamptz not null default now()
);
comment on table politica_comercial_pais is 'Valores provisionales (D-07). No usar como fuente de verdad de negocio hasta que Dirección los confirme.';

-- ============================================================================
