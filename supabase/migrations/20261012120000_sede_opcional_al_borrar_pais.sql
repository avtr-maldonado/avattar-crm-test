-- La llave foranea de la sede queda en SET NULL, como dice el schema.
--
-- Cuando las organizaciones dejaron de pertenecer a un pais (decisiones §18,
-- migracion 20260917192619) `country_code` se volvio opcional y la relacion de
-- Prisma paso a ser nullable. Prisma genera entonces ON DELETE SET NULL, pero
-- aquella migracion solo quito el NOT NULL: la restriccion se quedo con el
-- ON DELETE RESTRICT que puso la inicial.
--
-- El efecto practico de la diferencia es pequeno: borrar un pais que alguna
-- cuenta tenga como sede fallaria, en vez de dejar la sede en blanco. Los
-- paises no se borran hoy, asi que nadie lo noto. Lo que si se notaba es que
-- `prisma migrate diff` nunca daba vacio contra la base, y ese vacio es la
-- unica prueba de que una base esta al dia con el schema. Sin el, no hay forma
-- de verificar que un ambiente nuevo quedo bien.
--
-- Se aplica a los dos ambientes para que compartan historia (plan de ambiente
-- productivo, D2).

ALTER TABLE "organizations" DROP CONSTRAINT "organizations_country_code_fkey";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_country_code_fkey"
  FOREIGN KEY ("country_code") REFERENCES "countries"("code")
  ON DELETE SET NULL ON UPDATE CASCADE;
