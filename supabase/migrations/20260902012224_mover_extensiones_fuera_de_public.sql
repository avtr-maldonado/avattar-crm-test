-- Advisor extension_in_public: una extension en el schema `public` queda
-- expuesta junto con las tablas de negocio y estorba al versionarla.
--
-- citext se retira por completo: se instalo por inercia del esquema anterior,
-- pero este modelo no tiene ninguna columna citext. Los correos son String.
DROP EXTENSION IF EXISTS citext;

-- pg_trgm si hace falta: el indice trigram de la busqueda libre (spec 9.2,
-- parametro `q`). Se mueve al schema `extensions`, que es donde Supabase ya
-- tiene pgcrypto y uuid-ossp, y que viene en el search_path por omision.
-- Forma condicional (12-oct-2026): en DEV esto corrio como un ALTER directo,
-- porque pg_trgm estaba en `public`. En una base nueva la migracion inicial ya
-- lo crea en `extensions`, y ahi un ALTER directo falla con
-- "extension is already in schema". Se condiciona para que la misma historia
-- sirva en los dos casos. El efecto final es identico.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END
$$;
