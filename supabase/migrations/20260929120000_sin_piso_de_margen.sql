-- El piso de margen sale del sistema (decisiones-pendientes §33).
--
-- El negocio decidió el 29 de septiembre de 2026 dejar fuera del alcance el
-- «piso de margen» y todo lo que lo implicaba: el piso global y el piso por
-- línea de la política comercial (RN-05), y el precio mínimo por SKU que se
-- derivaba de él (RN-08). El margen se sigue calculando y mostrando; lo que
-- desaparece es el umbral contra el que se comparaba.
--
-- Las columnas se borran, no se dejan en cero: un umbral que existe pero no
-- decide nada es un literal esperando a que alguien lo vuelva a leer.

alter table public.commercial_policies
  drop column margin_floor,
  drop column line_margin_floor;

alter table public.price_list_entries
  drop column min_price;
