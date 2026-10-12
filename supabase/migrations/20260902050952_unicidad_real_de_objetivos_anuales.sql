-- El indice unico que genera Prisma para
-- @@unique([userId, fiscalYear, periodType, quarter]) NO restringe los
-- objetivos anuales, porque en SQL NULL != NULL y `quarter` es nulo para
-- periodType = ANUAL. Se podrian insertar dos anuales del mismo usuario y
-- ano sin que el indice lo impidiera, y RN-32 supone que hay uno solo.
--
-- Postgres 15 introdujo NULLS NOT DISTINCT, que hace que los nulos se
-- comparen entre si dentro del indice. Es la correccion exacta: conserva el
-- significado de `quarter` nulo (no hay trimestre) en vez de inventar un
-- centinela como 0.
--
-- Prisma todavia no expresa NULLS NOT DISTINCT en el schema, asi que el
-- indice se administra aqui. El schema conserva el @@unique para que el
-- cliente siga tipando la llave compuesta.

DROP INDEX IF EXISTS public.objectives_user_id_fiscal_year_period_type_quarter_key;

CREATE UNIQUE INDEX objectives_user_id_fiscal_year_period_type_quarter_key
  ON public.objectives
  USING btree (user_id, fiscal_year, period_type, quarter)
  NULLS NOT DISTINCT;
