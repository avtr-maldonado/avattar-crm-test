# Verificación del bundle del navegador

react-doctor marca dos reglas sobre `app/(auth)/login`:
`artifact-secret-leak` y `artifact-baas-authority-surface`. Ambas están
suprimidas en `doctor.config.json`, y este documento es la evidencia de por qué.

**Reproducir:** `pnpm build`, luego buscar cada término en `.next/static/**/*.js`.

## Qué llega al navegador

| Término | Desarrollo | Producción | Esperado |
|---|---|---|---|
| Clave publicable (`sb_publishable_…`) | presente | presente | **Sí** — es pública por diseño |
| Clave `service_role` | ausente | ausente | No — sería crítico |
| Contraseña de la base | ausente | ausente | No — sería crítico |
| Cadena `service_role` | presente | **ausente** | Ver abajo |
| Nombres de tabla (`opportunities`) | ausente | ausente | No |
| Campos de autorización (`VER_COSTO`) | ausente | ausente | No |

## Por qué las dos reglas son falso positivo

**`artifact-secret-leak`.** Lo que detecta es la clave publicable. Es pública por
diseño: Supabase la emite para el navegador y su seguridad no depende del
secreto sino de que RLS niegue todo. En este proyecto RLS está en **deny-all en
las 32 tablas**, verificado con `get_advisors`, y los datos de negocio ni
siquiera pasan por Supabase: van por Prisma a través de `lib/scope` (INV-01).

**`artifact-baas-authority-surface`.** La regla advierte que la configuración de
Supabase, junto con nombres de colección y campos de rol o propietario, le da a
un atacante un mapa preciso de autorización. En desarrollo dispara por la cadena
`service_role`, que resulta ser un **comentario del propio
`@supabase/supabase-js`** —su JSDoc «Never expose your `service_role` key in the
browser»— que en modo desarrollo viaja sin minificar. En producción desaparece.

Los otros dos ingredientes de la regla nunca están: no viajan nombres de tabla
ni campos de autorización, porque el navegador no habla con Supabase para datos.

## Cuándo reabrir esto

- Si alguna pantalla empieza a consultar tablas de negocio con `supabase-js`
  desde el cliente. Ahí sí el nombre de la tabla viajaría, y la regla tendría
  razón.
- Si se agregan políticas RLS que otorguen lectura a `anon` o `authenticated`.
  Hoy no hay ninguna, y esa es la razón por la que la clave publicable no abre
  nada.
