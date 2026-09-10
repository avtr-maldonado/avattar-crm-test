# Capa de mutaciones de E1 — plan de implementación

> **Para quien ejecute con agentes:** SUB-SKILL REQUERIDA: usar
> `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Meta:** que el CRM deje de ser de solo lectura — cinco Server Actions que mueven etapa, registran
actividad con su siguiente paso, reasignan, editan catálogos y dan de alta oportunidades.

**Arquitectura:** cada mutación es una Server Action delgada que parsea con Zod, obtiene la sesión,
lee los umbrales de `lib/policy` y **delega** en un servicio de `lib/domain`. El servicio autoriza
leyendo por `lib/scope` (INV-01), decide con una función pura y escribe en una sola transacción. Las
acciones **devuelven** un resultado en vez de lanzar, porque `evaluateGate` reúne todos los
requisitos faltantes y §13.5 exige mostrarlos juntos dentro del formulario.

**Stack:** Next.js 15.5 (App Router, Server Actions, `useActionState`) · TypeScript · Prisma 6.19 ·
PostgreSQL (Supabase) · Zod 3 · Vitest.

**Spec:** [`../specs/2026-09-02-mutaciones-e1-design.md`](../specs/2026-09-02-mutaciones-e1-design.md)

---

## Restricciones globales

Aplican a **todas** las tareas. Las verifican `pnpm lint`, `pnpm typecheck` y
`tests/arquitectura/invariantes.test.ts`.

- **INV-01** · toda lectura de oportunidades, organizaciones, actividades y objetivos pasa por
  `lib/scope`. Nunca `prisma.opportunity.findMany` directo en una ruta, componente o acción.
- **INV-02** · el costo y la utilidad **no se serializan** para quien no tiene `VER_COSTO`.
- **INV-03** · el dinero es `Decimal(18,4)` y se opera con `Decimal`, nunca con `number`. Los
  porcentajes se guardan como fracción (`0.1500` = 15 %).
- **INV-05** · ningún umbral en el código. Un literal `0.20`, `0.15`, `0.16` o `0.30` en
  `lib/domain` es un defecto.
- **INV-09** · las acciones sensibles escriben `AuditLog` en la misma transacción. Si el log falla,
  la operación falla. Se usa `auditedTransaction`, nunca `writeAudit` suelto.
- **INV-12** · el folio es inmutable y consecutivo **por año**. Se genera con `nextFolio`, nunca
  con `count() + 1`.
- **INV-13** · las etapas son datos. Un `switch` por nombre de etapa es un defecto.
- **INV-14** · la UI siempre en español. Identificadores en inglés.
- **INV-15** · nada se borra en duro. Los catálogos se desactivan (`active: false`).
- **`lib/domain` NO puede importar `lib/policy`.** Lo verifica AC-31: «los umbrales entran por
  parámetro, no por importación». Quien lee la política es la Server Action.
- **`app/**` y `components/**` NO pueden importar `lib/db` ni `@prisma/client`**, ni llamar a
  `prisma.<modelo>.<operación>`. Lo verifica AC-32.
- Solo `lib/scope`, `lib/domain`, `lib/policy`, `lib/audit` y `lib/auth` importan `lib/db`.
- **El seed es dato compartido.** 238 pruebas afirman cifras exactas sobre él (valor abierto
  12 621 000, ponderado 7 362 350, 49 actividades, 14 oportunidades). Toda prueba que escriba
  **limpia lo suyo**. Si algo se rompe: `pnpm db:seed` es idempotente.
- Verificación por tarea: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Si toca pantallas, además
  `pnpm react-doctor` (**no** `pnpm doctor` — ese es el de pnpm y eclipsa al script).
- Cada commit cita la regla que implementa (`RN-02`, `AC-04`, `§12.4`…).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/acciones.ts` | **Crear.** El tipo `ResultadoAccion` y sus constructores. Sin dependencias. |
| `lib/domain/opportunity.ts` | **Crear.** Núcleo puro (`decidirTransicion`, `etapaInicial`) y los tres servicios de oportunidad. |
| `lib/domain/activity.ts` | **Crear.** `requiereConfirmacion` puro y el servicio de registro. |
| `lib/domain/catalog.ts` | **Crear.** Edición de los cuatro catálogos, con bitácora. |
| `lib/scope/opportunityDetail.ts` | **Modificar.** Agregar `countryCode` al `select` (lo necesita Q-14). |
| `components/ui/formulario.tsx` | **Crear.** `Campo`, `Entrada`, `AreaDeTexto`, `Seleccion`, `Casilla`, `Panel`, `AvisosDeAccion`. |
| `app/(app)/oportunidades/acciones.ts` | **Crear.** `crearOportunidadAccion`. |
| `app/(app)/oportunidades/[id]/acciones.ts` | **Crear.** `cambiarEtapaAccion`, `cambiarPropietarioAccion`. |
| `app/(app)/actividades/acciones.ts` | **Crear.** `registrarActividadAccion`. |
| `app/(app)/admin/acciones.ts` | **Crear.** `editarCatalogoAccion`. |

Las pruebas nuevas: `lib/acciones.test.ts`, `lib/domain/opportunity.test.ts` (puras),
`lib/domain/activity.test.ts` (puras) y `tests/integracion/mutaciones.test.ts` +
`tests/integracion/ac-04-propietario.test.ts` (contra Postgres).

**Por qué la decisión está en funciones puras.** `decidirTransicion`, `requiereConfirmacion` y
`etapaInicial` no tocan la base ni la sesión: reciben datos y devuelven una decisión. Eso permite
probar los casos difíciles —compuerta bloqueante, advertencia con y sin confirmación, empate de
`position`— sin sembrar nada y sin esperar a la red. El servicio que sí toca la base queda como
plomería alrededor de una decisión ya probada.

---

## Task 1: El contrato de una acción

**Files:**
- Create: `lib/acciones.ts`
- Test: `lib/acciones.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type Problema`, `type MotivoDeFalla`, `type ResultadoAccion<T = null>`,
  `ok<T>(datos?: T): ResultadoAccion<T>`,
  `falla(motivo: MotivoDeFalla, ...problemas: (string | Problema)[]): ResultadoAccion<never>`,
  `deZod(error: ZodError): ResultadoAccion<never>`.

- [ ] **Paso 1: Escribir la prueba que falla**

```ts
// lib/acciones.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { deZod, falla, ok } from "./acciones";

describe("ResultadoAccion", () => {
  it("ok sin datos deja `datos` en null, no en undefined", () => {
    // `null` y no `void`: así `datos` siempre existe y la pantalla no tiene
    // que distinguir «no vino» de «vino vacío».
    expect(ok()).toEqual({ ok: true, datos: null });
  });

  it("ok con datos los conserva", () => {
    expect(ok({ folio: "OPP-2026-00001" })).toEqual({
      ok: true,
      datos: { folio: "OPP-2026-00001" },
    });
  });

  it("falla acepta cadenas sueltas y las vuelve problemas sin campo", () => {
    expect(falla("AUTORIZACION", "No puedes reasignar esta oportunidad.")).toEqual({
      ok: false,
      motivo: "AUTORIZACION",
      problemas: [{ mensaje: "No puedes reasignar esta oportunidad." }],
    });
  });

  it("falla conserva el campo cuando el problema lo trae", () => {
    const r = falla("VALIDACION", { campo: "name", mensaje: "Falta el nombre." });
    expect(r).toEqual({
      ok: false,
      motivo: "VALIDACION",
      problemas: [{ campo: "name", mensaje: "Falta el nombre." }],
    });
  });

  it("deZod traduce cada issue a un problema con su campo", () => {
    const esquema = z.object({ name: z.string().min(1, "Falta el nombre.") });
    const r = esquema.safeParse({ name: "" });
    expect(r.success).toBe(false);

    expect(deZod(r.error!)).toEqual({
      ok: false,
      motivo: "VALIDACION",
      problemas: [{ campo: "name", mensaje: "Falta el nombre." }],
    });
  });

  it("deZod usa el camino completo cuando el campo está anidado", () => {
    const esquema = z.object({ siguiente: z.object({ subject: z.string().min(1, "Falta.") }) });
    const r = esquema.safeParse({ siguiente: { subject: "" } });
    expect(deZod(r.error!).ok).toBe(false);
    expect(deZod(r.error!)).toMatchObject({
      problemas: [{ campo: "siguiente.subject" }],
    });
  });
});
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Ejecutar: `pnpm test lib/acciones`
Esperado: FALLA con `Failed to resolve import "./acciones"`.

- [ ] **Paso 3: Escribir la implementación**

```ts
// lib/acciones.ts
import type { ZodError } from "zod";

/**
 * Lo que una Server Action le devuelve a la pantalla.
 *
 * **Las acciones no lanzan.** `evaluateGate` fue construido a propósito para
 * reunir *todos* los requisitos faltantes y no solo el primero, y §13.5 exige
 * que el error se vea dentro del formulario con el dato concreto: «faltan
 * $200,000 por asignar en hitos», no «datos inválidos». Un `throw` aplana esa
 * lista a un mensaje y manda al usuario a una pantalla de error.
 *
 * Las excepciones se reservan para lo que de verdad es excepcional: la base
 * caída, un `id` que no existe. Eso sube y lo atrapa `error.tsx`.
 */
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

export function ok(): ResultadoAccion<null>;
export function ok<T>(datos: T): ResultadoAccion<T>;
export function ok<T>(datos?: T): ResultadoAccion<T | null> {
  return { ok: true, datos: datos ?? null };
}

export function falla(
  motivo: MotivoDeFalla,
  ...problemas: (string | Problema)[]
): ResultadoAccion<never> {
  return {
    ok: false,
    motivo,
    problemas: problemas.map((p) => (typeof p === "string" ? { mensaje: p } : p)),
  };
}

/**
 * Traduce un `ZodError`. El camino completo va en `campo` para que un problema
 * de `siguiente.subject` se pinte junto a ese control y no al inicio del
 * formulario, donde el usuario no sabría cuál de los dos asuntos está mal.
 */
export function deZod(error: ZodError): ResultadoAccion<never> {
  return {
    ok: false,
    motivo: "VALIDACION",
    problemas: error.issues.map((i) => ({
      campo: i.path.length > 0 ? i.path.join(".") : undefined,
      mensaje: i.message,
    })),
  };
}
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Ejecutar: `pnpm test lib/acciones`
Esperado: PASA, 6 pruebas.

- [ ] **Paso 5: Commit**

```bash
git add lib/acciones.ts lib/acciones.test.ts
git commit -m "feat(E1): contrato de resultado de las Server Actions (§13.5)"
```

---

## Task 2: Desaltar las nueve pruebas vencidas

Se hace **antes** de escribir mutaciones, no después. Tres de ellas prueban `nextFolio`, que
`crearOportunidad` va a usar en la Task 7; si el consecutivo tiene un defecto, hay que saberlo
ahora y no cuando esté enterrado bajo una acción.

**Files:**
- Modify: `lib/domain/folio.test.ts` (3 `it.skip`), `lib/audit/audit.test.ts` (2),
  `lib/policy/policy.test.ts` (4)

**Interfaces:**
- Consumes: nada.
- Produces: nada de código. Produce confianza en `nextFolio` y cierra la mitad de AC-33 que no
  necesitaba mutaciones.

- [ ] **Paso 1: Confirmar que la razón del salto ya no aplica**

Los tres archivos dicen alguna variante de «se salta hasta que exista `DATABASE_URL`» o «se activa
con la Task 12». Verificar que la base responde:

```bash
pnpm test tests/integracion/configuracion
```
Esperado: PASA. Si pasa, la condición del salto está cumplida desde hace días.

- [ ] **Paso 2: Quitar los nueve `.skip`**

Reemplazar `it.skip(` por `it(` en los tres archivos. Y en cada uno, corregir el comentario de
cabecera que anuncia el salto: la nota debe decir que las pruebas **corren** contra la base
sembrada, no que esperan a una tarea. Un comentario que miente es peor que ninguno.

- [ ] **Paso 3: Correr los tres archivos**

```bash
pnpm test lib/domain/folio lib/audit/audit lib/policy/policy
```
Esperado: PASAN las 9 recién activadas. Si alguna falla, **es un hallazgo real**: registrarlo en
`docs/decisiones-pendientes.md` y arreglarlo antes de seguir. En particular, la de altas
concurrentes de `folio.test.ts` es la que de verdad prueba el `ON CONFLICT DO UPDATE`.

- [ ] **Paso 4: Correr la suite completa**

```bash
pnpm test
```
Esperado: 247 pruebas, 0 saltadas. El conteo sube de 238 + 9.

- [ ] **Paso 5: Commit**

```bash
git add lib/domain/folio.test.ts lib/audit/audit.test.ts lib/policy/policy.test.ts
git commit -m "test: activar las nueve pruebas saltadas por un DATABASE_URL que ya existe (AC-33)"
```

---

## Task 3: Cambiar de etapa

**Files:**
- Create: `lib/domain/opportunity.ts`
- Test: `lib/domain/opportunity.test.ts` (puras), `tests/integracion/mutaciones.test.ts` (base)

**Interfaces:**
- Consumes: `evaluateGate`, `type GateResult`, `type GateFailure` de `@/lib/domain/stageGate` ·
  `getOpportunityDetail`, `contextoDeCompuerta` de `@/lib/scope/opportunityDetail` ·
  `ok`, `falla`, `type ResultadoAccion` de `@/lib/acciones` · `prisma` de `@/lib/db` ·
  `type Session` de `@/lib/auth/permissions`.
- Produces:
  ```ts
  type DecisionDeTransicion = {
    avanza: boolean;
    gateOverride: boolean;
    faltantes: GateFailure[];
  };
  function decidirTransicion(input: {
    gateMode: "ADVERTENCIA" | "BLOQUEANTE";
    resultado: GateResult;
    omitirCompuerta: boolean;
  }): DecisionDeTransicion;

  async function cambiarEtapa(
    session: Session,
    input: { opportunityId: string; toStageId: string; omitirCompuerta?: boolean },
    umbrales: { meddicMinToClosing: number },
  ): Promise<ResultadoAccion>;
  ```

- [ ] **Paso 1: Escribir las pruebas puras que fallan**

```ts
// lib/domain/opportunity.test.ts
import { describe, expect, it } from "vitest";
import type { GateResult } from "./stageGate";
import { decidirTransicion } from "./opportunity";

const SIN_FALTANTES: GateResult = { ok: true, missing: [] };
const CON_FALTANTES: GateResult = {
  ok: false,
  missing: [
    { requirement: "HITOS_CUADRADOS", message: "Faltan $200,000 por asignar en hitos." },
    { requirement: "MEDDIC_MIN_CIERRE", message: "El puntaje MEDDIC es 62 y el mínimo es 70." },
  ],
};

describe("decidirTransicion · RN-02", () => {
  it("sin requisitos faltantes avanza, sea cual sea el modo", () => {
    for (const gateMode of ["ADVERTENCIA", "BLOQUEANTE"] as const) {
      expect(decidirTransicion({ gateMode, resultado: SIN_FALTANTES, omitirCompuerta: false }))
        .toEqual({ avanza: true, gateOverride: false, faltantes: [] });
    }
  });

  it("BLOQUEANTE no avanza aunque se pida omitir la compuerta", () => {
    // El comentario de StageTransition.gateOverride es explícito: ese campo es
    // para «avanzó pese a una compuerta en ADVERTENCIA». Un BLOQUEANTE no lo
    // salta nadie, ningún rol, ninguna bandera.
    const d = decidirTransicion({
      gateMode: "BLOQUEANTE",
      resultado: CON_FALTANTES,
      omitirCompuerta: true,
    });
    expect(d.avanza).toBe(false);
    expect(d.gateOverride).toBe(false);
    expect(d.faltantes).toHaveLength(2);
  });

  it("ADVERTENCIA sin confirmación tampoco avanza: primero se muestran los faltantes", () => {
    const d = decidirTransicion({
      gateMode: "ADVERTENCIA",
      resultado: CON_FALTANTES,
      omitirCompuerta: false,
    });
    expect(d.avanza).toBe(false);
    expect(d.gateOverride).toBe(false);
  });

  it("ADVERTENCIA con confirmación avanza y sella el override", () => {
    // Ese sello es lo que alimenta el reporte semanal de incumplimiento (§8.3).
    const d = decidirTransicion({
      gateMode: "ADVERTENCIA",
      resultado: CON_FALTANTES,
      omitirCompuerta: true,
    });
    expect(d).toEqual({ avanza: true, gateOverride: true, faltantes: CON_FALTANTES.missing });
  });

  it("no marca override cuando no hubo nada que omitir", () => {
    // Omitir una compuerta que se cumplía ensuciaría el reporte de §8.3 con
    // incumplimientos que nunca ocurrieron.
    const d = decidirTransicion({
      gateMode: "ADVERTENCIA",
      resultado: SIN_FALTANTES,
      omitirCompuerta: true,
    });
    expect(d.gateOverride).toBe(false);
  });

  it("devuelve TODOS los faltantes, no el primero", () => {
    const d = decidirTransicion({
      gateMode: "BLOQUEANTE",
      resultado: CON_FALTANTES,
      omitirCompuerta: false,
    });
    expect(d.faltantes.map((f) => f.requirement)).toEqual([
      "HITOS_CUADRADOS",
      "MEDDIC_MIN_CIERRE",
    ]);
  });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `pnpm test lib/domain/opportunity`
Esperado: FALLA con `Failed to resolve import "./opportunity"`.

- [ ] **Paso 3: Escribir el núcleo puro y el servicio**

```ts
// lib/domain/opportunity.ts
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { contextoDeCompuerta, getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { evaluateGate, type GateFailure, type GateResult } from "./stageGate";

export type DecisionDeTransicion = {
  avanza: boolean;
  gateOverride: boolean;
  faltantes: GateFailure[];
};

/**
 * Decide si una transición procede. Pura: sin base, sin sesión, sin umbrales.
 *
 * `BLOQUEANTE` no se salta. `ADVERTENCIA` se salta solo con confirmación
 * explícita, y entonces queda sellada en `StageTransition.gateOverride`, que es
 * lo que alimenta el reporte semanal de incumplimiento de §8.3.
 */
export function decidirTransicion(input: {
  gateMode: "ADVERTENCIA" | "BLOQUEANTE";
  resultado: GateResult;
  omitirCompuerta: boolean;
}): DecisionDeTransicion {
  const faltantes = input.resultado.missing;

  if (input.resultado.ok) {
    // No hubo nada que omitir: marcar override aquí ensuciaría el reporte de
    // §8.3 con incumplimientos que nunca ocurrieron.
    return { avanza: true, gateOverride: false, faltantes: [] };
  }

  if (input.gateMode === "BLOQUEANTE" || !input.omitirCompuerta) {
    return { avanza: false, gateOverride: false, faltantes };
  }

  return { avanza: true, gateOverride: true, faltantes };
}

/**
 * `RN-02` · cambia de etapa evaluando la compuerta de la etapa destino.
 *
 * El umbral MEDDIC llega **por parámetro**: `lib/domain` no puede importar
 * `lib/policy`, y la prueba de AC-31 lo verifica. Quien lo lee es la Server
 * Action.
 */
export async function cambiarEtapa(
  session: Session,
  input: { opportunityId: string; toStageId: string; omitirCompuerta?: boolean },
  umbrales: { meddicMinToClosing: number },
): Promise<ResultadoAccion> {
  // INV-01 · el alcance por rol autoriza y, de paso, trae el contexto de la
  // compuerta en la misma consulta. Si no la devuelve, no se distingue «no
  // existe» de «no puedes»: distinguirlas le confirmaría a un vendedor que
  // cierta oportunidad existe aunque no sea suya.
  const detalle = await getOpportunityDetail(session, input.opportunityId);
  if (!detalle) {
    return falla("AUTORIZACION", "No encontramos esa oportunidad o no tienes acceso a ella.");
  }

  const destino = detalle.pipeline.stages.find((e) => e.id === input.toStageId);
  if (!destino) {
    return falla("VALIDACION", {
      campo: "toStageId",
      mensaje: "Esa etapa no pertenece al pipeline de la oportunidad.",
    });
  }

  if (destino.id === detalle.stage.id) {
    return falla("CONFLICTO", `La oportunidad ya está en «${destino.name}».`);
  }

  const decision = decidirTransicion({
    gateMode: destino.gateMode,
    resultado: evaluateGate(
      destino.gateRequires as Parameters<typeof evaluateGate>[0],
      contextoDeCompuerta(detalle, umbrales),
    ),
    omitirCompuerta: input.omitirCompuerta ?? false,
  });

  if (!decision.avanza) {
    return falla("COMPUERTA", ...decision.faltantes.map((f) => ({ mensaje: f.message })));
  }

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: detalle.id },
      data: {
        stageId: destino.id,
        // RN-03 · «el contador se reinicia solo al cambiar de etapa».
        // Retroceder también es cambiar de etapa: el reloj mide cuánto lleva
        // *donde está*, no cuánto lleva avanzando.
        stageEnteredAt: new Date(),
      },
    });
    await tx.stageTransition.create({
      data: {
        opportunityId: detalle.id,
        fromStageId: detalle.stage.id,
        toStageId: destino.id,
        byUserId: session.userId,
        gateOverride: decision.gateOverride,
      },
    });
  });

  return ok();
}
```

- [ ] **Paso 4: Correr las pruebas puras**

Ejecutar: `pnpm test lib/domain/opportunity`
Esperado: PASAN, 6 pruebas.

- [ ] **Paso 5: Escribir la prueba de integración**

```ts
// tests/integracion/mutaciones.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { cambiarEtapa } from "@/lib/domain/opportunity";

export async function sesionDe(correo: string): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  const permisos = await prisma.rolePermission.findMany({
    where: { role: u.role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos.map((p) => p.permission.code)),
    limits: Object.fromEntries(
      permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null]),
    ),
  };
}

/** Devuelve la oportunidad a su etapa original y borra las transiciones nuevas. */
async function restaurar(folio: string, stageId: string, stageEnteredAt: Date) {
  const o = await prisma.opportunity.findUniqueOrThrow({ where: { folio }, select: { id: true } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: o.id } });
  await prisma.opportunity.update({ where: { id: o.id }, data: { stageId, stageEnteredAt } });
}

describe("cambiarEtapa · RN-02 contra la base", () => {
  const tocadas: { folio: string; stageId: string; stageEnteredAt: Date }[] = [];

  afterAll(async () => {
    // El seed es dato compartido: 238 pruebas afirman cifras exactas sobre él.
    for (const t of tocadas) await restaurar(t.folio, t.stageId, t.stageEnteredAt);
  });

  it("un vendedor no puede mover una oportunidad ajena, y no se le dice que existe", async () => {
    // AC-01 por la vía de la escritura: el mensaje no distingue «no existe» de
    // «no puedes», porque distinguirlas ya es información.
    const paulina = await sesionDe("pe@avattar.com");
    const ajena = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00374" }, // de Gabriel Duarte
      select: { id: true, stageId: true },
    });
    const politica = await getCommercialPolicy("MX");

    const r = await cambiarEtapa(
      paulina,
      { opportunityId: ajena.id, toStageId: ajena.stageId },
      { meddicMinToClosing: Number(politica.meddicMinToClosing) },
    );

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });
    expect(JSON.stringify(r)).not.toContain("OPP-2026-00374");
  });

  it("no acepta una etapa de otro pipeline", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const suya = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { id: true },
    });
    const ajena = await prisma.stage.findFirstOrThrow({
      where: { pipeline: { name: "Ventas Colombia" } },
      select: { id: true },
    });
    const politica = await getCommercialPolicy("MX");

    const r = await cambiarEtapa(
      jorge,
      { opportunityId: suya.id, toStageId: ajena.id },
      { meddicMinToClosing: Number(politica.meddicMinToClosing) },
    );

    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("mover a la etapa en que ya está es un conflicto, no un éxito silencioso", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const suya = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { id: true, stageId: true },
    });
    const politica = await getCommercialPolicy("MX");

    const r = await cambiarEtapa(
      jorge,
      { opportunityId: suya.id, toStageId: suya.stageId },
      { meddicMinToClosing: Number(politica.meddicMinToClosing) },
    );

    expect(r).toMatchObject({ motivo: "CONFLICTO" });
  });

  it("retroceder de etapa resella stageEnteredAt · RN-03", async () => {
    // El reloj de estancamiento mide cuánto lleva *donde está*. Una que regresa
    // de Negociación a Propuesta empieza de nuevo sus 30 días, y eso es
    // correcto.
    const jorge = await sesionDe("jm@avattar.com");
    const antes = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { id: true, stageId: true, stageEnteredAt: true, pipelineId: true, stage: { select: { position: true } } },
    });
    tocadas.push({ folio: "OPP-2026-00417", stageId: antes.stageId, stageEnteredAt: antes.stageEnteredAt });

    const anterior = await prisma.stage.findFirstOrThrow({
      where: { pipelineId: antes.pipelineId, position: { lt: antes.stage.position } },
      orderBy: { position: "desc" },
      select: { id: true },
    });
    const politica = await getCommercialPolicy("MX");

    const r = await cambiarEtapa(
      jorge,
      { opportunityId: antes.id, toStageId: anterior.id },
      { meddicMinToClosing: Number(politica.meddicMinToClosing) },
    );
    expect(r.ok).toBe(true);

    const despues = await prisma.opportunity.findUniqueOrThrow({
      where: { id: antes.id },
      select: { stageId: true, stageEnteredAt: true },
    });
    expect(despues.stageId).toBe(anterior.id);
    expect(despues.stageEnteredAt.getTime()).toBeGreaterThan(antes.stageEnteredAt.getTime());

    const transicion = await prisma.stageTransition.findFirstOrThrow({
      where: { opportunityId: antes.id },
      orderBy: { atDate: "desc" },
      select: { fromStageId: true, toStageId: true, byUserId: true, gateOverride: true },
    });
    expect(transicion).toEqual({
      fromStageId: antes.stageId,
      toStageId: anterior.id,
      byUserId: jorge.userId,
      gateOverride: false,
    });
  });
});
```

- [ ] **Paso 6: Correr la prueba de integración**

Ejecutar: `pnpm test tests/integracion/mutaciones`
Esperado: PASAN, 4 pruebas.

- [ ] **Paso 7: Correr la suite completa y verificar que el seed quedó intacto**

Ejecutar: `pnpm test`
Esperado: PASAN todas. Si el kanban o los indicadores fallan, la limpieza de `afterAll` no
funcionó: correr `pnpm db:seed` y arreglar la limpieza antes de seguir.

- [ ] **Paso 8: Commit**

```bash
git add lib/domain/opportunity.ts lib/domain/opportunity.test.ts tests/integracion/mutaciones.test.ts
git commit -m "feat(E1): cambiar de etapa evaluando compuertas (RN-02, RN-03)"
```

---

## Task 4: Registrar actividad con su siguiente paso

**Files:**
- Create: `lib/domain/activity.ts`
- Modify: `lib/scope/activities.ts` (agregar `getActivity`)
- Test: `lib/domain/activity.test.ts` (puras), `tests/integracion/mutaciones.test.ts` (agregar bloque)

**Interfaces:**
- Consumes: `ok`, `falla`, `type ResultadoAccion` de `@/lib/acciones` · `prisma` de `@/lib/db` ·
  `withActivityScope` de `@/lib/scope/activities` · `type Session` de `@/lib/auth/permissions` ·
  `sesionDe` de `tests/integracion/mutaciones.test.ts` (Task 3).
- Produces:
  ```ts
  function requiereConfirmacion(input: {
    siguiente?: { typeId: string; subject: string; startsAt: Date };
    sinSeguimiento?: boolean;
  }): boolean;

  async function registrarActividad(
    session: Session,
    input: {
      actividadId?: string;
      opportunityId?: string;
      typeId: string;
      subject: string;
      outcome?: string;
      siguiente?: { typeId: string; subject: string; startsAt: Date };
      sinSeguimiento?: boolean;
    },
  ): Promise<ResultadoAccion>;
  ```
  Y en `lib/scope/activities.ts`: `async function getActivity(session: Session, id: string)`.

- [ ] **Paso 1: Escribir las pruebas puras que fallan**

```ts
// lib/domain/activity.test.ts
import { describe, expect, it } from "vitest";
import { requiereConfirmacion } from "./activity";

const SIGUIENTE = { typeId: "t1", subject: "Llamada de seguimiento", startsAt: new Date() };

describe("requiereConfirmacion · §12.4", () => {
  it("con siguiente paso no pregunta nada", () => {
    expect(requiereConfirmacion({ siguiente: SIGUIENTE })).toBe(false);
  });

  it("sin siguiente paso y sin confirmación, pregunta", () => {
    // «Una actividad que se completa sin agendar la siguiente DEBE preguntar de
    // forma explícita si se cierra sin seguimiento.» Es un DEBE del spec.
    expect(requiereConfirmacion({})).toBe(true);
  });

  it("sin siguiente paso pero con confirmación explícita, procede", () => {
    expect(requiereConfirmacion({ sinSeguimiento: true })).toBe(false);
  });

  it("la confirmación no se pide cuando ya hay siguiente, aunque venga marcada", () => {
    // Marcar «cierro sin seguimiento» Y agendar la siguiente es contradictorio;
    // gana lo que el usuario agendó, que es el dato concreto.
    expect(requiereConfirmacion({ siguiente: SIGUIENTE, sinSeguimiento: true })).toBe(false);
  });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `pnpm test lib/domain/activity`
Esperado: FALLA con `Failed to resolve import "./activity"`.

- [ ] **Paso 3: Agregar `getActivity` a `lib/scope/activities.ts`**

Al final del archivo, después de `listActivities`:

```ts
/**
 * Una actividad, con el alcance aplicado. Devuelve `null` si no existe **o** si
 * la sesión no la alcanza: quien la llama no debe distinguir los dos casos.
 */
export async function getActivity(session: Session, id: string) {
  return prisma.activity.findFirst({
    where: withActivityScope(session, { id }),
    select: {
      id: true,
      userId: true,
      completedAt: true,
      opportunityId: true,
      organizationId: true,
      subject: true,
    },
  });
}
```

- [ ] **Paso 4: Escribir `lib/domain/activity.ts`**

```ts
// lib/domain/activity.ts
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getActivity } from "@/lib/scope/activities";

export type SiguientePaso = { typeId: string; subject: string; startsAt: Date };

/**
 * §12.4 · «Una actividad que se completa sin agendar la siguiente **DEBE**
 * preguntar de forma explícita si se cierra sin seguimiento.»
 *
 * Vive en el servidor y no en un `confirm()` del cliente porque un `confirm()`
 * se salta desde la consola del navegador. Aquí es la regla; allá sería la
 * sugerencia. Y de paso, se prueba sin navegador.
 */
export function requiereConfirmacion(input: {
  siguiente?: SiguientePaso;
  sinSeguimiento?: boolean;
}): boolean {
  if (input.siguiente) return false;
  return input.sinSeguimiento !== true;
}

/**
 * Registra una actividad completada y, en el mismo movimiento, la siguiente.
 *
 * El ciclo de §12.4 se cierra solo: si no hay siguiente paso, la oportunidad
 * queda con `nextActivityAt = null` y **aparece mañana** en la tercera lista de
 * `/actividades`, la de «sin próxima actividad».
 */
export async function registrarActividad(
  session: Session,
  input: {
    actividadId?: string;
    opportunityId?: string;
    typeId: string;
    subject: string;
    outcome?: string;
    siguiente?: SiguientePaso;
    sinSeguimiento?: boolean;
  },
): Promise<ResultadoAccion> {
  if (requiereConfirmacion(input)) {
    return falla(
      "CONFIRMACION",
      "No agendaste el siguiente paso. ¿Cierras esta actividad sin seguimiento?",
    );
  }

  // Una de las dos, no ninguna y no las dos: o se completa una existente, o se
  // registra una nueva ya completada sobre una oportunidad.
  if (!input.actividadId === !input.opportunityId) {
    return falla(
      "VALIDACION",
      "Indica la actividad que completas o la oportunidad sobre la que registras.",
    );
  }

  const ahora = new Date();
  let opportunityId: string | null = input.opportunityId ?? null;
  let organizationId: string | null = null;

  if (input.actividadId) {
    // INV-01 · el alcance autoriza. Sin distinguir «no existe» de «no puedes».
    const actividad = await getActivity(session, input.actividadId);
    if (!actividad) {
      return falla("AUTORIZACION", "No encontramos esa actividad o no tienes acceso a ella.");
    }
    if (actividad.completedAt) {
      return falla("CONFLICTO", `«${actividad.subject}» ya estaba completada.`);
    }
    opportunityId = actividad.opportunityId;
    organizationId = actividad.organizationId;
  }

  await prisma.$transaction(async (tx) => {
    if (input.actividadId) {
      await tx.activity.update({
        where: { id: input.actividadId },
        data: { completedAt: ahora, outcome: input.outcome ?? null },
      });
    } else {
      await tx.activity.create({
        data: {
          typeId: input.typeId,
          subject: input.subject,
          startsAt: ahora,
          completedAt: ahora,
          outcome: input.outcome ?? null,
          opportunityId,
          userId: session.userId,
        },
      });
    }

    if (input.siguiente) {
      await tx.activity.create({
        data: {
          typeId: input.siguiente.typeId,
          subject: input.siguiente.subject,
          startsAt: input.siguiente.startsAt,
          opportunityId,
          organizationId,
          userId: session.userId,
        },
      });
    }

    if (opportunityId) {
      await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          lastActivityAt: ahora,
          nextActivityAt: input.siguiente?.startsAt ?? null,
        },
      });
    }
  });

  return ok();
}
```

Sobre la autorización cuando se registra sobre una oportunidad **sin** actividad previa: el
`opportunityId` que llega lo valida la Server Action de la Task 10, que ya tiene el detalle
alcanzado por `lib/scope`. Aquí no se repite la consulta.

- [ ] **Paso 5: Correr las pruebas puras**

Ejecutar: `pnpm test lib/domain/activity`
Esperado: PASAN, 4 pruebas.

- [ ] **Paso 6: Agregar el bloque de integración**

Al final de `tests/integracion/mutaciones.test.ts`, con
`import { registrarActividad } from "@/lib/domain/activity";` arriba:

```ts
describe("registrarActividad · §12.4 contra la base", () => {
  const creadas: string[] = [];
  let respaldo: { id: string; lastActivityAt: Date | null; nextActivityAt: Date | null } | null =
    null;

  afterAll(async () => {
    if (creadas.length) await prisma.activity.deleteMany({ where: { id: { in: creadas } } });
    if (respaldo) {
      await prisma.opportunity.update({
        where: { id: respaldo.id },
        data: { lastActivityAt: respaldo.lastActivityAt, nextActivityAt: respaldo.nextActivityAt },
      });
    }
  });

  it("sin siguiente paso y sin confirmación no escribe nada", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const pendiente = await prisma.activity.findFirstOrThrow({
      where: { userId: paulina.userId, completedAt: null },
      select: { id: true, typeId: true, subject: true },
    });

    const r = await registrarActividad(paulina, {
      actividadId: pendiente.id,
      typeId: pendiente.typeId,
      subject: pendiente.subject,
    });

    expect(r).toMatchObject({ motivo: "CONFIRMACION" });
    // Lo que importa: NO escribió. El DEBE del spec es del servidor.
    const sigueAbierta = await prisma.activity.count({
      where: { id: pendiente.id, completedAt: null },
    });
    expect(sigueAbierta).toBe(1);
  });

  it("con siguiente paso completa una, agenda la otra y mueve el reloj de la oportunidad", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const pendiente = await prisma.activity.findFirstOrThrow({
      where: { userId: paulina.userId, completedAt: null, opportunityId: { not: null } },
      select: { id: true, typeId: true, subject: true, opportunityId: true },
    });
    const oportunidad = await prisma.opportunity.findUniqueOrThrow({
      where: { id: pendiente.opportunityId! },
      select: { id: true, lastActivityAt: true, nextActivityAt: true },
    });
    respaldo = oportunidad;
    // La actividad completada se restaura al final junto con la oportunidad.
    creadas.push();

    const cuando = new Date(Date.now() + 3 * 86_400_000);
    const r = await registrarActividad(paulina, {
      actividadId: pendiente.id,
      typeId: pendiente.typeId,
      subject: pendiente.subject,
      outcome: "El cliente pidió la propuesta por escrito.",
      siguiente: { typeId: pendiente.typeId, subject: "Enviar propuesta", startsAt: cuando },
    });
    expect(r.ok).toBe(true);

    const siguiente = await prisma.activity.findFirstOrThrow({
      where: { userId: paulina.userId, subject: "Enviar propuesta" },
      select: { id: true, startsAt: true, completedAt: true },
    });
    creadas.push(siguiente.id);
    expect(siguiente.completedAt).toBeNull();

    const despues = await prisma.opportunity.findUniqueOrThrow({
      where: { id: oportunidad.id },
      select: { lastActivityAt: true, nextActivityAt: true },
    });
    expect(despues.lastActivityAt).not.toBeNull();
    expect(despues.nextActivityAt?.toISOString()).toBe(cuando.toISOString());

    // Devolver la actividad a pendiente para no alterar el conteo de 49.
    await prisma.activity.update({
      where: { id: pendiente.id },
      data: { completedAt: null, outcome: null },
    });
  });

  it("cerrar sin seguimiento deja nextActivityAt en null · la tercera lista de §12.4", async () => {
    // Ese null es lo que hace que la oportunidad aparezca mañana en «sin
    // próxima actividad». El ciclo se cierra solo.
    const paulina = await sesionDe("pe@avattar.com");
    const pendiente = await prisma.activity.findFirstOrThrow({
      where: { userId: paulina.userId, completedAt: null, opportunityId: { not: null } },
      select: { id: true, typeId: true, subject: true, opportunityId: true },
    });

    const r = await registrarActividad(paulina, {
      actividadId: pendiente.id,
      typeId: pendiente.typeId,
      subject: pendiente.subject,
      sinSeguimiento: true,
    });
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: pendiente.opportunityId! },
      select: { nextActivityAt: true },
    });
    expect(o.nextActivityAt).toBeNull();

    await prisma.activity.update({
      where: { id: pendiente.id },
      data: { completedAt: null, outcome: null },
    });
  });
});
```

- [ ] **Paso 7: Correr integración y suite completa**

```bash
pnpm test tests/integracion/mutaciones
pnpm test
```
Esperado: PASAN. Si el conteo de 49 actividades falla en otra prueba, la limpieza no funcionó:
`pnpm db:seed` y arreglarla antes de seguir.

- [ ] **Paso 8: Commit**

```bash
git add lib/domain/activity.ts lib/domain/activity.test.ts lib/scope/activities.ts tests/integracion/mutaciones.test.ts
git commit -m "feat(E1): registrar actividad con su siguiente paso (§12.4)"
```

---

## Task 5: Cambiar propietario — AC-04, AC-33, Q-13, Q-14

**Files:**
- Modify: `lib/domain/opportunity.ts` (agregar), `lib/scope/opportunityDetail.ts` (agregar
  `countryCode` al `select`)
- Test: `tests/integracion/ac-04-propietario.test.ts`

**Interfaces:**
- Consumes: `auditedTransaction` de `@/lib/audit` · `can` de `@/lib/auth/permissions` ·
  `getOpportunityDetail` de `@/lib/scope/opportunityDetail` · `listOpportunities` de
  `@/lib/scope/opportunities` · `sesionDe` de `tests/integracion/mutaciones.test.ts`.
- Produces:
  ```ts
  async function destinatariosValidos(
    countryCode: CountryCode,
  ): Promise<{ id: string; name: string; initials: string }[]>;

  async function cambiarPropietario(
    session: Session,
    input: { opportunityId: string; nuevoPropietarioId: string },
  ): Promise<ResultadoAccion>;
  ```

- [ ] **Paso 1: Agregar `countryCode` al detalle**

En `lib/scope/opportunityDetail.ts`, dentro del `select` de `getOpportunityDetail`, junto a
`folio` y `name`:

```ts
      countryCode: true,
```

Sin esto no se puede aplicar Q-14: el país de la oportunidad no llega al servicio.

- [ ] **Paso 2: Escribir la prueba de AC-04 que falla**

```ts
// tests/integracion/ac-04-propietario.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listOpportunities } from "@/lib/scope/opportunities";
import { cambiarPropietario } from "@/lib/domain/opportunity";
import { sesionDe } from "./mutaciones.test";

/**
 * AC-04 de punta a punta: «Al cambiar el propietario, el propietario anterior
 * deja de ver la oportunidad y queda un AuditLog con before y after.»
 *
 * Se verifica con `lib/scope`, no con `prisma` directo. Consultar la tabla
 * probaría que el campo cambió; lo que el criterio exige es que **la
 * visibilidad** cambió, y eso solo se ve pasando por el alcance por rol.
 */
const FOLIO = "OPP-2026-00337"; // de Paulina Estrada

describe("AC-04 · cambio de propietario", () => {
  let original: string | null = null;

  afterAll(async () => {
    if (!original) return;
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: FOLIO },
      select: { id: true },
    });
    await prisma.opportunity.update({ where: { id: o.id }, data: { ownerId: original } });
    await prisma.auditLog.deleteMany({
      where: { entityId: o.id, action: "CAMBIAR_PROPIETARIO" },
    });
  });

  it("Paulina deja de verla, Gabriel la ve, y queda la bitácora con before y after", async () => {
    const [jorge, paulina, gabriel] = await Promise.all([
      sesionDe("jm@avattar.com"),
      sesionDe("pe@avattar.com"),
      sesionDe("gd@avattar.com"),
    ]);
    const antes = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: FOLIO },
      select: { id: true, ownerId: true },
    });
    original = antes.ownerId;

    const veAntes = await listOpportunities(paulina);
    expect(veAntes.map((o) => o.folio)).toContain(FOLIO);

    const r = await cambiarPropietario(jorge, {
      opportunityId: antes.id,
      nuevoPropietarioId: gabriel.userId,
    });
    expect(r.ok).toBe(true);

    const vePaulina = await listOpportunities(paulina);
    expect(vePaulina.map((o) => o.folio)).not.toContain(FOLIO);

    const veGabriel = await listOpportunities(gabriel);
    expect(veGabriel.map((o) => o.folio)).toContain(FOLIO);

    const bitacora = await prisma.auditLog.findMany({
      where: { entityId: antes.id, action: "CAMBIAR_PROPIETARIO" },
      select: { before: true, after: true, byUserId: true },
    });
    // AC-33 · exactamente una entrada, no cero y no dos.
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0].before).toEqual({ ownerId: antes.ownerId });
    expect(bitacora[0].after).toEqual({ ownerId: gabriel.userId });
    expect(bitacora[0].byUserId).toBe(jorge.userId);
  });

  it("Q-13 · un vendedor no puede reasignar, ni siquiera lo suyo", async () => {
    // Si pudiera, podría quitarse de encima una oportunidad que va mal —y con
    // ella su renglón de objetivos— sin que nadie lo viera.
    const [paulina, gabriel] = await Promise.all([
      sesionDe("pe@avattar.com"),
      sesionDe("gd@avattar.com"),
    ]);
    const suya = await prisma.opportunity.findFirstOrThrow({
      where: { ownerId: paulina.userId, deletedAt: null },
      select: { id: true },
    });

    const r = await cambiarPropietario(paulina, {
      opportunityId: suya.id,
      nuevoPropietarioId: gabriel.userId,
    });
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });
  });

  it("Q-14 · no se reasigna a alguien que no opera en el país", async () => {
    // Sin esta condición AC-05 se rompe por la escritura: el alcance por país
    // se aplicaría bien en cada consulta y el dato habría cruzado igual.
    const jorge = await sesionDe("jm@avattar.com");
    const mexicana = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { id: true },
    });
    const deOtroPais = await prisma.user.findFirst({
      where: { active: true, deletedAt: null, NOT: { countryCodes: { has: "MX" } } },
      select: { id: true },
    });
    // El seed es solo de MX; cuando E5 siembre CO/CL este caso tendrá sujeto.
    if (!deOtroPais) return;

    const r = await cambiarPropietario(jorge, {
      opportunityId: mexicana.id,
      nuevoPropietarioId: deOtroPais.id,
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("un destinatario inexistente se rechaza antes de tocar la base", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { id: true, ownerId: true },
    });

    const r = await cambiarPropietario(jorge, {
      opportunityId: o.id,
      nuevoPropietarioId: "no-existe",
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });

    const despues = await prisma.opportunity.findUniqueOrThrow({
      where: { id: o.id },
      select: { ownerId: true },
    });
    expect(despues.ownerId).toBe(o.ownerId);
  });
});
```

- [ ] **Paso 3: Correr y verificar que falla**

Ejecutar: `pnpm test tests/integracion/ac-04`
Esperado: FALLA con error de importación de `cambiarPropietario`.

- [ ] **Paso 4: Implementar en `lib/domain/opportunity.ts`**

Agregar estos imports arriba del archivo:

```ts
import type { CountryCode } from "@prisma/client";
import { auditedTransaction } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
```

Y al final:

```ts
/**
 * A quién se le puede reasignar una oportunidad de este país · `Q-14`.
 *
 * Solo usuarios activos que operan en él. Sin esta condición **AC-05 se rompe
 * por la puerta de atrás**: reasignarle a un vendedor de Colombia una
 * oportunidad de México le daría acceso a ella; el alcance por país se habría
 * aplicado correctamente en cada consulta y el dato habría cruzado igual. La
 * fuga no está en el filtro, está en la escritura.
 */
export async function destinatariosValidos(countryCode: CountryCode) {
  return prisma.user.findMany({
    where: { active: true, deletedAt: null, countryCodes: { has: countryCode } },
    select: { id: true, name: true, initials: true },
    orderBy: { name: "asc" },
  });
}

/**
 * `RN-31` · cambia el propietario. `AC-04` y `AC-33`.
 *
 * `auditedTransaction` entrega una función `audit` con `tx` capturado en su
 * clausura: es imposible escribir la bitácora contra otra conexión, y si esa
 * escritura falla, la transacción revierte también el cambio (INV-09).
 */
export async function cambiarPropietario(
  session: Session,
  input: { opportunityId: string; nuevoPropietarioId: string },
): Promise<ResultadoAccion> {
  // Q-13 · no existe permiso de «cambiar propietario» en la matriz de once. Se
  // deriva del alcance de oficina, lo que deja fuera al vendedor: si no, podría
  // quitarse de encima una oportunidad que va mal, junto con su renglón de
  // objetivos. Pendiente de confirmar con el Director.
  if (!can(session, "VER_OPORTUNIDADES_OFICINA")) {
    return falla(
      "AUTORIZACION",
      "Solo Gerencia, Dirección o Administración reasignan oportunidades.",
    );
  }

  const detalle = await getOpportunityDetail(session, input.opportunityId);
  if (!detalle) {
    return falla("AUTORIZACION", "No encontramos esa oportunidad o no tienes acceso a ella.");
  }

  if (detalle.owner.id === input.nuevoPropietarioId) {
    return falla("CONFLICTO", `«${detalle.owner.name}» ya es el propietario.`);
  }

  const validos = await destinatariosValidos(detalle.countryCode);
  const nuevo = validos.find((u) => u.id === input.nuevoPropietarioId);
  if (!nuevo) {
    return falla("VALIDACION", {
      campo: "nuevoPropietarioId",
      mensaje: `Ese usuario no está activo o no opera en ${detalle.countryCode}.`,
    });
  }

  await auditedTransaction(async (tx, audit) => {
    await tx.opportunity.update({
      where: { id: detalle.id },
      data: { ownerId: nuevo.id },
    });
    await audit({
      entity: "Opportunity",
      entityId: detalle.id,
      action: "CAMBIAR_PROPIETARIO",
      byUserId: session.userId,
      before: { ownerId: detalle.owner.id },
      after: { ownerId: nuevo.id },
    });
  });

  return ok();
}
```

- [ ] **Paso 5: Correr AC-04**

Ejecutar: `pnpm test tests/integracion/ac-04`
Esperado: PASAN, 4 pruebas.

- [ ] **Paso 6: Correr la suite completa**

Ejecutar: `pnpm test`
Esperado: PASAN. Verificar que el kanban sigue viendo 14 oportunidades y que los indicadores de
Paulina volvieron a su cifra.

- [ ] **Paso 7: Commit**

```bash
git add lib/domain/opportunity.ts lib/scope/opportunityDetail.ts tests/integracion/ac-04-propietario.test.ts
git commit -m "feat(E1): cambio de propietario con bitácora en la misma transacción (AC-04, AC-33, RN-31)"
```

---

## Task 6: Editar catálogos — la segunda acción auditable de AC-33

**Files:**
- Create: `lib/domain/catalog.ts`
- Test: `tests/integracion/mutaciones.test.ts` (agregar bloque)

**Interfaces:**
- Consumes: `auditedTransaction` de `@/lib/audit` · `can` de `@/lib/auth/permissions` ·
  `ok`, `falla` de `@/lib/acciones`.
- Produces:
  ```ts
  type Catalogo = "ACTIVIDAD" | "DOCUMENTO" | "MOTIVO_PERDIDA" | "ROL_COMITE";

  async function editarCatalogo(
    session: Session,
    input: {
      catalogo: Catalogo;
      id: string;
      name?: string;
      active?: boolean;
      isContract?: boolean;
      requiresCompetitor?: boolean;
    },
  ): Promise<ResultadoAccion>;
  ```

- [ ] **Paso 1: Escribir la prueba de integración que falla**

Agregar al final de `tests/integracion/mutaciones.test.ts`, con
`import { editarCatalogo } from "@/lib/domain/catalog";` arriba:

```ts
describe("editarCatalogo · AC-33 y MD-05", () => {
  let restaurar: (() => Promise<void>) | null = null;

  afterAll(async () => {
    if (restaurar) await restaurar();
  });

  it("solo el administrador edita catálogos", async () => {
    for (const correo of ["pe@avattar.com", "jm@avattar.com", "dc@avattar.com"]) {
      const s = await sesionDe(correo);
      const t = await prisma.activityType.findFirstOrThrow({ select: { id: true } });
      const r = await editarCatalogo(s, { catalogo: "ACTIVIDAD", id: t.id, active: false });
      expect(r, correo).toMatchObject({ motivo: "AUTORIZACION" });
    }
  });

  it("desactivar deja exactamente un AuditLog con solo lo que cambió", async () => {
    const admin = await sesionDe("as@avattar.com");
    const tipo = await prisma.activityType.findFirstOrThrow({
      where: { active: true },
      select: { id: true, name: true, active: true },
    });
    restaurar = async () => {
      await prisma.activityType.update({ where: { id: tipo.id }, data: { active: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: tipo.id, action: "EDITAR_CATALOGO" } });
    };

    const r = await editarCatalogo(admin, { catalogo: "ACTIVIDAD", id: tipo.id, active: false });
    expect(r.ok).toBe(true);

    const bitacora = await prisma.auditLog.findMany({
      where: { entityId: tipo.id, action: "EDITAR_CATALOGO" },
      select: { entity: true, before: true, after: true },
    });
    expect(bitacora).toHaveLength(1);
    // Solo los campos que cambiaron, no la fila entera.
    expect(bitacora[0].before).toEqual({ active: true });
    expect(bitacora[0].after).toEqual({ active: false });
    expect(bitacora[0].entity).toBe("ActivityType");

    const despues = await prisma.activityType.findUniqueOrThrow({
      where: { id: tipo.id },
      select: { active: true },
    });
    expect(despues.active).toBe(false);
  });

  it("una edición sin cambios no ensucia la bitácora", async () => {
    // Guardar sin tocar nada es común en un formulario. No debe dejar rastro:
    // la bitácora se consulta para saber qué cambió, y las entradas vacías la
    // vuelven ilegible justo cuando alguien la necesita.
    const admin = await sesionDe("as@avattar.com");
    const rol = await prisma.committeeRole.findFirstOrThrow({
      select: { id: true, name: true, active: true },
    });

    const r = await editarCatalogo(admin, {
      catalogo: "ROL_COMITE",
      id: rol.id,
      name: rol.name,
      active: rol.active,
    });
    expect(r.ok).toBe(true);
    expect(
      await prisma.auditLog.count({ where: { entityId: rol.id, action: "EDITAR_CATALOGO" } }),
    ).toBe(0);
  });

  it("no acepta una bandera que ese catálogo no tiene", async () => {
    // `requiresCompetitor` es de LossReason. Aceptarlo sobre un tipo de
    // actividad y descartarlo en silencio haría creer al administrador que
    // guardó algo que nunca existió.
    const admin = await sesionDe("as@avattar.com");
    const tipo = await prisma.activityType.findFirstOrThrow({ select: { id: true } });

    const r = await editarCatalogo(admin, {
      catalogo: "ACTIVIDAD",
      id: tipo.id,
      requiresCompetitor: true,
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `pnpm test tests/integracion/mutaciones`
Esperado: FALLA con error de importación de `editarCatalogo`.

- [ ] **Paso 3: Escribir `lib/domain/catalog.ts`**

```ts
// lib/domain/catalog.ts
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

export type Catalogo = "ACTIVIDAD" | "DOCUMENTO" | "MOTIVO_PERDIDA" | "ROL_COMITE";

/**
 * Qué modelo es cada catálogo y qué banderas de comportamiento acepta.
 *
 * Las banderas no son cosméticas: `DocumentType.isContract` satisface la
 * compuerta `CONTRATO_O_OC_CARGADO`, y `LossReason.requiresCompetitor` obliga a
 * nombrar al competidor al perder (RN-16). Cambiar una cambia el comportamiento
 * del sistema, y por eso queda en bitácora.
 */
const CATALOGOS = {
  ACTIVIDAD: { entidad: "ActivityType", banderas: [] as const },
  DOCUMENTO: { entidad: "DocumentType", banderas: ["isContract"] as const },
  MOTIVO_PERDIDA: { entidad: "LossReason", banderas: ["requiresCompetitor"] as const },
  ROL_COMITE: { entidad: "CommitteeRole", banderas: [] as const },
} satisfies Record<Catalogo, { entidad: string; banderas: readonly string[] }>;

type CamposEditables = {
  name?: string;
  active?: boolean;
  isContract?: boolean;
  requiresCompetitor?: boolean;
};

/** El delegado de Prisma de cada catálogo, resuelto sin `switch` por nombre. */
function delegado(catalogo: Catalogo) {
  switch (catalogo) {
    case "ACTIVIDAD":
      return prisma.activityType;
    case "DOCUMENTO":
      return prisma.documentType;
    case "MOTIVO_PERDIDA":
      return prisma.lossReason;
    case "ROL_COMITE":
      return prisma.committeeRole;
  }
}

/**
 * `MD-05` · edita un valor de catálogo. **Nada se elimina, se desactiva**
 * (INV-15). Por eso esta acción no expone borrado: P-11 muestra cuántas veces
 * se usó cada valor, que es lo que permite desactivar con conocimiento en vez
 * de a ciegas.
 */
export async function editarCatalogo(
  session: Session,
  input: { catalogo: Catalogo; id: string } & CamposEditables,
): Promise<ResultadoAccion> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", "Solo Administración edita los catálogos.");
  }

  const meta = CATALOGOS[input.catalogo];
  const banderas = meta.banderas as readonly string[];

  for (const bandera of ["isContract", "requiresCompetitor"] as const) {
    if (input[bandera] !== undefined && !banderas.includes(bandera)) {
      return falla("VALIDACION", {
        campo: bandera,
        mensaje: `«${meta.entidad}» no tiene esa propiedad.`,
      });
    }
  }

  // `as never` no: el delegado se estrecha por catálogo y los cuatro comparten
  // `id`, `name` y `active`. Las banderas ya quedaron validadas arriba.
  const actual = (await delegado(input.catalogo).findUnique({
    where: { id: input.id },
  })) as (Record<string, unknown> & { id: string }) | null;

  if (!actual) return falla("VALIDACION", "Ese valor de catálogo no existe.");

  // Solo lo que de verdad cambió. Una edición sin cambios no debe dejar rastro:
  // la bitácora se consulta para saber qué cambió, y las entradas vacías la
  // vuelven ilegible justo cuando alguien la necesita.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const campo of ["name", "active", ...banderas] as const) {
    const propuesto = (input as Record<string, unknown>)[campo];
    if (propuesto === undefined || propuesto === actual[campo]) continue;
    before[campo] = actual[campo];
    after[campo] = propuesto;
  }

  if (Object.keys(after).length === 0) return ok();

  await auditedTransaction(async (tx, audit) => {
    const delegadoTx = {
      ACTIVIDAD: tx.activityType,
      DOCUMENTO: tx.documentType,
      MOTIVO_PERDIDA: tx.lossReason,
      ROL_COMITE: tx.committeeRole,
    }[input.catalogo];

    await delegadoTx.update({ where: { id: input.id }, data: after });
    await audit({
      entity: meta.entidad,
      entityId: input.id,
      action: "EDITAR_CATALOGO",
      byUserId: session.userId,
      before,
      after,
    });
  });

  return ok();
}
```

- [ ] **Paso 4: Correr integración y la suite**

```bash
pnpm test tests/integracion/mutaciones
pnpm test
```
Esperado: PASAN. La prueba de P-11 que cuenta 13 tipos de actividad debe seguir en 13: la
desactivación se revierte en `afterAll`.

- [ ] **Paso 5: Commit**

```bash
git add lib/domain/catalog.ts tests/integracion/mutaciones.test.ts
git commit -m "feat(E1): edición de catálogos con bitácora (AC-33, MD-05, INV-15)"
```

---

## Task 7: Alta de oportunidad — INV-12 y el folio

**Files:**
- Modify: `lib/domain/opportunity.ts` (agregar), `lib/domain/opportunity.test.ts` (agregar)
- Test: `tests/integracion/mutaciones.test.ts` (agregar bloque)

**Interfaces:**
- Consumes: `nextFolio` de `@/lib/domain/folio` · `prisma` de `@/lib/db`.
- Produces:
  ```ts
  function etapaInicial<T extends { id: string; position: number }>(stages: readonly T[]): T;

  async function crearOportunidad(
    session: Session,
    input: {
      name: string;
      organizationId: string;
      primaryPersonId?: string;
      pipelineId: string;
      estimatedAmount: string;
      expectedCloseDate: Date;
      businessType: BusinessType;
      sourceId?: string;
      ownerId?: string;
    },
  ): Promise<ResultadoAccion<{ id: string; folio: string }>>;
  ```

- [ ] **Paso 1: Agregar la prueba pura de `etapaInicial`**

En `lib/domain/opportunity.test.ts`, con `import { etapaInicial } from "./opportunity";`:

```ts
describe("etapaInicial · INV-13", () => {
  it("es la de posición menor, no la primera del arreglo ni una por nombre", () => {
    // Un `switch` por nombre de etapa es un defecto: las etapas son datos y
    // cada pipeline tiene las suyas.
    const stages = [
      { id: "c", position: 3 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ];
    expect(etapaInicial(stages).id).toBe("a");
  });

  it("un pipeline sin etapas es un error de configuración, no un caso a tolerar", () => {
    expect(() => etapaInicial([])).toThrow(/sin etapas/i);
  });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `pnpm test lib/domain/opportunity`
Esperado: FALLA con `etapaInicial is not exported`.

- [ ] **Paso 3: Implementar en `lib/domain/opportunity.ts`**

Agregar `import type { BusinessType } from "@prisma/client";` y
`import { nextFolio } from "./folio";` arriba, y al final:

```ts
/**
 * La etapa de entrada de un pipeline: la de `position` menor.
 *
 * INV-13 · no se busca por nombre. «Calificación» es el nombre en México y no
 * tiene por qué serlo en el pipeline de renovaciones.
 */
export function etapaInicial<T extends { id: string; position: number }>(
  stages: readonly T[],
): T {
  const primera = [...stages].sort((a, b) => a.position - b.position)[0];
  if (!primera) throw new Error("El pipeline está sin etapas: revisa la configuración.");
  return primera;
}

/**
 * Da de alta una oportunidad. `INV-12` y `RN-20`.
 *
 * El folio se reserva con `nextFolio`, que hace un `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING` atómico dentro de la misma transacción. **Nunca
 * `count() + 1`**: ese era el defecto del esquema archivado, que además no
 * reiniciaba en enero.
 */
export async function crearOportunidad(
  session: Session,
  input: {
    name: string;
    organizationId: string;
    primaryPersonId?: string;
    pipelineId: string;
    estimatedAmount: string;
    expectedCloseDate: Date;
    businessType: BusinessType;
    sourceId?: string;
    ownerId?: string;
  },
): Promise<ResultadoAccion<{ id: string; folio: string }>> {
  const organizacion = await prisma.organization.findFirst({
    where: { id: input.organizationId, deletedAt: null },
    select: { id: true, countryCode: true, name: true },
  });
  if (!organizacion) return falla("VALIDACION", { campo: "organizationId", mensaje: "Esa organización no existe." });

  // El país sale de la organización, no del formulario: que un vendedor pudiera
  // elegirlo sería darle una llave a otro país por la puerta de atrás (AC-05).
  if (!session.countryCodes.includes(organizacion.countryCode)) {
    return falla("AUTORIZACION", `No operas en ${organizacion.countryCode}.`);
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: { id: input.pipelineId, active: true },
    select: {
      id: true,
      countryCode: true,
      stages: { select: { id: true, position: true } },
    },
  });
  if (!pipeline) return falla("VALIDACION", { campo: "pipelineId", mensaje: "Ese pipeline no existe." });

  // Una organización mexicana con el pipeline de Colombia produciría una
  // oportunidad que ninguna pantalla filtra bien y cuyas etapas no son las que
  // su gerente administra.
  if (pipeline.countryCode !== organizacion.countryCode) {
    return falla("VALIDACION", {
      campo: "pipelineId",
      mensaje: `«${organizacion.name}» es de ${organizacion.countryCode} y ese pipeline es de ${pipeline.countryCode}.`,
    });
  }

  // Q-13 aplicado al alta: si un vendedor pudiera dar de alta a nombre de otro,
  // tendría reasignación disfrazada de creación.
  const ownerId =
    input.ownerId && can(session, "VER_OPORTUNIDADES_OFICINA") ? input.ownerId : session.userId;

  if (ownerId !== session.userId) {
    const validos = await destinatariosValidos(organizacion.countryCode);
    if (!validos.some((u) => u.id === ownerId)) {
      return falla("VALIDACION", {
        campo: "ownerId",
        mensaje: `Ese usuario no está activo o no opera en ${organizacion.countryCode}.`,
      });
    }
  }

  const inicial = etapaInicial(pipeline.stages);
  const ahora = new Date();

  const creada = await prisma.$transaction(async (tx) => {
    const folio = await nextFolio(tx, ahora.getFullYear());
    return tx.opportunity.create({
      data: {
        folio,
        name: input.name,
        organizationId: organizacion.id,
        primaryPersonId: input.primaryPersonId ?? null,
        pipelineId: pipeline.id,
        stageId: inicial.id,
        countryCode: organizacion.countryCode,
        estimatedAmount: input.estimatedAmount,
        // Mientras no hay cotización, el estimado ES el valor vigente.
        amount: input.estimatedAmount,
        // `grossMargin` queda en null a propósito: no hay costo del cual
        // derivarlo, e inventar un margen sería peor que no tenerlo, porque las
        // banderas de riesgo lo leen.
        expectedCloseDate: input.expectedCloseDate,
        businessType: input.businessType,
        sourceId: input.sourceId ?? null,
        ownerId,
        createdById: session.userId,
        // RN-03 · el reloj de estancamiento empieza a correr desde el alta.
        stageEnteredAt: ahora,
      },
      select: { id: true, folio: true },
    });
  });

  return ok(creada);
}
```

- [ ] **Paso 4: Correr las puras**

Ejecutar: `pnpm test lib/domain/opportunity`
Esperado: PASAN, 8 pruebas.

- [ ] **Paso 5: Agregar el bloque de integración**

Al final de `tests/integracion/mutaciones.test.ts`, con
`import { crearOportunidad } from "@/lib/domain/opportunity";` arriba:

```ts
describe("crearOportunidad · INV-12 contra la base", () => {
  const creadas: string[] = [];

  afterAll(async () => {
    if (creadas.length) await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
  });

  async function insumos() {
    const [organizacion, pipeline] = await Promise.all([
      prisma.organization.findFirstOrThrow({
        where: { name: "Aceros del Norte" },
        select: { id: true },
      }),
      prisma.pipeline.findFirstOrThrow({
        where: { name: "Ventas México" },
        select: { id: true, stages: { select: { id: true, position: true } } },
      }),
    ]);
    return { organizacion, pipeline };
  }

  it("asigna folio con el formato de INV-12 y arranca en la etapa de posición menor", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();

    const r = await crearOportunidad(jorge, {
      name: "Prueba de alta",
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "125000.0000",
      expectedCloseDate: new Date("2026-12-01"),
      businessType: "NUEVO",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    creadas.push(r.datos.id);
    expect(r.datos.folio).toMatch(/^OPP-\d{4}-\d{5}$/);

    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: {
        stageId: true,
        amount: true,
        estimatedAmount: true,
        grossMargin: true,
        countryCode: true,
        ownerId: true,
        createdById: true,
        stageEnteredAt: true,
      },
    });

    const primera = [...pipeline.stages].sort((a, b) => a.position - b.position)[0];
    expect(creada.stageId).toBe(primera.id);
    // Sin cotización, el estimado ES el valor vigente.
    expect(creada.amount.toString()).toBe(creada.estimatedAmount.toString());
    // Inventar un margen sería peor que no tenerlo: las banderas lo leen.
    expect(creada.grossMargin).toBeNull();
    // El país sale de la organización, no del formulario (AC-05).
    expect(creada.countryCode).toBe("MX");
    expect(creada.ownerId).toBe(jorge.userId);
    expect(creada.stageEnteredAt).not.toBeNull();
  });

  it("dos altas seguidas no repiten folio · RN-20", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();
    const base = {
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "1000.0000",
      expectedCloseDate: new Date("2026-12-01"),
      businessType: "NUEVO" as const,
    };

    const [a, b] = await Promise.all([
      crearOportunidad(jorge, { ...base, name: "Concurrente A" }),
      crearOportunidad(jorge, { ...base, name: "Concurrente B" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    creadas.push(a.datos.id, b.datos.id);
    expect(a.datos.folio).not.toBe(b.datos.folio);
  });

  it("un vendedor no puede dar de alta a nombre de otro · Q-13", async () => {
    // Si pudiera, tendría reasignación disfrazada de creación.
    const [paulina, gabriel] = await Promise.all([
      sesionDe("pe@avattar.com"),
      sesionDe("gd@avattar.com"),
    ]);
    const { organizacion, pipeline } = await insumos();

    const r = await crearOportunidad(paulina, {
      name: "Alta a nombre de otro",
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "1000.0000",
      expectedCloseDate: new Date("2026-12-01"),
      businessType: "NUEVO",
      ownerId: gabriel.userId,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    creadas.push(r.datos.id);
    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { ownerId: true },
    });
    // El campo se ignora en silencio y la oportunidad es suya: pedirla a nombre
    // de otro no es un error del usuario, es una petición que no aplica.
    expect(creada.ownerId).toBe(paulina.userId);
  });

  it("rechaza un pipeline de otro país que el de la organización", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion } = await insumos();
    const colombiano = await prisma.pipeline.findFirstOrThrow({
      where: { name: "Ventas Colombia" },
      select: { id: true },
    });

    const r = await crearOportunidad(jorge, {
      name: "Pipeline cruzado",
      organizationId: organizacion.id,
      pipelineId: colombiano.id,
      estimatedAmount: "1000.0000",
      expectedCloseDate: new Date("2026-12-01"),
      businessType: "NUEVO",
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});
```

- [ ] **Paso 6: Correr integración y suite completa**

```bash
pnpm test tests/integracion/mutaciones
pnpm test
```
Esperado: PASAN. **Importante:** el conteo de 14 oportunidades y el valor abierto 12 621 000 deben
volver a su cifra — si no, la limpieza de `afterAll` no borró todo.

- [ ] **Paso 7: Commit**

```bash
git add lib/domain/opportunity.ts lib/domain/opportunity.test.ts tests/integracion/mutaciones.test.ts
git commit -m "feat(E1): alta de oportunidad con folio consecutivo por año (INV-12, RN-20)"
```

---

## Task 8: Primitivas de formulario

Hasta ahora `components/ui/primitivas.tsx` solo tiene primitivas de **lectura** —`StatTile`,
`Pastilla`, `Avatar`, `BarraProgreso`—. Ninguna mutación se puede montar sin controles de entrada.
Se construye lo que las cinco acciones necesitan y nada más (YAGNI): el catálogo completo de §13.4
llega con sus pantallas.

**Files:**
- Create: `components/ui/formulario.tsx`
- Test: la verificación es visual y por `pnpm react-doctor`; el comportamiento se prueba en las
  tareas que las usan.

**Interfaces:**
- Consumes: `type Problema`, `type ResultadoAccion` de `@/lib/acciones` · `clsx`.
- Produces: `Campo`, `Entrada`, `AreaDeTexto`, `Seleccion`, `Casilla`, `Panel`, `AvisosDeAccion`,
  y el ayudante `problemaDe(resultado, campo): string | undefined`.

- [ ] **Paso 1: Agregar `name` y `value` a `Boton`**

`components/ui/primitivas.tsx` define `Boton` sin `name` ni `value`. Dos formularios de este plan
los necesitan —«Avanzar de todos modos» y «Cerrar sin seguimiento» son botones de envío que
**llevan su propio dato**, y por eso el servidor distingue el envío normal del confirmado.

En la firma del componente, agregar `name?: string;` y `value?: string;`, y pasarlos al `<button>`:

```tsx
    <button type={type} name={name} value={value} onClick={onClick} disabled={disabled} className={estilo}>
```

Sin esto, ambos formularios compilan pero envían un `FormData` sin la confirmación, y la acción
vuelve a pedirla en un ciclo del que el usuario no puede salir.

- [ ] **Paso 2: Escribir `components/ui/formulario.tsx`**

Reglas del sistema de diseño que aplican (§13): foco visible con `--ring`, radio `--radius-sm`,
borde `--border`, texto `--text-body`, error en coral `--status-danger`. Todo el texto visible en
español (INV-14).

```tsx
"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import type { Problema, ResultadoAccion } from "@/lib/acciones";

/** El problema que corresponde a un campo, si el resultado trae uno. */
export function problemaDe(
  resultado: ResultadoAccion<unknown> | null,
  campo: string,
): string | undefined {
  if (!resultado || resultado.ok) return undefined;
  return resultado.problemas.find((p) => p.campo === campo)?.mensaje;
}

/** Etiqueta, control y su problema. El problema va debajo, no en un tooltip. */
export function Campo({
  etiqueta,
  htmlFor,
  problema,
  ayuda,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  problema?: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-[var(--text-heading)]">
        {etiqueta}
      </label>
      {children}
      {ayuda && !problema && <p className="text-xs text-[var(--text-muted)]">{ayuda}</p>}
      {problema && (
        <p role="alert" className="text-xs font-medium text-[var(--status-danger)]">
          {problema}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-[var(--radius-sm)] border bg-white px-3 py-2 text-sm text-[var(--text-body)] " +
  "outline-none transition focus:border-[var(--accent)] focus:shadow-[var(--ring)] " +
  "disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)]";

function borde(malo?: string) {
  return malo ? "border-[var(--status-danger)]" : "border-[var(--border)]";
}

export function Entrada({
  problema,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { problema?: string }) {
  return <input {...props} className={clsx(CONTROL, borde(problema), className)} />;
}

export function AreaDeTexto({
  problema,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { problema?: string }) {
  return <textarea {...props} rows={3} className={clsx(CONTROL, borde(problema), className)} />;
}

export function Seleccion({
  problema,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { problema?: string }) {
  return (
    <select {...props} className={clsx(CONTROL, borde(problema), className)}>
      {children}
    </select>
  );
}

export function Casilla({
  etiqueta,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]">
      <input
        type="checkbox"
        {...props}
        className="size-4 rounded-[var(--radius-xs)] border-[var(--border-strong)] text-[var(--accent)] focus:shadow-[var(--ring)]"
      />
      {etiqueta}
    </label>
  );
}

/**
 * Panel modal. Se cierra con Escape y al pulsar el fondo, y devuelve el foco a
 * lo que lo abrió — un formulario que atrapa el foco es un formulario que un
 * teclado no puede abandonar.
 */
export function Panel({
  titulo,
  descripcion,
  abierto,
  alCerrar,
  children,
}: {
  titulo: string;
  descripcion?: string;
  abierto: boolean;
  alCerrar: () => void;
  children: ReactNode;
}) {
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(14,23,38,.45)] p-4"
      onClick={alCerrar}
      onKeyDown={(e) => e.key === "Escape" && alCerrar()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-md)]"
      >
        <h2 className="font-[var(--font-display)] text-lg font-semibold text-[var(--text-heading)]">
          {titulo}
        </h2>
        {descripcion && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{descripcion}</p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Los problemas que no pertenecen a ningún campo: compuertas, autorización,
 * conflictos. Van **dentro** del formulario y no en un modal aparte, porque
 * §13.5 pide que las alertas se vean mientras se teclea.
 */
export function AvisosDeAccion({ resultado }: { resultado: ResultadoAccion<unknown> | null }) {
  if (!resultado || resultado.ok) return null;
  const generales: Problema[] = resultado.problemas.filter((p) => !p.campo);
  if (generales.length === 0) return null;

  const tono =
    resultado.motivo === "CONFIRMACION"
      ? "border-[var(--status-warning)] bg-[#fbfde6]"
      : "border-[var(--status-danger)] bg-[#fff1f1]";

  return (
    <div role="alert" className={clsx("rounded-[var(--radius-sm)] border px-3 py-2.5", tono)}>
      <ul className="flex flex-col gap-1 text-sm text-[var(--text-body)]">
        {generales.map((p, i) => (
          <li key={i}>{p.mensaje}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Paso 3: Verificar tipos y frontera**

```bash
pnpm typecheck && pnpm lint && pnpm test tests/arquitectura
```
Esperado: PASAN. El archivo está en `components/`, así que **no puede** importar `lib/db` ni
`@prisma/client`; solo importa de `lib/acciones`, que no toca la base.

- [ ] **Paso 4: Commit**

```bash
git add components/ui/formulario.tsx components/ui/primitivas.tsx
git commit -m "feat(E1): primitivas de formulario del sistema de diseño (§13.4)"
```

---

## Task 9: P-02 — cambiar etapa y propietario en pantalla

**Files:**
- Create: `app/(app)/oportunidades/[id]/acciones.ts`,
  `components/oportunidad/CambiarEtapa.tsx`, `components/oportunidad/CambiarPropietario.tsx`
- Modify: `app/(app)/oportunidades/[id]/page.tsx` (montar los dos controles)

**Interfaces:**
- Consumes: `cambiarEtapa`, `cambiarPropietario`, `destinatariosValidos` de
  `@/lib/domain/opportunity` · `requireSession` de `@/lib/auth/session` ·
  `getCommercialPolicy` de `@/lib/policy` · las primitivas de la Task 8.
- Produces:
  ```ts
  // app/(app)/oportunidades/[id]/acciones.ts
  async function cambiarEtapaAccion(
    _previo: ResultadoAccion | null,
    form: FormData,
  ): Promise<ResultadoAccion>;
  async function cambiarPropietarioAccion(
    _previo: ResultadoAccion | null,
    form: FormData,
  ): Promise<ResultadoAccion>;
  ```

- [ ] **Paso 1: Escribir las Server Actions**

```ts
// app/(app)/oportunidades/[id]/acciones.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { cambiarEtapa, cambiarPropietario } from "@/lib/domain/opportunity";
import { getCommercialPolicy } from "@/lib/policy";

/**
 * La acción hace cuatro cosas y ninguna más: parsea, obtiene la sesión, lee los
 * umbrales y delega. Toda decisión de negocio vive en `lib/domain`.
 *
 * Los umbrales se leen **aquí** y no en el dominio: la prueba de AC-31 verifica
 * que ningún archivo de `lib/domain` importe `lib/policy`, para que sus
 * funciones sigan siendo probables sin base.
 */
const esquemaEtapa = z.object({
  opportunityId: z.string().min(1),
  toStageId: z.string().min(1, "Elige la etapa a la que quieres mover la oportunidad."),
  omitirCompuerta: z.coerce.boolean().optional(),
  countryCode: z.enum(["MX", "CO", "CL"]),
});

export async function cambiarEtapaAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquemaEtapa.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const politica = await getCommercialPolicy(datos.data.countryCode);

  const resultado = await cambiarEtapa(
    session,
    {
      opportunityId: datos.data.opportunityId,
      toStageId: datos.data.toStageId,
      omitirCompuerta: datos.data.omitirCompuerta,
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );

  if (resultado.ok) {
    revalidatePath(`/oportunidades/${datos.data.opportunityId}`);
    revalidatePath("/oportunidades");
  }
  return resultado;
}

const esquemaPropietario = z.object({
  opportunityId: z.string().min(1),
  nuevoPropietarioId: z.string().min(1, "Elige a quién le pasas la oportunidad."),
});

export async function cambiarPropietarioAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquemaPropietario.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const resultado = await cambiarPropietario(session, datos.data);

  if (resultado.ok) {
    revalidatePath(`/oportunidades/${datos.data.opportunityId}`);
    revalidatePath("/oportunidades");
  }
  return resultado;
}
```

- [ ] **Paso 2: Escribir el control de etapa**

```tsx
// components/oportunidad/CambiarEtapa.tsx
"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Panel, Seleccion } from "@/components/ui/formulario";

type Etapa = { id: string; name: string; position: number; gateMode: string };

export function CambiarEtapa({
  opportunityId,
  countryCode,
  etapaActual,
  etapas,
  accion,
}: {
  opportunityId: string;
  countryCode: string;
  etapaActual: string;
  etapas: Etapa[];
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [etapaElegida, setEtapaElegida] = useState("");
  const [resultado, enviar, enviando] = useActionState(accion, null);

  // Solo la compuerta en ADVERTENCIA se puede omitir. Un BLOQUEANTE no ofrece
  // el botón siquiera: ofrecer algo que el servidor va a rechazar es mentirle
  // al usuario. Por eso la etapa elegida vive en estado — hay que recordar
  // cuál se intentó para saber de qué modo era su compuerta.
  const destino = etapas.find((e) => e.id === etapaElegida);
  const puedeOmitir =
    resultado != null &&
    !resultado.ok &&
    resultado.motivo === "COMPUERTA" &&
    destino?.gateMode === "ADVERTENCIA";

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Cambiar etapa
      </Boton>
      <Panel
        titulo="Cambiar de etapa"
        descripcion="Si la etapa destino tiene requisitos, te decimos cuáles faltan antes de mover nada."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      >
        <form action={enviar} className="flex flex-col gap-4">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <input type="hidden" name="countryCode" value={countryCode} />

          <Campo etiqueta="Etapa" htmlFor="toStageId">
            <Seleccion
              id="toStageId"
              name="toStageId"
              value={etapaElegida}
              onChange={(e) => setEtapaElegida(e.target.value)}
            >
              <option value="" disabled>
                Elige una etapa
              </option>
              {etapas
                .filter((e) => e.id !== etapaActual)
                .sort((a, b) => a.position - b.position)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Seleccion>
          </Campo>

          <AvisosDeAccion resultado={resultado} />

          <div className="flex items-center justify-end gap-2">
            <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            {puedeOmitir && (
              <Boton variante="secundario" type="submit" name="omitirCompuerta" value="true">
                Avanzar de todos modos
              </Boton>
            )}
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Moviendo…" : "Mover"}
            </Boton>
          </div>
        </form>
      </Panel>
    </>
  );
}
```

- [ ] **Paso 3: Escribir el control de propietario**

```tsx
// components/oportunidad/CambiarPropietario.tsx
"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Panel, Seleccion, problemaDe } from "@/components/ui/formulario";

export function CambiarPropietario({
  opportunityId,
  propietarioActual,
  candidatos,
  accion,
}: {
  opportunityId: string;
  propietarioActual: string;
  candidatos: { id: string; name: string }[];
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, enviar, enviando] = useActionState(accion, null);

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Cambiar propietario
      </Boton>
      <Panel
        titulo="Cambiar propietario"
        descripcion="El propietario anterior deja de ver la oportunidad. El cambio queda en la bitácora."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      >
        <form action={enviar} className="flex flex-col gap-4">
          <input type="hidden" name="opportunityId" value={opportunityId} />

          <Campo
            etiqueta="Nuevo propietario"
            htmlFor="nuevoPropietarioId"
            problema={problemaDe(resultado, "nuevoPropietarioId")}
            ayuda="Solo aparecen quienes operan en el país de la oportunidad."
          >
            <Seleccion
              id="nuevoPropietarioId"
              name="nuevoPropietarioId"
              defaultValue=""
              problema={problemaDe(resultado, "nuevoPropietarioId")}
            >
              <option value="" disabled>
                Elige a quién
              </option>
              {candidatos
                .filter((u) => u.id !== propietarioActual)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Seleccion>
          </Campo>

          <AvisosDeAccion resultado={resultado} />

          <div className="flex items-center justify-end gap-2">
            <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Cambiando…" : "Cambiar"}
            </Boton>
          </div>
        </form>
      </Panel>
    </>
  );
}
```

- [ ] **Paso 4: Montarlos en P-02**

En `app/(app)/oportunidades/[id]/page.tsx`:

1. Importar `can` de `@/lib/auth/permissions`, `destinatariosValidos` de
   `@/lib/domain/opportunity`, los dos componentes y las dos acciones.
2. Después de cargar `detalle`, obtener los candidatos **solo si la sesión puede reasignar**, para
   no consultar usuarios de más:
   ```ts
   const puedeReasignar = can(session, "VER_OPORTUNIDADES_OFICINA");
   const candidatos = puedeReasignar ? await destinatariosValidos(detalle.countryCode) : [];
   ```
3. En la fila de «Acciones de cabecera» que §12.2 describe, montar:
   ```tsx
   <CambiarEtapa
     opportunityId={detalle.id}
     countryCode={detalle.countryCode}
     etapaActual={detalle.stage.id}
     etapas={detalle.pipeline.stages}
     accion={cambiarEtapaAccion}
   />
   {puedeReasignar && (
     <CambiarPropietario
       opportunityId={detalle.id}
       propietarioActual={detalle.owner.id}
       candidatos={candidatos}
       accion={cambiarPropietarioAccion}
     />
   )}
   ```

El botón de reasignar **no se pinta** para quien no puede: `PermissionGate` es envoltura
declarativa, nunca sustituto de la autorización del servidor, que ya está en la Task 5.

- [ ] **Paso 5: Verificar en el navegador**

```bash
pnpm dev
```
Abrir `/oportunidades/<id>` como Jorge (`GERENTE_PAIS`). Comprobar:
- Mover a una etapa con compuerta incumplida **lista todos** los requisitos faltantes, no uno.
- Si la etapa es `BLOQUEANTE`, no aparece «Avanzar de todos modos».
- Cambiar propietario a alguien de la lista funciona y la oportunidad desaparece del pipeline del
  anterior.

- [ ] **Paso 6: Verificar la frontera, los tipos y la calidad**

```bash
pnpm typecheck && pnpm lint && pnpm test tests/arquitectura && pnpm react-doctor
```
Esperado: PASAN. `react-doctor` no debe traer hallazgos nuevos: el único conocido es el
`trustPolicy` de `pnpm-workspace.yaml:34`, documentado en `docs/react-doctor.md`.

- [ ] **Paso 7: Commit**

```bash
git add "app/(app)/oportunidades/[id]" components/oportunidad
git commit -m "feat(E1): cambiar etapa y propietario desde P-02 (RN-02, RN-31, §12.2)"
```

---

## Task 10: P-07 — registrar actividad con su siguiente paso

**Files:**
- Create: `app/(app)/actividades/acciones.ts`, `components/actividad/RegistrarActividad.tsx`
- Modify: `app/(app)/actividades/page.tsx`

**Interfaces:**
- Consumes: `registrarActividad` de `@/lib/domain/activity` · `configuracionDeCatalogos` de
  `@/lib/scope/configuracion` (para los tipos de actividad) · las primitivas de la Task 8.
- Produces:
  ```ts
  async function registrarActividadAccion(
    _previo: ResultadoAccion | null,
    form: FormData,
  ): Promise<ResultadoAccion>;
  ```

- [ ] **Paso 1: Escribir la Server Action**

```ts
// app/(app)/actividades/acciones.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { registrarActividad } from "@/lib/domain/activity";

const esquema = z
  .object({
    actividadId: z.string().min(1).optional(),
    opportunityId: z.string().min(1).optional(),
    typeId: z.string().min(1, "Elige el tipo de actividad."),
    subject: z.string().min(1, "Escribe el asunto."),
    outcome: z.string().optional(),
    sinSeguimiento: z.coerce.boolean().optional(),
    siguienteTypeId: z.string().optional(),
    siguienteSubject: z.string().optional(),
    siguienteStartsAt: z.string().optional(),
  })
  .transform((v) => ({
    actividadId: v.actividadId,
    opportunityId: v.opportunityId,
    typeId: v.typeId,
    subject: v.subject,
    outcome: v.outcome || undefined,
    sinSeguimiento: v.sinSeguimiento,
    siguiente:
      v.siguienteTypeId && v.siguienteSubject && v.siguienteStartsAt
        ? {
            typeId: v.siguienteTypeId,
            subject: v.siguienteSubject,
            startsAt: new Date(v.siguienteStartsAt),
          }
        : undefined,
  }));

export async function registrarActividadAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquema.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const resultado = await registrarActividad(session, datos.data);

  if (resultado.ok) {
    revalidatePath("/actividades");
    if (datos.data.opportunityId) {
      revalidatePath(`/oportunidades/${datos.data.opportunityId}`);
    }
  }
  return resultado;
}
```

- [ ] **Paso 2: Escribir el formulario**

El punto de §12.4 es que la actividad **y su siguiente paso** se resuelven en el mismo formulario.
No son dos pantallas.

```tsx
// components/actividad/RegistrarActividad.tsx
"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import {
  AreaDeTexto,
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  problemaDe,
} from "@/components/ui/formulario";

export function RegistrarActividad({
  actividad,
  tipos,
  accion,
}: {
  actividad: { id: string; subject: string; typeId: string };
  tipos: { id: string; name: string }[];
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, enviar, enviando] = useActionState(accion, null);
  const pideConfirmacion = resultado != null && !resultado.ok && resultado.motivo === "CONFIRMACION";

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Registrar
      </Boton>
      <Panel
        titulo="Registrar actividad"
        descripcion="Deja agendado el siguiente paso aquí mismo: es lo que evita que la oportunidad se enfríe."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      >
        <form action={enviar} className="flex flex-col gap-4">
          <input type="hidden" name="actividadId" value={actividad.id} />
          <input type="hidden" name="typeId" value={actividad.typeId} />
          <input type="hidden" name="subject" value={actividad.subject} />

          <Campo etiqueta="¿Cómo te fue?" htmlFor="outcome">
            <AreaDeTexto id="outcome" name="outcome" placeholder="Qué pasó y qué sigue." />
          </Campo>

          <fieldset className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
            <legend className="px-1 text-xs font-semibold text-[var(--text-heading)]">
              Siguiente paso
            </legend>

            <Campo etiqueta="Tipo" htmlFor="siguienteTypeId">
              <Seleccion id="siguienteTypeId" name="siguienteTypeId" defaultValue="">
                <option value="">Sin siguiente paso</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Campo
              etiqueta="Asunto"
              htmlFor="siguienteSubject"
              problema={problemaDe(resultado, "siguiente.subject")}
            >
              <Entrada id="siguienteSubject" name="siguienteSubject" placeholder="Enviar propuesta" />
            </Campo>

            <Campo etiqueta="Cuándo" htmlFor="siguienteStartsAt">
              <Entrada id="siguienteStartsAt" name="siguienteStartsAt" type="datetime-local" />
            </Campo>
          </fieldset>

          <AvisosDeAccion resultado={resultado} />

          <div className="flex items-center justify-end gap-2">
            <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            {/*
              §12.4 · el DEBE del spec. Este botón solo aparece cuando el
              servidor ya pidió la confirmación: nunca antes, para que cerrar
              sin seguimiento sea una decisión y no un descuido.
            */}
            {pideConfirmacion && (
              <Boton variante="secundario" type="submit" name="sinSeguimiento" value="true">
                Cerrar sin seguimiento
              </Boton>
            )}
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      </Panel>
    </>
  );
}
```

- [ ] **Paso 3: Montarlo en P-07**

En `app/(app)/actividades/page.tsx`, cargar los tipos activos y pasar el botón a cada renglón de
las listas «vencidas» y «hoy»:

```ts
const { tiposActividad } = await configuracionDeCatalogos();
const tipos = tiposActividad.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
```

y en cada renglón:

```tsx
<RegistrarActividad
  actividad={{ id: a.id, subject: a.subject, typeId: a.type.id }}
  tipos={tipos}
  accion={registrarActividadAccion}
/>
```

- [ ] **Paso 4: Verificar en el navegador el ciclo completo de §12.4**

```bash
pnpm dev
```
Entrar como Paulina (`pe@avattar.com`) a `/actividades`:
1. Registrar una vencida **sin** siguiente paso → aparece el aviso ámbar preguntando, y **no se
   guarda**.
2. Pulsar «Cerrar sin seguimiento» → se guarda, y la oportunidad aparece en la tercera lista,
   «sin próxima actividad».
3. Registrar otra **con** siguiente paso → desaparece de vencidas y la nueva queda agendada.

- [ ] **Paso 5: Verificar tipos, frontera y calidad**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm react-doctor
```

- [ ] **Paso 6: Commit**

```bash
git add "app/(app)/actividades" components/actividad
git commit -m "feat(E1): registrar actividad y su siguiente paso desde P-07 (§12.4)"
```

---

## Task 11: P-11 — editar catálogos en pantalla

**Files:**
- Create: `app/(app)/admin/acciones.ts`, `components/admin/FilaDeCatalogo.tsx`
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `editarCatalogo`, `type Catalogo` de `@/lib/domain/catalog` · las primitivas de la
  Task 8.
- Produces: `async function editarCatalogoAccion(_previo, form): Promise<ResultadoAccion>`.

- [ ] **Paso 1: Escribir la Server Action**

```ts
// app/(app)/admin/acciones.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { editarCatalogo } from "@/lib/domain/catalog";

const esquema = z.object({
  catalogo: z.enum(["ACTIVIDAD", "DOCUMENTO", "MOTIVO_PERDIDA", "ROL_COMITE"]),
  id: z.string().min(1),
  name: z.string().min(1, "El nombre no puede quedar vacío.").optional(),
  active: z.coerce.boolean().optional(),
  isContract: z.coerce.boolean().optional(),
  requiresCompetitor: z.coerce.boolean().optional(),
});

export async function editarCatalogoAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquema.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const resultado = await editarCatalogo(session, datos.data);

  if (resultado.ok) revalidatePath("/admin");
  return resultado;
}
```

**Cuidado con las casillas y `FormData`.** Una casilla desmarcada **no viaja** en el `FormData`, así
que `active` llegaría `undefined` y el servicio lo leería como «no cambió». Por eso cada casilla del
formulario lleva un `<input type="hidden" name="active" value="false" />` **antes** de la casilla:
si está marcada, su valor gana; si no, queda el `false` explícito.

- [ ] **Paso 2: Escribir la fila editable**

```tsx
// components/admin/FilaDeCatalogo.tsx
"use client";

import { useActionState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Casilla, Entrada, problemaDe } from "@/components/ui/formulario";

export function FilaDeCatalogo({
  catalogo,
  valor,
  bandera,
  usos,
  accion,
}: {
  catalogo: "ACTIVIDAD" | "DOCUMENTO" | "MOTIVO_PERDIDA" | "ROL_COMITE";
  valor: { id: string; name: string; active: boolean };
  /** La bandera de comportamiento del catálogo, si la tiene. */
  bandera?: { campo: "isContract" | "requiresCompetitor"; etiqueta: string; valor: boolean };
  usos: number;
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [resultado, enviar, enviando] = useActionState(accion, null);

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-2">
      <input type="hidden" name="catalogo" value={catalogo} />
      <input type="hidden" name="id" value={valor.id} />

      <Entrada
        name="name"
        defaultValue={valor.name}
        problema={problemaDe(resultado, "name")}
        className="max-w-xs"
        aria-label="Nombre"
      />

      {/* Una casilla desmarcada no viaja en FormData: el hidden garantiza el false. */}
      <input type="hidden" name="active" value="false" />
      <Casilla name="active" value="true" defaultChecked={valor.active} etiqueta="Activo" />

      {bandera && (
        <>
          <input type="hidden" name={bandera.campo} value="false" />
          <Casilla
            name={bandera.campo}
            value="true"
            defaultChecked={bandera.valor}
            etiqueta={bandera.etiqueta}
          />
        </>
      )}

      <span
        className="text-xs text-[var(--text-muted)]"
        title="Saber cuántas veces se usó es la diferencia entre desactivarlo tranquilo y romper reportes."
      >
        {usos === 0 ? "sin usos" : `${usos} usos`}
      </span>

      <Boton variante="fantasma" type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar"}
      </Boton>

      <div className="w-full">
        <AvisosDeAccion resultado={resultado} />
      </div>
    </form>
  );
}
```

- [ ] **Paso 3: Montarlo en P-11**

En `app/(app)/admin/page.tsx`, sustituir cada renglón de catálogo de solo lectura por
`<FilaDeCatalogo …>`, **solo cuando** `can(session, "EDITAR_CATALOGOS")`. Para quien no puede, la
lista sigue siendo de lectura: es la misma pantalla, con la acción ausente y no deshabilitada.

Mapeo de banderas:
- Tipos de documento → `{ campo: "isContract", etiqueta: "Es contrato u OC", valor: t.isContract }`
- Motivos de pérdida → `{ campo: "requiresCompetitor", etiqueta: "Exige competidor", valor: m.requiresCompetitor }`
- Tipos de actividad y roles de comité → sin bandera.

Los usos salen de lo que P-11 ya consulta: `_count.activities`, `_count.documents`,
`_count.opportunities`, `_count.people`.

- [ ] **Paso 4: Verificar en el navegador**

```bash
pnpm dev
```
Entrar como `as@avattar.com` (`ADMINISTRADOR`) a `/admin`:
1. Renombrar un rol de comité y guardar → cambia.
2. Desmarcar «Activo» en un tipo de actividad con usos → se desactiva; el conteo de usos sigue ahí.
3. Guardar sin cambiar nada → no pasa nada y **no** aparece una entrada nueva en la bitácora.
4. Entrar como `dc@avattar.com` (`DIRECCION`) → los catálogos se ven, sin controles de edición.

- [ ] **Paso 5: Verificar todo**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm react-doctor
```

- [ ] **Paso 6: Commit**

```bash
git add "app/(app)/admin" components/admin
git commit -m "feat(E1): edición de catálogos desde P-11 (MD-05, AC-33)"
```

---

## Task 12: P-01 — alta de oportunidad

> **Estado: hecha el 2-sep-2026, y más grande de lo que este plan decía.**
>
> El cliente pidió el formulario contra un boceto, y con él llegaron tres cosas
> que no estaban aquí: autocompletado de organización con **alta en línea**,
> autocompletado de persona, y selector de etapa en galones al estilo Pipedrive
> con evaluación de compuerta al nacer. Lo entregado está en
> `components/pipeline/` —`NuevaOportunidad`, `CamposDeContacto`,
> `CamposComerciales`, `SelectorDeEtapa`, `estadoDeAlta`— y en
> `components/ui/` —`formulario`, `Autocompletado`—.
>
> Las decisiones y sus razones, incluida la **única excepción a INV-01** del
> sistema, están en `docs/decisiones-pendientes.md` §11. Los pasos de abajo
> quedan como registro de lo planeado; lo construido los cubre y los excede.

**Files:**
- Create: `app/(app)/oportunidades/acciones.ts`, `components/pipeline/NuevaOportunidad.tsx`
- Modify: `app/(app)/oportunidades/page.tsx`

**Interfaces:**
- Consumes: `crearOportunidad` de `@/lib/domain/opportunity` · `listOrganizations` de
  `@/lib/scope/organizations` · las primitivas de la Task 8.
- Produces: `async function crearOportunidadAccion(_previo, form): Promise<ResultadoAccion<{ id: string; folio: string }>>`.

- [ ] **Paso 1: Escribir la Server Action**

```ts
// app/(app)/oportunidades/acciones.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deZod, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { crearOportunidad } from "@/lib/domain/opportunity";

const esquema = z.object({
  name: z.string().min(1, "Ponle nombre a la oportunidad."),
  organizationId: z.string().min(1, "Elige la organización."),
  pipelineId: z.string().min(1, "Elige el pipeline."),
  estimatedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "El importe va en dólares, con hasta cuatro decimales."),
  expectedCloseDate: z.string().min(1, "Pon la fecha de cierre estimada."),
  businessType: z.enum(["NUEVO", "EXPANSION", "RENOVACION"]),
});

export async function crearOportunidadAccion(
  _previo: ResultadoAccion<{ id: string; folio: string }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ id: string; folio: string }>> {
  const datos = esquema.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const resultado = await crearOportunidad(session, {
    ...datos.data,
    expectedCloseDate: new Date(datos.data.expectedCloseDate),
  });

  if (!resultado.ok) return resultado;

  revalidatePath("/oportunidades");
  // Llevarlo al detalle es lo que §12.1 pide: el alta termina donde empieza el
  // trabajo, no en la lista.
  redirect(`/oportunidades/${resultado.datos.id}`);
}
```

**Nota sobre `redirect`:** lanza una excepción de control de Next, así que va **después** de todo
lo demás y nunca dentro de un `try`.

**Nota sobre `estimatedAmount`:** viaja como cadena, nunca como `number`. INV-03 — un importe en
punto flotante pierde centavos, y `Decimal(18,4)` los guarda.

- [ ] **Paso 2: Escribir el formulario**

```tsx
// components/pipeline/NuevaOportunidad.tsx
"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  problemaDe,
} from "@/components/ui/formulario";

// Los tres valores del enum BusinessType del esquema. No inventar un cuarto:
// agregar uno es una migración, no una opción de formulario.
const TIPOS_DE_NEGOCIO = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "EXPANSION", etiqueta: "Expansión" },
  { valor: "RENOVACION", etiqueta: "Renovación" },
];

export function NuevaOportunidad({
  organizaciones,
  pipelines,
  accion,
}: {
  organizaciones: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
  accion: (
    previo: ResultadoAccion<{ id: string; folio: string }> | null,
    form: FormData,
  ) => Promise<ResultadoAccion<{ id: string; folio: string }>>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, enviar, enviando] = useActionState(accion, null);

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Nueva oportunidad</Boton>
      <Panel
        titulo="Nueva oportunidad"
        descripcion="El folio se asigna solo y no cambia nunca. El país sale de la organización."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      >
        <form action={enviar} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre" htmlFor="name" problema={problemaDe(resultado, "name")}>
            <Entrada
              id="name"
              name="name"
              placeholder="Migración ERP a nube privada"
              problema={problemaDe(resultado, "name")}
            />
          </Campo>

          <Campo
            etiqueta="Organización"
            htmlFor="organizationId"
            problema={problemaDe(resultado, "organizationId")}
          >
            <Seleccion id="organizationId" name="organizationId" defaultValue="">
              <option value="" disabled>
                Elige una organización
              </option>
              {organizaciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Pipeline"
            htmlFor="pipelineId"
            problema={problemaDe(resultado, "pipelineId")}
            ayuda="Tiene que ser del mismo país que la organización."
          >
            <Seleccion id="pipelineId" name="pipelineId" defaultValue="">
              <option value="" disabled>
                Elige un pipeline
              </option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Importe estimado (USD)"
              htmlFor="estimatedAmount"
              problema={problemaDe(resultado, "estimatedAmount")}
            >
              <Entrada
                id="estimatedAmount"
                name="estimatedAmount"
                inputMode="decimal"
                placeholder="125000"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "estimatedAmount")}
              />
            </Campo>

            <Campo
              etiqueta="Cierre estimado"
              htmlFor="expectedCloseDate"
              problema={problemaDe(resultado, "expectedCloseDate")}
            >
              <Entrada id="expectedCloseDate" name="expectedCloseDate" type="date" />
            </Campo>
          </div>

          <Campo etiqueta="Tipo de negocio" htmlFor="businessType">
            <Seleccion id="businessType" name="businessType" defaultValue="NUEVO">
              {TIPOS_DE_NEGOCIO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <AvisosDeAccion resultado={resultado} />

          <div className="flex items-center justify-end gap-2">
            <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Creando…" : "Crear"}
            </Boton>
          </div>
        </form>
      </Panel>
    </>
  );
}
```

- [ ] **Paso 3: Montarlo en P-01**

En `app/(app)/oportunidades/page.tsx`, junto al encabezado, con las organizaciones y pipelines que
la sesión alcanza:

```tsx
<NuevaOportunidad
  organizaciones={organizaciones.map((o) => ({ id: o.id, name: o.name }))}
  pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
  accion={crearOportunidadAccion}
/>
```

Los pipelines se filtran por `session.countryCodes`; las organizaciones salen de
`lib/scope/organizations`, que ya aplica el alcance (INV-01).

Además, el `EstadoVacio` del kanban debe proponer esta acción: §13.5 dice que «los estados vacíos
siempre proponen la acción siguiente».

- [ ] **Paso 4: Verificar en el navegador**

```bash
pnpm dev
```
1. Crear una oportunidad como Jorge → redirige al detalle, con folio `OPP-2026-000NN` y en la
   primera etapa del pipeline.
2. Intentar crearla con importe `12,000.50` (con coma) → el problema aparece **bajo el campo**, con
   el mensaje concreto.
3. Elegir una organización mexicana con el pipeline de Colombia → lo rechaza nombrando ambos países.

- [ ] **Paso 5: Verificar todo, y limpiar lo creado a mano**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm react-doctor
```

**Las oportunidades creadas probando en el navegador quedan en la base** y rompen el conteo de 14 y
el valor abierto de 12 621 000. Borrarlas por folio:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.opportunity.deleteMany({where:{folio:{in:['OPP-2026-00015']}}}).then(r=>console.log(r)).finally(()=>p.\$disconnect())"
```
Sustituir los folios por los que se hayan creado. Después, `pnpm test` debe volver a pasar entero.

- [ ] **Paso 6: Commit**

```bash
git add "app/(app)/oportunidades" components/pipeline/NuevaOportunidad.tsx
git commit -m "feat(E1): alta de oportunidad desde P-01 (INV-12, §12.1)"
```

---

## Task 13: Cierre del incremento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-mutaciones-e1-design.md` (marcar lo entregado),
  `docs/decisiones-pendientes.md` (si aparecieron hallazgos)
- Test: `tests/arquitectura/invariantes.test.ts` (verificar que cubre las acciones nuevas)

- [ ] **Paso 1: Verificar que AC-32 alcanza a las Server Actions**

Las acciones viven en `app/(app)/**/acciones.ts`. La prueba recorre `archivosTs("app")`, así que ya
las incluye — pero conviene confirmarlo en vez de suponerlo:

```bash
pnpm test tests/arquitectura
```

Y comprobar a mano que ningún archivo nuevo importa lo prohibido:

```bash
grep -rn "@/lib/db\|@prisma/client" app components | grep -v node_modules
```
Esperado: **cero resultados en `app/**` y `components/**`**, salvo `import type` de tipos puros de
`@prisma/client` en componentes, que la prueba permite pero es mejor evitar derivando el tipo de su
lector con `Awaited<ReturnType<typeof …>>`, como ya hace P-02.

- [ ] **Paso 2: Verificar los avisos de la base**

Con el MCP de Supabase, `get_advisors` con `type: "security"` y `type: "performance"`. No debe haber
hallazgos nuevos respecto de la corrida anterior: este incremento no cambió el esquema, solo escribe
en tablas existentes.

- [ ] **Paso 3: Correr la verificación completa**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm react-doctor
```
Esperado:
- `pnpm test`: **269 pruebas**, 0 saltadas (247 de la Task 2, más ~22 de las tareas 1 y 3-7).
- `pnpm build`: 13 rutas. Las pantallas con formularios suben su JS de cliente —dejan de ser
  servidor puro— y eso es esperado: `useActionState` necesita cliente. Anotar la cifra.
- `pnpm react-doctor`: solo el hallazgo conocido del `trustPolicy`.

- [ ] **Paso 4: Actualizar el estado del spec**

En `docs/superpowers/specs/2026-09-02-mutaciones-e1-design.md`, cambiar el encabezado de
`**Estado:** aprobado por el negocio el 2-sep-2026` a `**Estado:** implementado`, y anotar bajo §6
cuáles criterios quedaron verificados y cuáles siguen pendientes por incremento.

Si alguna de las nueve pruebas desaltadas reveló un defecto, o si apareció una regla de negocio que
no estaba en el spec, registrarla en `docs/decisiones-pendientes.md` con la misma forma de §9 y §10:
qué dice el spec, qué se asumió, por qué, dónde vive y qué cuesta cambiarlo.

- [ ] **Paso 5: Commit final**

```bash
git add docs
git commit -m "docs: cierre de la capa de mutaciones de E1 (AC-04, AC-33, RN-02, §12.4)"
```

---

## Qué queda después de este plan

Para que nadie lo lea como «E1 terminado»:

- **`FilterBar` conectada a `lib/filters`.** §17 la lista bajo E0 y no existe todavía; los filtros
  se leen de la URL pero no hay barra que los escriba.
- **Las cuatro acciones auditables restantes de INV-09** —autorizar descuento, cambiar precio sobre
  cotización congelada, reabrir oportunidad y exportar con costo— llegan con E2, E3 y E4. AC-33
  sigue parcial y por diseño.
- **Marcar ganada y marcar perdida** son de E3: dependen del cuadre de hitos (AC-18) y del mínimo
  MEDDIC (AC-14).
- **Q-01, Q-13 y Q-14** siguen esperando confirmación del Director. Las tres son de la misma
  familia: quién ve y quién mueve qué.
