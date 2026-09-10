-- CONTACTOS: ORGANIZACIONES Y PERSONAS
-- ============================================================================

create table organizaciones (
  id                  uuid primary key default gen_random_uuid(),
  nombre_comercial    text not null,
  razon_social        text,
  id_fiscal           text,                 -- RFC / NIT / RUT según país
  pais_codigo         char(2) not null references paises(codigo),
  ciudad              text,
  direccion           text,
  industria_id        uuid references catalogos(id),      -- catalogos.tipo = 'industria'
  tamano_id           uuid references catalogos(id),      -- catalogos.tipo = 'tamano_organizacion'
  tipo_id             uuid references catalogos(id),      -- catalogos.tipo = 'tipo_organizacion'
  organizacion_padre_id uuid references organizaciones(id),
  propietario_id      uuid not null references usuarios(id),
  sitio_web           text,
  linkedin            text,
  condicion_pago_id   uuid references catalogos(id),      -- catalogos.tipo = 'condicion_pago'
  etiquetas           text[] not null default '{}',
  estatus             text not null default 'activo' check (estatus in ('activo','inactivo','lista_negra')),
  custom_fields       jsonb not null default '{}',
  creado_por          uuid references usuarios(id),
  creado_en           timestamptz not null default now(),
  modificado_por      uuid references usuarios(id),
  modificado_en       timestamptz not null default now(),
  borrado_logico      boolean not null default false
);
create index idx_organizaciones_pais on organizaciones (pais_codigo) where not borrado_logico;
create index idx_organizaciones_padre on organizaciones (organizacion_padre_id);
create trigger trg_organizaciones_modificado
  before update on organizaciones for each row execute function fn_set_modificado_en();

create table personas (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  apellidos             text,
  puesto                text,
  area                  text,
  idioma                text default 'es',
  zona_horaria          text,
  propietario_id        uuid not null references usuarios(id),
  consentimiento_datos  boolean not null default false,
  consentimiento_fecha  timestamptz,
  fuente_id             uuid references catalogos(id),   -- catalogos.tipo = 'origen'
  custom_fields         jsonb not null default '{}',
  creado_por            uuid references usuarios(id),
  creado_en             timestamptz not null default now(),
  modificado_por        uuid references usuarios(id),
  modificado_en         timestamptz not null default now(),
  borrado_logico        boolean not null default false
);
create trigger trg_personas_modificado
  before update on personas for each row execute function fn_set_modificado_en();
comment on column personas.consentimiento_datos is 'RN-07: sin consentimiento, la persona se excluye de envíos masivos y campañas. Obligatorio por LFPDPPP/Ley 1581/Ley 19.628 (§13).';

create table persona_correos (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid not null references personas(id) on delete cascade,
  correo        citext not null,
  es_principal  boolean not null default false
);
create unique index uq_persona_correo_principal
  on persona_correos (persona_id) where es_principal;

create table persona_telefonos (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references personas(id) on delete cascade,
  telefono     text not null,
  tipo         text check (tipo in ('oficina','movil','whatsapp'))
);

-- Tabla puente N:M persona-organización con vigencia (RN-05).
create table contacto_roles (
  id                uuid primary key default gen_random_uuid(),
  persona_id        uuid not null references personas(id),
  organizacion_id   uuid not null references organizaciones(id),
  puesto            text,
  es_principal      boolean not null default false,
  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  creado_en         timestamptz not null default now()
);
create index idx_contacto_roles_persona on contacto_roles (persona_id);
create index idx_contacto_roles_org on contacto_roles (organizacion_id);

-- ============================================================================
