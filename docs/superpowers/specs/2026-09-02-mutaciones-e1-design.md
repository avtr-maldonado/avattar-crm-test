# Capa de mutaciones de E1 — diseño

**Fecha:** 2 de septiembre de 2026
**Estado:** aprobado por el negocio el 2-sep-2026
**Depende de:** [`2026-09-01-crm-avattar-e0-e1-design.md`](./2026-09-01-crm-avattar-e0-e1-design.md) §3.5
**Spec normativo:** [`../../CRM-AVTR-SPEC.md`](../../CRM-AVTR-SPEC.md)

---

## 1. Por qué existe este documento

Todo lo construido hasta hoy **lee**. Ocho pantallas, doce módulos de `lib/scope`, 238 pruebas,
y ni una sola escritura. El sistema se ve completo y no se puede usar: un vendedor entra, ve su
pipeline sembrado, y no puede mover una oportunidad de etapa ni registrar la llamada que acaba de
hacer.

El §3.5 del diseño de E0/E1 ya decidió la **forma** de una mutación —Server Action que valida con
Zod, autoriza, y delega en un servicio de `lib/domain`, con todo lo multitabla en `$transaction`—.
Lo que no decidió es **cuáles** existen en este incremento, qué escribe cada una, y qué devuelve
cuando se niega. Eso es lo que este documento fija.

---

## 2. Alcance

Cinco acciones. La lista salió de tres restricciones que se cruzan:

1. **§12.4 dice que el día del vendedor se diseña primero**, porque es el flujo que decide la
   adopción. Eso obliga a `registrarActividad` y a `cambiarEtapa`.
2. **AC-04 y AC-33 son criterios de E0/E1 que siguen sin pasar.** AC-33, según §6.3 del diseño
   anterior, se prueba sobre las dos acciones auditables que existen en este alcance: edición de
   catálogos y cambio de propietario. Con solo una de las dos, el criterio no cierra.
3. **Sin alta, el sistema no recibe nada.** `lib/domain/folio.ts` está construido y sus tres
   pruebas llevan semanas saltadas esperando exactamente esta acción.

| Acción | Escribe | Autoriza | Bitácora | Criterios |
|---|---|---|---|---|
| `cambiarEtapa` | `stageId`, `stageEnteredAt`, `StageTransition` | dueño o alcance de oficina | `StageTransition` | RN-02, RN-03 |
| `registrarActividad` | actividad completada + la siguiente, `lastActivityAt`, `nextActivityAt` | dueño de la actividad | — | §12.4 |
| `cambiarPropietario` | `ownerId` | `VER_OPORTUNIDADES_OFICINA` | `CAMBIAR_PROPIETARIO` | AC-04, AC-33, RN-31 |
| `editarCatalogo` | `name`, `active`, banderas de comportamiento | `EDITAR_CATALOGOS` | `EDITAR_CATALOGO` | AC-33, MD-05 |
| `crearOportunidad` | oportunidad + folio consecutivo | sesión con alcance | — | INV-12, RN-20 |

### 2.1 Qué no entra

Marcar ganada y marcar perdida son de **E3**, no de aquí: dependen del cuadre de hitos (AC-18) y
del mínimo MEDDIC (AC-14), y ninguno de sus editores existe todavía. Reabrir oportunidad es de E3
por la misma razón. Autorizar descuento y cambiar precio sobre cotización congelada son de E2.

Las cuatro acciones auditables restantes de INV-09 quedan pendientes, y AC-33 sigue pasando
**parcialmente y por diseño**, igual que lo declaró §6.3 del diseño anterior. Lo que cambia es que
ahora las dos que sí existen están implementadas y probadas, no solo previstas.

---

## 3. El contrato de una acción

### 3.1 Las acciones no lanzan

```ts
export type Problema = {
  /** El campo del formulario, cuando el problema es de un campo. */
  campo?: string;
  /** En español y con el dato concreto (§13.5). */
  mensaje: string;
};

export type MotivoDeFalla =
  | "VALIDACION"
  | "AUTORIZACION"
  | "COMPUERTA"
  | "CONFIRMACION"
  | "CONFLICTO";

/** `T = null` y no `void`: `datos` siempre existe, aunque no lleve nada. */
export type ResultadoAccion<T = null> =
  | { ok: true; datos: T }
  | { ok: false; motivo: MotivoDeFalla; problemas: Problema[] };
```

**Por qué no una excepción.** `evaluateGate` fue construido a propósito para devolver *todos* los
requisitos faltantes y no solo el primero —«reportar de a uno obliga al vendedor a arreglar,
reintentar y descubrir el siguiente»—. Y §13.5 exige que el error se vea dentro del formulario,
con el dato concreto: «faltan $200,000 por asignar en hitos», no «datos inválidos». Un `throw`
aplana esa lista a un mensaje y a una pantalla de error. El resultado la conserva entera y llega
a la pantalla por `useActionState`.

Las excepciones se reservan para lo que de verdad es excepcional: la base caída, un `id` que no
existe. Eso sí sube y lo atrapa `error.tsx`.

### 3.2 Los cinco motivos

| Motivo | Cuándo | Qué ve el usuario |
|---|---|---|
| `VALIDACION` | Zod rechazó la entrada | El problema debajo del campo |
| `AUTORIZACION` | La sesión no puede hacer esto, o no sobre esta fila | Un mensaje, sin revelar si la fila existe |
| `COMPUERTA` | RN-02 no se cumple | La lista completa de requisitos faltantes |
| `CONFIRMACION` | Falta una confirmación explícita que el spec exige | La pregunta, y el formulario se reenvía con la confirmación |
| `CONFLICTO` | El estado cambió bajo los pies (la oportunidad ya se movió) | Qué pasó y que recargue |

`AUTORIZACION` **no distingue** «no existe» de «no puedes». Distinguirlas le confirma a un
vendedor que cierta oportunidad existe aunque no sea suya, que es justo lo que INV-01 evita.

### 3.3 Dónde vive cada cosa

```
app/(app)/oportunidades/acciones.ts        "use server" · crearOportunidad
app/(app)/oportunidades/[id]/acciones.ts   "use server" · cambiarEtapa, cambiarPropietario
app/(app)/actividades/acciones.ts          "use server" · registrarActividad
app/(app)/admin/acciones.ts                "use server" · editarCatalogo

lib/domain/opportunity.ts   servicios: cambiar etapa, cambiar propietario, crear
lib/domain/activity.ts      servicio: registrar actividad con su siguiente paso
lib/domain/catalog.ts       servicio: editar un valor de catálogo
lib/acciones.ts             el tipo ResultadoAccion y sus constructores
```

La Server Action hace **cuatro cosas y ninguna más**: parsea con Zod, obtiene la sesión, delega en
el servicio de dominio, y revalida la ruta. Toda decisión de negocio está en `lib/domain`; todo
acceso a datos, en `lib/domain` o `lib/scope`. `app/**` no importa `lib/db` ni `@prisma/client`,
y la prueba de arquitectura de AC-32 lo verifica sobre los archivos nuevos igual que sobre los
viejos.

---

## 4. Las acciones, una por una

### 4.1 `cambiarEtapa`

```ts
cambiarEtapa(input: {
  opportunityId: string;
  toStageId: string;
  /** Solo se respeta si la etapa destino es ADVERTENCIA. */
  omitirCompuerta?: boolean;
}): Promise<ResultadoAccion>
```

**Qué escribe, en una transacción:** `stageId`, `stageEnteredAt = now()`, y una fila de
`StageTransition` con `fromStageId`, `toStageId`, `byUserId` y `gateOverride`.

**La compuerta.** No hay que armar el `GateContext` a mano: `getOpportunityDetail` ya trae los
insumos —documentos, cotización congelada, hitos, MEDDIC y autorizaciones— y
`contextoDeCompuerta` ya los traduce. El servicio compone lo que existe:

```
getOpportunityDetail(session, id)   ← alcance aplicado (INV-01) y contexto en una consulta
  → contextoDeCompuerta(detalle, umbrales)
  → evaluateGate(stageDestino.gateRequires, ctx)
```

**El umbral llega por parámetro, no lo lee el dominio.** La prueba de AC-31 verifica que ningún
archivo de `lib/domain` importe `lib/policy`: «los umbrales entran por parámetro, no por
importación», para que las funciones sigan siendo probables sin base. Así que la Server Action lee
`getCommercialPolicy(pais)` y le pasa al servicio `umbrales: { meddicMinToClosing: number }`.
Ninguna constante en el camino (INV-05).

**`gateMode` decide qué pasa con los faltantes:**

- `BLOQUEANTE` → `{ ok: false, motivo: "COMPUERTA" }` con la lista. **Nadie la salta**, ningún
  rol, ninguna bandera. El comentario del esquema en `StageTransition.gateOverride` lo dice sin
  ambigüedad: ese campo es para «avanzó pese a una compuerta en **ADVERTENCIA**».
- `ADVERTENCIA` → si no viene `omitirCompuerta`, devuelve `motivo: "COMPUERTA"` con la lista y la
  pantalla la muestra con un botón de «avanzar de todos modos». Si viene, avanza y sella
  `gateOverride = true`, que es lo que alimenta el reporte semanal de incumplimiento de §8.3.

**`stageEnteredAt` se resella también al retroceder.** RN-03: «el contador se reinicia solo al
cambiar de etapa». Retroceder es cambiar de etapa. Una oportunidad que regresa de Negociación a
Propuesta empieza de nuevo sus 30 días, y eso es correcto: el reloj mide cuánto lleva *donde
está*.

**Autoriza:** el dueño, o quien tenga alcance de oficina sobre esa oportunidad. Se resuelve
pidiéndosela a `lib/scope`, no consultando `prisma.opportunity` directo (INV-01). Si `lib/scope`
no la devuelve, la respuesta es `AUTORIZACION` —sin decir si existe.

### 4.2 `registrarActividad`

```ts
registrarActividad(input: {
  actividadId?: string;        // completar una existente
  opportunityId?: string;      // o crear una ya completada sobre una oportunidad
  typeId: string;
  subject: string;
  outcome?: string;
  siguiente?: { typeId: string; subject: string; startsAt: Date };
  /** §12.4 · confirmación explícita de cerrar sin seguimiento. */
  sinSeguimiento?: boolean;
}): Promise<ResultadoAccion>
```

**El DEBE de §12.4 vive en el servidor.** «Una actividad que se completa sin agendar la siguiente
**DEBE** preguntar de forma explícita si se cierra sin seguimiento.» Si no viene `siguiente` ni
`sinSeguimiento`, la acción devuelve `motivo: "CONFIRMACION"` y no escribe nada. El formulario se
reenvía con la confirmación.

Ponerlo en un `confirm()` del cliente lo dejaría a merced de la consola del navegador. Ponerlo en
el servidor lo hace la regla, no la sugerencia. Y de paso, la prueba se escribe sin navegador.

**Qué escribe, en una transacción:** `completedAt = now()` y `outcome` en la actividad; si viene
`siguiente`, la actividad nueva; y en la oportunidad, `lastActivityAt = now()` y
`nextActivityAt` = la fecha de la siguiente, o `null` si se cerró sin seguimiento.

Ese `nextActivityAt = null` es lo que hace que la oportunidad **aparezca mañana en la tercera
lista** de `/actividades`, la de «sin próxima actividad». El ciclo de §12.4 se cierra solo.

**No lleva `AuditLog`:** registrar una actividad no está entre las seis acciones de INV-09, y no
debería estarlo. La actividad *es* su propio registro.

### 4.3 `cambiarPropietario`

```ts
cambiarPropietario(input: {
  opportunityId: string;
  nuevoPropietarioId: string;
}): Promise<ResultadoAccion>
```

**Qué escribe, en `auditedTransaction`:** `ownerId`, y un `AuditLog` con
`action: "CAMBIAR_PROPIETARIO"`, `before: { ownerId }`, `after: { ownerId }`. La bitácora va en la
misma transacción por construcción: `auditedTransaction` entrega una función `audit` con `tx`
capturado en su clausura, así que es imposible escribirla contra otra conexión, y si falla,
revierte también el cambio (INV-09, AC-33).

Ver §5, que documenta las dos reglas que esta acción necesita y el spec no trae.

### 4.4 `editarCatalogo`

```ts
editarCatalogo(input: {
  catalogo: "ACTIVIDAD" | "DOCUMENTO" | "MOTIVO_PERDIDA" | "ROL_COMITE";
  id: string;
  name?: string;
  active?: boolean;
  /** Solo aplica al catálogo que lo tiene. */
  isContract?: boolean;
  requiresCompetitor?: boolean;
}): Promise<ResultadoAccion>
```

**Nada se elimina, se desactiva** (INV-15, y MD-05: «se desactivan, nunca se eliminan»). La acción
no expone borrado. P-11 ya muestra cuántas veces se usó cada valor, que es lo que permite
desactivar con conocimiento en vez de a ciegas.

**Qué escribe, en `auditedTransaction`:** el cambio y un `AuditLog` con
`action: "EDITAR_CATALOGO"` y solo los campos que cambiaron, no la fila entera.

**Las banderas de comportamiento no son cosméticas.** `DocumentType.isContract` satisface la
compuerta `CONTRATO_O_OC_CARGADO`, y `LossReason.requiresCompetitor` obliga a nombrar al
competidor al perder (RN-16). Cambiar una de las dos cambia el comportamiento del sistema, y por
eso queda en bitácora con `before` y `after`.

### 4.5 `crearOportunidad`

> **Ampliada el 2-sep-2026 al construir la pantalla.** Además de lo que sigue,
> acepta crear la organización y la persona **en la misma transacción**, y
> elegir la etapa de entrada evaluando su compuerta. Ver
> `docs/decisiones-pendientes.md` §11.

```ts
crearOportunidad(input: {
  name: string;
  organizationId: string;
  primaryPersonId?: string;
  pipelineId: string;
  estimatedAmount: string;      // decimal como cadena, INV-03
  expectedCloseDate: Date;
  businessType: BusinessType;
  sourceId?: string;
  ownerId?: string;             // solo con alcance de oficina; si no, uno mismo
}): Promise<ResultadoAccion<{ id: string; folio: string }>>
```

**El folio.** `nextFolio(tx, year)` hace un `INSERT … ON CONFLICT DO UPDATE … RETURNING` sobre
`folio_counters`, atómico y en la misma transacción que la oportunidad. **Nunca `count() + 1`**:
ese era el defecto del esquema archivado, que además no reiniciaba en enero. El consecutivo es por
año (INV-12), y el año es el de la fecha de creación, no el fiscal.

**La etapa inicial es la de `position` menor del pipeline**, no una constante ni un nombre. INV-13:
las etapas son datos. `stageEnteredAt` se sella al crear, para que el reloj de RN-03 empiece a
correr desde el primer día.

**`amount` arranca igual a `estimatedAmount`.** El comentario del esquema dice que `amount` es el
neto vigente, espejo de la cotización activa; mientras no hay cotización, el estimado *es* el
valor. `grossMargin` queda en `null`: no hay costo del cual derivarlo, y **inventar un margen sería
peor que no tenerlo**, porque las banderas de riesgo lo leen.

**El país sale de la organización**, no del formulario. Que un vendedor pudiera elegirlo sería
darle una llave a otro país por la puerta de atrás (AC-05). Y **el pipeline tiene que ser de ese
mismo país**: una organización mexicana con el pipeline de Colombia produciría una oportunidad que
ninguna pantalla filtra bien y cuyas etapas no son las que su gerente administra. Se valida; no se
asume que el formulario ofrezca solo los correctos.

**`ownerId` solo lo elige quien puede reasignar.** Es la misma decisión de §5.1 aplicada al alta:
si un vendedor pudiera dar de alta una oportunidad a nombre de otro, tendría reasignación
disfrazada de creación. Sin alcance de oficina, el dueño es uno mismo y el campo se ignora.

**No lleva `AuditLog`:** crear no está entre las seis de INV-09. La fila misma, con `createdById`
y `createdAt`, es el registro.

---

## 5. Dos reglas derivadas, para confirmar con el negocio

El spec no las trae. Se derivan de lo que sí dice, y quedan marcadas para que el Director las
confirme junto con Q-01.

### 5.1 Quién puede reasignar (`Q-13`)

La matriz de §5.2 tiene once permisos y **ninguno es «cambiar propietario»**. Lo único que dice el
spec es el escenario de RN-31: «*el Gerente* cambia el propietario a Gabriel».

**Se deriva:** puede reasignar quien tenga `VER_OPORTUNIDADES_OFICINA`. Eso da Gerencia, Dirección
y Administración, y **deja fuera al vendedor**, que si no podría regalarse o quitarse
oportunidades —incluida la de otro— sin que nadie se enterara.

La condición sale de los datos de permisos, no de un `switch` por rol, así que si mañana el
negocio decide que Preventa también reasigna, es una fila en `RolePermission` y no un despliegue.

**Costo de cambiarla:** una línea en `lib/domain/opportunity.ts`.

### 5.2 A quién se le puede reasignar (`Q-14`)

**Se deriva:** solo a usuarios activos cuyo `countryCodes` incluya el país de la oportunidad.

Sin esta condición **AC-05 se rompe por la puerta de atrás**. El criterio dice que un
`GERENTE_PAIS` de México no obtiene ninguna oportunidad de Colombia por ningún filtro; pero si un
gerente pudiera reasignar una oportunidad mexicana a un vendedor colombiano, ese vendedor la vería
en su pipeline sin que ningún filtro lo hubiera permitido. La restricción del alcance se aplicaría
correctamente y aun así el dato habría cruzado la frontera.

Es más restrictiva que el spec, y a propósito. Relajarla exige decidir antes qué significa una
oportunidad cuyo dueño no opera en su país.

**Costo de cambiarla:** una condición en la consulta de destinatarios válidos.

---

## 6. Criterios de aceptación de este incremento

Los que deben pasar al terminar:

- **AC-04** · al cambiar el propietario, el anterior deja de ver la oportunidad, el nuevo la ve, y
  queda un `AuditLog` con `before` y `after`. De punta a punta contra la base.
- **AC-33** · las dos acciones auditables existentes dejan exactamente un `AuditLog` cada una, y
  si la escritura del log falla, la operación completa se revierte. Sigue siendo parcial en el
  sentido de §6.3: cuatro de las seis acciones de INV-09 llegan con E2 y E3.
- **AC-32** · ninguna de las acciones nuevas importa `lib/db` ni consulta oportunidades fuera de
  `lib/scope`.
- **AC-05** · la reasignación no cruza países (§5.2).
- **RN-02** · una etapa `BLOQUEANTE` con requisitos faltantes no avanza, y el mensaje los nombra
  todos. Una `ADVERTENCIA` avanza con confirmación y sella `gateOverride`.
- **RN-03** · `stageEnteredAt` se resella en cada transición, incluida la que retrocede.
- **INV-12 / RN-20** · dos altas seguidas dan folios distintos; el consecutivo reinicia en enero;
  altas concurrentes no colisionan.
- **§12.4** · completar sin siguiente paso y sin confirmación explícita no escribe nada.

### 6.1 Las nueve pruebas saltadas

`lib/domain/folio.test.ts` (3), `lib/audit/audit.test.ts` (2) y `lib/policy/policy.test.ts` (4)
están saltadas con la nota «se activa con la Task 12 / hasta que exista `DATABASE_URL`». Esa
condición se cumplió hace días y nadie las volvió a mirar. **Se desaltan en este incremento**, y
si alguna falla, el hallazgo es real y se atiende.

Las dos de `audit.test.ts` son de AC-33 y ejercitan `writeAudit` directamente, sin necesitar
ninguna mutación. Estaban probando el criterio desde antes de que existiera esta capa.

---

## 7. Pruebas

**Unitarias, sin base.** El armado del `GateContext`, la elección de la etapa inicial por
`position`, y el rechazo por falta de confirmación de §12.4.

**Integración contra Postgres**, una por acción, en `tests/integracion/mutaciones.test.ts`. Las
que escriben limpian lo suyo o corren dentro de una transacción que se revierte; el seed tiene que
quedar como estaba, porque las otras 238 pruebas dependen de sus cifras exactas.

**AC-04 de punta a punta** merece su propio archivo: crea el escenario, reasigna, y verifica con
`lib/scope` —no con `prisma` directo— que Paulina dejó de verla y Gabriel la ve.

---

## 8. Riesgos

**El seed es un dato compartido y ahora hay escrituras.** 238 pruebas afirman cifras exactas sobre
él: valor abierto 12 621 000, ponderado 7 362 350, 49 actividades, 14 oportunidades. Una prueba de
mutación que deje basura las rompe todas, y el síntoma aparecerá lejos de la causa. Mitigación:
cada prueba que escribe limpia lo suyo, y la suite corre con `fileParallelism: false`, que ya está
configurado.

**Sin `db:seed` reproducible, un error de limpieza cuesta caro.** `pnpm db:seed` es idempotente por
diseño (todo `upsert`), así que la recuperación existe. Conviene verificarlo antes de escribir la
primera prueba de mutación, no después.

**Las compuertas evalúan contra datos que sus editores todavía no crean.** `COTIZACION_CONGELADA`,
`HITOS_CUADRADOS` y `MEDDIC_MIN_CIERRE` leen tablas que el seed sí puebla pero que ninguna pantalla
edita hasta E2 y E3. Es la decisión deliberada de §6.1 del diseño anterior —esquema completo desde
E0 para que el evaluador se construya entero— y aquí se cobra el beneficio: la compuerta de Cierre
se puede probar de verdad hoy. Pero significa que un usuario que tope con esa compuerta **no tiene
cómo resolverla** en la aplicación todavía. El mensaje debe decirlo, en vez de pedir algo
imposible.
