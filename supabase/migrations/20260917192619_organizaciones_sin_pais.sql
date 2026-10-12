-- Las organizaciones dejan de pertenecer a un país (decisiones-pendientes §18).
--
-- El negocio revisó la regla de que una cuenta fuera de un solo país y visible
-- solo desde ese país, y no le resultó conveniente: una empresa se atiende
-- desde cualquier oficina y se le venden oportunidades en cualquier país. El
-- país de la oportunidad lo pone el pipeline, no la cuenta.
--
-- `country_code` se queda como «país sede», informativo y opcional. No se
-- borra la columna: los datos existentes lo tienen y sigue siendo útil saber
-- dónde tiene su sede una empresa; simplemente ya no decide nada.
--
-- Solo cambia metadatos: no reescribe la tabla ni toca el índice
-- (country_code, type), que sigue sirviendo con nulos.
alter table public.organizations
  alter column country_code drop not null;

comment on column public.organizations.country_code is
  'País sede, informativo y opcional. No limita quién ve la cuenta ni dónde se le venden oportunidades (decisiones §18).';
