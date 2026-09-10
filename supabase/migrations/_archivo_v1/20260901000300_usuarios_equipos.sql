-- USUARIOS Y EQUIPOS
-- ============================================================================

-- Perfil de aplicación 1:1 con auth.users de Supabase.
create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  correo          citext not null unique,
  rol             text not null check (rol in (
                    'vendedor','gerente_pais','direccion_comercial',
                    'preventa_consultor','finanzas','marketing','administrador'
                  )),
  pais_codigo     char(2) references paises(codigo),   -- oficina; null si es rol multi-país
  equipo_id       uuid,                                 -- FK diferida (equipos definido abajo)
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  modificado_en   timestamptz not null default now()
);
comment on column usuarios.rol is 'SEG: matriz de roles de la especificación. preventa_consultor resuelve D-04 (ya definido en la especificación original, confirmar con el Director de México si sigue vigente).';

create table equipos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  pais_codigo  char(2) not null references paises(codigo),
  lider_id     uuid references usuarios(id),
  activo       boolean not null default true
);

alter table usuarios
  add constraint fk_usuarios_equipo foreign key (equipo_id) references equipos(id);

-- ============================================================================
