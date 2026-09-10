-- ============================================================================
-- FUNCIONES DE APOYO
-- ============================================================================

-- Mantiene modificado_en al día en cualquier tabla que la use.
create or replace function fn_set_modificado_en()
returns trigger language plpgsql as $$
begin
  new.modificado_en := now();
  return new;
end;
$$;

-- ============================================================================
