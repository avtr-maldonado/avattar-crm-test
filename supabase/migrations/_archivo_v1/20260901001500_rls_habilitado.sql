-- RLS: HABILITADO SIN POLÍTICAS (pendiente entrega siguiente)
-- ============================================================================

alter table organizaciones enable row level security;
alter table personas enable row level security;
alter table contacto_roles enable row level security;
alter table prospectos enable row level security;
alter table oportunidades enable row level security;
alter table oportunidad_participantes enable row level security;
alter table oportunidad_copropietarios enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_lineas enable row level security;
alter table autorizaciones_descuento enable row level security;
alter table hitos_facturacion enable row level security;
alter table documentos enable row level security;
alter table actividades enable row level security;
alter table objetivos enable row level security;
alter table productos enable row level security;
alter table listas_precio enable row level security;
alter table bitacora enable row level security;

-- Sin políticas todavía: por diseño de Supabase, esto bloquea todo acceso
-- salvo al service_role. Next.js deberá usar el cliente admin (service_role)
