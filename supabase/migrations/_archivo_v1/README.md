# Esquema v1 · archivado

Estas 16 migraciones son la primera generación del esquema del CRM. **Nunca se
aplicaron** al proyecto de Supabase: al revisarlo el 1 de septiembre de 2026,
`cjwahoscedjnjgalmyzu` tenía cero tablas en `public`, cero migraciones
registradas y cero usuarios en `auth.users`.

Se conservan por dos razones: sus comentarios SQL documentan decisiones de
negocio que valen la pena (sobre todo la nota de arquitectura de moneda del
primer archivo), y los defectos que se listan abajo no deben reaparecer.

No están en el camino de compilación ni de lint. No las apliques.

## Por qué se reemplazaron

El spec normativo v2.0 (`docs/CRM-AVTR-SPEC.md`) diverge de este esquema en
puntos que no se resuelven con migraciones incrementales:

| Tema | Esquema v1 | Spec v2.0 |
|---|---|---|
| Identificadores | Español (`oportunidades.etapa_id`) | Inglés; §4.1 marca el español como incorrecto |
| Porcentajes | `numeric(5,2)` = `15.00` | Fracción `0.1500` (INV-03) |
| Roles | 7, incluye finanzas y marketing | 5 (`VENDEDOR`…`PREVENTA`) |
| MEDDIC | No existe | Núcleo del sistema (§7) |
| Catálogos | Tabla genérica `catalogos(tipo,…)` | Tablas dedicadas con comportamiento propio |
| Hitos | Guarda `porcentaje` **o** `monto` | Siempre monto; el % es vista (§6.3) |
| Objetivos | `sujeto_tipo` + `metrica` como fila | Dos columnas de cuota por usuario |
| Estados | Incluye `cancelada` | Solo `ABIERTA/GANADA/PERDIDA` (RN-12) |
| Faltaban | — | `StageTransition`, `MeddicWeight`, `SavedView`, `Permission`, `RolePermission`, `Stage.gateMode` |

La instrucción del spec §6.2 —«genera migraciones incrementales en lugar de
recrear la base»— suponía una base poblada. Sobre una base vacía habría
producido docenas de `ALTER` sin ninguna ganancia.

**Lo que sí sobrevivió de aquí:** la decisión de monomoneda USD. El spec pedía
multimoneda; se confirmó con el negocio que la operación real de Avattar en los
tres países ya cotiza en dólares, y el esquema nuevo mantiene la decisión de
estos archivos. Ver `docs/superpowers/specs/2026-09-01-crm-avattar-e0-e1-design.md`
§2, decisión D-A.

## Defectos encontrados · no repetir

**1. La vista «sin costo» revelaba el costo.**
`v_cotizacion_lineas_sin_costo` (en `20260901000900`) exponía `importe` y
`utilidad`. Como `utilidad = importe − costo`, bastaba una resta para obtener el
costo. La vista rompía SEG-01 / RN-09 / INV-02 exactamente en el punto que decía
proteger. En el esquema nuevo esto se resuelve con selectores de Prisma elegidos
por permiso: sin `VER_COSTO`, las columnas no se consultan, no se ocultan.

**2. Las dos vistas hacían bypass de RLS.**
Sin `security_invoker = true`, una vista se ejecuta con los privilegios de su
dueño e ignora el RLS de la tabla subyacente.

**3. Once tablas sin RLS habilitado.**
`20260901001500_rls_habilitado.sql` habilitaba RLS en 17 de las 28 tablas. Las
once restantes quedaban expuestas por PostgREST con la clave `anon`: `usuarios`,
`equipos`, `persona_correos`, `persona_telefonos`, `catalogos`, `paises`,
`politica_comercial_pais`, `pipelines`, `etapas`, `tipos_actividad` y
`actividad_participantes`. Nombres y correos legibles públicamente, con
implicaciones bajo LFPDPPP, Ley 1581 y Ley 19.628.

La causa raíz es haber separado el `create table` del `enable row level
security` en archivos distintos: una lista escrita a mano se desincroniza.
`react-doctor/supabase-table-missing-rls` marca esto como error y exige
habilitarlo en la misma migración. El esquema nuevo lo hace con un bucle sobre
`pg_tables`, sin lista que mantener.

**4. El folio no reiniciaba por año.**
`seq_oportunidad_folio` era una secuencia global: el 1-ene-2027 el folio habría
seguido en `OPP-2027-00015`. RN-20 pide consecutivo por año. El esquema nuevo usa
una tabla `folio_counters` con `UPDATE … RETURNING` dentro de la transacción.

**5. Conteo de tablas mal documentado.**
El `CLAUDE.md` anterior afirmaba «30 tablas, 2 vistas». El conteo real de estos
archivos es **28 tablas y 2 vistas**.
