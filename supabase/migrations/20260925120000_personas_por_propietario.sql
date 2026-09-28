-- Las personas tienen propietario y se comparten (decisiones-pendientes §29).
--
-- El negocio decidió el 25 de septiembre de 2026 que las cuentas las ve todo
-- el mundo y que las personas las ve su propietario —quien las capturó,
-- transferible—, los roles administrativos, y a quien se le compartan, solo
-- lectura. Un vendedor con una oportunidad en la cuenta también las ve; esa
-- regla se calcula en `personScope` y no necesita filas.
--
-- Datos existentes: el propietario es el dueño de la cuenta (no hay otro dato
-- de quién capturó), y se comparten con todos los vendedores activos, como se
-- pidió, para que nadie pierda de vista un contacto que ya trabajaba.

-- 1 · Propietario, rellenado con el dueño de la cuenta antes de exigirlo.
alter table public.people
  add column owner_id text;

update public.people p
   set owner_id = o.owner_id
  from public.organizations o
 where o.id = p.organization_id;

alter table public.people
  alter column owner_id set not null;

alter table public.people
  add constraint people_owner_id_fkey
  foreign key (owner_id) references public.users(id)
  on delete restrict on update cascade;

create index people_owner_id_idx on public.people(owner_id);

comment on column public.people.owner_id is
  'Quién ve a la persona: su propietario, transferible. Nace siendo quien la captura (decisiones §29).';

-- 2 · Compartidas: persona × usuario, solo lectura. Se borra con la persona.
create table public.person_shares (
  id           text          not null,
  person_id    text          not null,
  user_id      text          not null,
  shared_by_id text          not null,
  created_at   timestamp(3)  not null default current_timestamp,
  constraint person_shares_pkey primary key (id),
  constraint person_shares_person_id_fkey
    foreign key (person_id) references public.people(id) on delete cascade on update cascade,
  constraint person_shares_user_id_fkey
    foreign key (user_id) references public.users(id) on delete restrict on update cascade,
  constraint person_shares_shared_by_id_fkey
    foreign key (shared_by_id) references public.users(id) on delete restrict on update cascade
);

create unique index person_shares_person_id_user_id_key
  on public.person_shares(person_id, user_id);

create index person_shares_user_id_idx on public.person_shares(user_id);

comment on table public.person_shares is
  'Una persona compartida con un usuario, solo lectura. La comparte su propietario o quien lo administra; reasignar una oportunidad comparte los contactos de la cuenta (decisiones §29).';

-- RLS en deny-all, como el resto: la autorización vive en lib/scope (INV-01).
alter table public.person_shares enable row level security;

-- 3 · Lo que ya existía se comparte con todos los vendedores activos.
insert into public.person_shares (id, person_id, user_id, shared_by_id)
select gen_random_uuid()::text, p.id, u.id, p.owner_id
  from public.people p
  cross join public.users u
 where p.deleted_at is null
   and u.role = 'VENDEDOR'
   and u.active
   and u.deleted_at is null
   and u.id <> p.owner_id;
