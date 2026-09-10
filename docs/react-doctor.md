# react-doctor: qué está suprimido y por qué

`react-doctor` es la puerta de calidad del proyecto. Tres reglas están
suprimidas en `doctor.config.json`, siempre acotadas a archivos concretos y
nunca de forma global. Este documento es la evidencia de cada una.

**Cómo se corre:** `pnpm react-doctor`.

> No es `pnpm doctor`. Desde pnpm 11 ese nombre es un comando propio del gestor
> —diagnostica el entorno de instalación— y **eclipsa al script del
> `package.json` sin avisar**: sale «All checks passed» y ninguna pantalla se
> revisó. Por eso el script se llama `react-doctor` y no `doctor`.

## Las dos del navegador

`react-doctor/artifact-secret-leak` y `react-doctor/artifact-baas-authority-surface`,
acotadas a `app/(auth)/login/**` y `.next/**`.

La evidencia completa —qué término aparece en el bundle, en desarrollo y en
producción, y cómo reproducirlo— está en [`verificacion-bundle.md`](./verificacion-bundle.md).
Ahí también está la condición para reabrirlas.

## `async-await-in-loop` en el seed

Acotada a `prisma/seed.ts`, quince apariciones.

La regla busca peticiones en serie que podrían ir en paralelo. Aquí no aplica,
por dos razones distintas:

1. **Casi todas son `upsert`.** El seed tiene que poder correrse encima de una
   base ya sembrada, y `createMany` no hace upsert. No hay forma de agrupar la
   llamada sin perder la idempotencia.
2. **El orden es el dato.** Las organizaciones se crean en dos pasadas porque la
   jerarquía necesita a los padres ya existentes; las etapas antes que las
   oportunidades; las evaluaciones MEDDIC antes de recalcular el puntaje.
   Paralelizar eso no es una optimización, es una condición de carrera.

Y aunque se pudiera: el seed no viaja en ningún bundle, no lo ejecuta un
usuario, y corre una vez contra el pooler de Supavisor, que tiene un límite de
conexiones bajo. Dispararle todo en paralelo lo haría más frágil, no más rápido
—ya se vieron tiempos de espera agotados con la carga secuencial.

**Cuándo reabrir:** si el seed deja de ser idempotente y pasa a `createMany`, o
si aparece un `await` en un ciclo dentro de `app/**`, `lib/**` o
`components/**`. Ahí la regla sí tendría razón, y por eso la supresión está
acotada a un solo archivo en vez de a la regla entera.

## `nextjs-no-client-side-redirect` en el alta de oportunidad

Acotada a `components/pipeline/NuevaOportunidad.tsx`.

La regla prefiere `redirect()` del servidor sobre `router.push()`, y en general
tiene razón: menos código y una ida y vuelta menos.

Aquí no aplica. `redirect()` en una Server Action **destruye el resultado antes
de que el cliente lo vea**, y con él las dos cosas que el usuario necesita
saber: el folio que se le asignó a la oportunidad y —cuando corresponde— que
nació sin cumplir los requisitos de su etapa, lo cual queda registrado y
alimenta el reporte semanal de incumplimiento de §8.3.

El aviso tiene que dispararse **antes** de cambiar de pantalla. El `Toaster`
vive en el layout del grupo, así que sobrevive a la navegación y sigue visible
al llegar al detalle. La razón para navegar desde el cliente no es comodidad:
es que el usuario se entere de lo que acabó de pasar.

**Cuándo reabrir:** si el aviso se mueve a un parámetro de la URL que la
pantalla de destino lea y limpie, el `redirect()` del servidor vuelve a ser
posible y esta supresión sobra.
