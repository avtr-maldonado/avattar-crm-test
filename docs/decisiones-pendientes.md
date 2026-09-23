# Decisiones pendientes y supuestos adoptados

Actualizado el 1 de septiembre de 2026.

El spec §18 deja diez preguntas abiertas y pide no resolverlas por cuenta
propia. El guion de descubrimiento (`sesion-director-mexico-preguntas.md`) tiene
sus 23 respuestas en blanco, así que hoy no hay a quién consultar sin frenar la
construcción.

**Se adoptó el valor que el propio spec propone, y se registra aquí.** Todos
viven como dato en la base, no en el código (INV-05): cambiarlos es editar una
fila, no desplegar. Este documento existe para que ningún supuesto quede
invisible.

---

## 1. Preguntas abiertas del spec (Q-01 a Q-10)

| Q | Pregunta | Valor asumido | Dónde vive | Qué cuesta cambiarlo |
|---|---|---|---|---|
| **Q-01** | El Director dijo «los vendedores solo ven las que crean». ¿Propietario o creador? | **Propietario** (`ownerId`). Tomado literal, un gerente no podría dar de alta una oportunidad y asignarla, y una reasignación dejaría al vendedor nuevo sin acceso | `lib/scope/opportunities.ts` | Una línea. Cambiar `ownerId` por `createdById` en el caso `VENDEDOR` |
| **Q-02** | ¿El año fiscal de Avattar es el año calendario? | **Sí.** T1 = ene–mar. Inferido del prototipo, que muestra septiembre dentro de T3 | `Country.fiscalYearStartMonth = 1` | Una fila por país |
| **Q-03** | ¿Preventa es rol propio? ¿Ve costo? ¿Edita la cotización? | **Rol propio.** Ve las oportunidades donde está asignado como apoyo. **Sin** `VER_COSTO`. No edita cotización | `RolePermission` | Filas en la matriz, editable desde P-11 |
| **Q-04** | Tasa de impuesto real de Colombia y Chile | **MX 16 %, CO 19 %, CL 19 %.** Los de CO y CL vienen del catálogo de funcionalidades v2, sin confirmar con contabilidad local | `Country.taxRate` | Una fila. No afecta cotizaciones ya creadas: RN-24 copia la tasa al crear |
| **Q-05** | ¿Quién mantiene el costo estándar mientras Defontana esté fuera? | **Administración, por carga masiva.** Sin responsable asignado todavía | `Product.costSource = CARGA_MASIVA`, `Product.costUpdatedAt` | Es una decisión de proceso, no de código. P-06 marca en ámbar los SKU con costo de más de 60 días |
| **Q-06** | ¿Se carga un resumen histórico agregado de 24 meses? | **No.** P-09 muestra «sin datos suficientes» durante los primeros trimestres, nunca un cero | — | Si se decide que sí, es un módulo de importación nuevo |
| **Q-07** | ¿Se permiten conceptos libres en la cotización? ¿Con costo obligatorio? | **Sí, con costo obligatorio.** Sin costo, el margen de esa línea sería falso y las autorizaciones dejarían de ser confiables | `QuoteLine.productId` nulo | Validación en `lib/domain/quote.ts` |
| **Q-08** | Pesos MEDDIC por omisión: ¿los seis iguales, o pesa más el decisor económico? | **17/17/17/17/15/17.** `DOLOR_IDENTIFICADO` a 15 para que sumen 100 | `MeddicWeight`, por pipeline | Editable desde P-11 sin desplegar (AC-17) |
| **Q-09** | ¿El SLA de autorización se cuenta en horas hábiles o naturales? | **Hábiles**, 24 h | `CommercialPolicy.approvalSlaHours` | El número es dato; hábiles-contra-naturales sí es código, en `lib/domain/approval.ts` |
| **Q-10** | ¿Quién carga el tipo de cambio, con qué frecuencia y de qué fuente? | **Sin efecto.** La decisión D-A eliminó la multimoneda | — | Volvería a aplicar si se reintroduce multimoneda |

---

## 2. Decisiones tomadas que modifican el spec

Cerradas con el responsable del proyecto el 1 de septiembre de 2026. Detalle en
`docs/superpowers/specs/2026-09-01-crm-avattar-e0-e1-design.md` §2.

| # | Decisión | Consecuencia |
|---|---|---|
| **D-A** | **Monomoneda USD** en los tres países | Ver §3 |
| **D-B** | Prisma para datos, Supabase para Auth (Entra ID) y Storage | RLS queda como respaldo deny-all, no como autorización |
| **D-C** | Alcance de la primera entrega: E0 y E1 | E2 a E5 en ciclos posteriores |
| **D-D** | Reemplazar el esquema v1, archivándolo | `supabase/migrations/_archivo_v1/` |
| **D-E** | Adoptar los supuestos del spec y marcarlos | Este documento |
| **D-F** | `react-doctor` como medida de calidad de React | `pnpm react-doctor` |

---

## 3. Qué quedó sin efecto por la decisión de monomoneda (D-A)

**Los códigos no se renumeran ni se borran.** El spec §0.4 los declara estables y
citables, y reintroducir multimoneda debe ser reactivarlos, no redescubrirlos.

| Código | Texto original | Estado |
|---|---|---|
| **INV-04** | «Todo importe viaja con su moneda» | Se cumple trivialmente: la moneda es siempre `USD` |
| **INV-08** | «El tipo de cambio se congela al ganar» | **Sin efecto.** No hay tipo de cambio |
| **AC-19** | «Al marcar ganada se sellan `actualCloseDate` y `frozenExchangeRate`» | **Parcial.** Se sella `actualCloseDate`; `frozenExchangeRate` no existe |
| **RN-10** | «El tipo de cambio se congela al ganar» | **Sin efecto** |
| **Q-10** | Fuente del tipo de cambio | **Sin efecto** |

Se conserva a propósito: el enum `Currency` con el único valor `USD`, y las
columnas `currency` en `Opportunity`, `Quote`, `Pipeline` y `Objective`.
Reintroducir moneda local sería agregar valores al enum y una tabla de tipos de
cambio, no repintar cinco tablas.

**Por qué importa esto para Defontana (Fase 2):** facturar en México, Colombia y
Chile normalmente exige el monto en moneda local para SAT, DIAN y SII. Cotizar en
dólares y facturar en moneda local son cosas distintas. Esa conversión no está
resuelta aquí, y hay que confirmar con el Director de México si Avattar factura
hoy en USD o si la factura local sale en moneda local aunque el CRM viva en
dólares. Cambia el alcance de esa integración.

---

## 4. Divergencias entre documentos, sin resolver

No son preguntas del spec: son contradicciones entre el spec v2.0 y el catálogo
de funcionalidades v2, que sigue siendo material de negocio válido.

| Tema | Catálogo v2 | Spec v2.0 | Se implementó |
|---|---|---|---|
| Roles | 7: incluye Finanzas y Marketing (`AV-1101`) | 5 (§5.1) | **5. Cerrado el 1-sep-2026** (`Q-12`): se conservan los cinco para mantener la implementación simple. Si Finanzas o Marketing necesitan acceso, será como permisos sobre los roles existentes, no como roles nuevos |
| Prospectos (Leads) | Módulo completo, Fase 2 (§10b, `PR-01` a `PR-05`) | No aparece, ni siquiera en §16 | **Fuera.** El esquema v1 ya tenía la tabla `prospectos`; se descartó |
| Crédito compartido | `AV-303`, suma exacta 100 % (`RN-20`, `RN-21`) | `RN-11`, explícitamente Fase 2 | **Fuera.** La regla de visibilidad por `ownerId` ya es compatible con extenderla a copropietarios |
| Estatus `cancelada` | Se distingue de `perdida`: no cuenta en tasa de cierre | `RN-12` fija tres estados | **Tres estados.** Si el negocio mide tasa de cierre excluyendo cancelaciones, esto se pierde |
| Migración desde Pipedrive | `AV-1201`, migración completa | Arranque en limpio (§1) | **En limpio** |
| Consentimiento de datos | `AV-208`, `RN-07` | No aparece | **No se implementa. Cerrado el 1-sep-2026** (`Q-11`). Ver §7 |

Las dos primeras filas quedaron cerradas el 1 de septiembre de 2026; ver §7.

---

## 5. Ajustes al seed del prototipo

El seed reproduce §15 para que la aplicación se vea igual que lo aprobado por
Dirección. Tres cifras se ajustaron, y conviene confirmarlas.

**Banderas de riesgo: 7 y 3 943 000, no 5 y 3 513 000.**
El spec declara cinco banderas, pero INV-11 obliga a **calcularlas**. Con
`marginFloor = 0.20`, tres oportunidades caen bajo el piso —OPP-2026-00388 (9 %),
OPP-2026-00341 (11 %) y OPP-2026-00304 (19 %)— y el spec solo marca la primera.
Los otros dos totales del seed sí cuadran exactos: valor abierto 12 621 000 y
ponderado 7 362 350.

**Cuotas reescaladas.**
Las de §15 (9.00 M USD para Jorge Medina, 33.5 M en total) dejan la cobertura del
T3 en **0.10×** contra la banda sana de 3.0×, porque solo 3 319 000 del pipeline
cierra en ese trimestre. Se reescalaron conservando las proporciones:

| Vendedor | Cuota ingreso | Cuota utilidad | Cobertura T3 |
|---|---:|---:|---:|
| Jorge Medina | 300 000 | 90 000 | 3.68× |
| Ana Lucía Ríos | 450 000 | 135 000 | 4.06× |
| Paulina Estrada | 150 000 | 45 000 | 2.57× |
| Gabriel Duarte | 120 000 | 36 000 | 0.00× |
| Valeria Domínguez | 80 000 | 24 000 | 0.00× |
| **Equipo** | **1 100 000** | **330 000** | **3.02×** |

**Pendiente de confirmar con Dirección:** con monomoneda USD, una oportunidad de
2 850 000 dólares y una cuota anual de 9 millones son cifras grandes para una
consultoría de este tamaño. Leídas como pesos serían ordinarias. Vale la pena
confirmar la escala de los importes del prototipo antes de la primera
demostración.

**Descuadre deliberado en Valeria Domínguez.** Sus cuatro trimestres no suman su
anual, a propósito, para que la advertencia de RN-32 sea visible en la
demostración y AC-30 tenga un caso real.

---

## 6. Prerequisitos de entorno, no de código

- **Credenciales de Entra ID.** `supabase/config.toml` trae `[auth.external.azure]`
  comentado. Sin ellas la autenticación se construye pero no se prueba de extremo
  a extremo; las pruebas usan sesiones simuladas.
- **`trustPolicy` en `warn`, no en `no-downgrade`.** `undici-types@6.21.0`, que
  llega como transitiva de `@types/node@22`, perdió su evidencia de procedencia.
  No hay salida limpia: los tipos deben seguir el mayor de Node. Volver a
  `no-downgrade` cuando la recupere. Razonado en `pnpm-workspace.yaml`.

---

## 7. Decisiones cerradas el 1 de septiembre de 2026

### Q-11 · No se implementa captura de consentimiento de datos personales

**Decisión del negocio.** El sistema maneja **datos de contacto profesional** de personas
vinculadas a empresas —nombre, cargo, correo corporativo, teléfono, empresa— tratados en su
calidad de representantes de una organización. No hay datos de clientes finales, ni datos
patrimoniales o financieros de personas, ni categorías sensibles.

En consecuencia, `Person` **no lleva** los campos `consentimiento_datos` ni
`consentimiento_fecha` que traía el esquema v1, y no hay flujo de captura de consentimiento.

**Lo que sí queda cubierto por el diseño, sin trabajo extra:** el derecho de supresión y
rectificación se atiende con el borrado lógico de `Person` (`deletedAt`, INV-15) y con la edición
normal de la ficha. No hace falta nada adicional en el esquema.

**Lo único que queda fuera del código:** publicar el aviso de privacidad es un asunto operativo
de Avattar, no del CRM. Si en el futuro el sistema llegara a manejar datos de personas físicas
como clientes finales —no como contactos de empresa—, esta decisión hay que reabrirla.

### Q-12 · Se conservan los cinco roles del spec

**Decisión del negocio:** mantener la implementación simple. `VENDEDOR`, `GERENTE_PAIS`,
`DIRECCION`, `ADMINISTRADOR` y `PREVENTA`. Finanzas y Marketing, que el catálogo v2 proponía como
roles propios (`AV-1101`), **no se implementan**.

Si más adelante Finanzas necesita ver la facturación esperada o Marketing el origen de las
oportunidades, la vía es un permiso nuevo en la matriz de §5.2 asignado a un rol existente, no un
rol nuevo. La matriz es editable desde P-11 sin desplegar código, así que ese cambio no toca el
esquema.

---

## 8. Hallazgos al sembrar el escenario (1 de septiembre de 2026)

Tres inconsistencias internas de §15, encontradas al ejecutar el seed contra la
base real. Ninguna bloquea, pero las tres conviene confirmarlas con Dirección
antes de la primera demostración.

### 8.1 · Cinco organizaciones que se usan y nunca se declaran

§15 lista **nueve** organizaciones en México, pero las catorce oportunidades
referencian **catorce** distintas. Estas cinco aparecen como dueñas de una
oportunidad y no están definidas en ningún lado:

| Organización | Oportunidad que la usa |
|---|---|
| Insumos Médicos Reforma | OPP-2026-00369 · Portal de proveedores |
| Logística Tepeyac | OPP-2026-00355 · Mesa de servicio 8x5 |
| Constructora Zaragoza | OPP-2026-00341 · Licenciamiento obra civil |
| Seguros Altamira | OPP-2026-00337 · Diagnóstico de procesos comerciales |
| Alimentos del Pacífico | OPP-2026-00322 · Automatización de reportes |

Se crearon con el tipo, la industria y la ciudad que su nombre y su negocio
implican, marcadas con `declaradaEnSpec: false` en `prisma/seed/datos.ts`.
**Confirmar esos atributos**, sobre todo el tipo (cliente o prospecto), que
cambia lo que la ficha de cuenta muestra.

### 8.2 · El puntaje MEDDIC 62 es aritméticamente imposible

Con la fórmula de §7.2 y los pesos por omisión de Q-08 —cinco componentes a 17 y
el dolor a 15— el puntaje **no es continuo**. Solo 33 valores son alcanzables:

```
0 · 8 · 9 · 15 · 16 · 17 · 24 · 25 · 26 · 32 · 33 · 34 · 41 · 42 · 43
49 · 50 · 51 · 58 · 59 · 60 · 66 · 67 · 68 · 75 · 76 · 77 · 83 · 84 · 85
92 · 93 · 100
```

§15 declara **62** para OPP-2026-00388, y 62 no está en la lista: los vecinos
son 60 y 66. Siete de los catorce puntajes del escenario caen entre escalones:

| Oportunidad | §15 pide | La fórmula da |
|---|---:|---:|
| OPP-2026-00402 | 55 | 58 |
| OPP-2026-00388 | 62 | **66** |
| OPP-2026-00374 | 28 | 26 |
| OPP-2026-00369 | 48 | 49 |
| OPP-2026-00341 | 12 | 9 |
| OPP-2026-00337 | 18 | 17 |
| OPP-2026-00311 | 31 | 32 |

Lo que el escenario quería demostrar se conserva: OPP-2026-00388 sigue por
debajo del mínimo de cierre (70), así que la validación se ve igual, y
OPP-2026-00417 llega exactamente a los 84 que §15 pide.

**Si el negocio necesita puntajes de grano fino**, la vía es cambiar los pesos
en `MeddicWeight` —son editables desde P-11 sin desplegar (AC-17)— para que la
rejilla sea más densa. Con pesos que no compartan divisor, los escalones se
acercan.

### 8.3 · El puntaje se derivó de los componentes, no al revés

§6.3 dice que `meddicScore` es un valor **desnormalizado**: se recalcula de sus
seis componentes y nunca se edita a mano. Sembrar el número sin las filas que lo
producen habría dejado la pestaña MEDDIC vacía junto a un puntaje salido de la
nada, en doce de las catorce oportunidades.

El seed siembra las 84 evaluaciones (seis por oportunidad) y **calcula** el
puntaje. Las dos que §15 detalla conservan su evidencia escrita a mano y sus
personas ligadas; las otras doce derivan sus estados del puntaje objetivo, con
evidencia genérica. Los componentes anclados a persona (`DECISOR_ECONOMICO` y
`CAMPEON`) nunca quedan en `CONFIRMADO` ahí, porque RN-30 exige una `Person`
ligada y esas oportunidades no tienen comité capturado.

### 8.4 · La unicidad de los objetivos anuales no se estaba aplicando

`@@unique([userId, fiscalYear, periodType, quarter])` con `quarter` nulo **no
restringe nada** en Postgres, porque `NULL != NULL`. Se podían insertar dos
objetivos anuales del mismo usuario y año, y RN-32 supone que hay uno solo.

Corregido con un índice `NULLS NOT DISTINCT` (Postgres 15+), en la migración
`unicidad_real_de_objetivos_anuales`. Conserva el significado de `quarter` nulo
—no hay trimestre— en vez de inventar un centinela como 0. Prisma todavía no
expresa esa cláusula en el schema, así que el índice se administra por
migración y el `@@unique` se queda para que el cliente siga tipando la llave.

---

## 9. Hallazgos al construir la pantalla de productos (2 de septiembre de 2026)

### 9.1 · El piso de margen por línea es incompatible con la reventa de licencias

`LIC-M365-E3` cuesta 7 900 y se lista en 8 400: **6.0 % de margen a precio de
lista**, contra un piso por línea de 10 % (`CommercialPolicy.lineMarginFloor`).

No es un error de captura: es cómo funciona la reventa de licenciamiento, que es
un negocio de paso con margen delgado por naturaleza. Pero significa que **ese
SKU nace violando la política antes de cualquier descuento**, y RN-05 dice que
una línea bajo el piso «se señala aunque el total cumpla».

Consecuencia práctica: toda cotización que incluya licencias va a levantar una
alerta de margen que nadie puede resolver bajando el precio, porque el problema
está en el costo.

**Hay tres salidas y son decisión del negocio:**

1. **Piso por familia de producto.** Licenciamiento con un piso propio —5 %, por
   decir— y servicios con el 10 %. Es un cambio de esquema: `lineMarginFloor`
   pasaría de `CommercialPolicy` a `ProductFamily`, o a una tabla puente.
2. **Exentar los modelos de paso.** `PriceModel` ya distingue
   `RECURRENTE_ANUAL` y `POR_CONSUMO`; la regla podría no aplicar a esos.
3. **Aceptar la alerta.** Que licencias siempre alerte, y que Gerencia la
   autorice como trámite. Es la opción sin código, y la peor: enseña al equipo a
   autorizar sin leer.

Mientras se decide, el seed **topa el precio mínimo contra el precio de lista**,
porque un piso por encima del techo no significa nada: con la derivación
original `LIC-M365-E3` quedaba con mínimo 8 777 y lista 8 400, es decir, no se
podía vender ni a precio de lista.

### 9.2 · RN-09 no se sostiene si el margen y el precio se muestran juntos

RN-09 dice que ver margen y ver costo son permisos **independientes**: «el
vendedor conoce su margen sin conocer el costo unitario del proveedor».

Aritméticamente eso no se puede sostener cuando ambos aparecen a la misma
granularidad. Verificado con los datos reales:

| SKU | Precio | Margen | Costo recuperado | Costo real |
|---|---:|---:|---:|---:|
| SRV-ARQ-001 | 18 000 | 47.2 % | **9 500** | 9 500 |
| STF-DVO-012 | 165 000 | 28.5 % | **118 000** | 118 000 |
| INF-SRV-R750 | 310 000 | 13.5 % | **268 000** | 268 000 |

`costo = precio × (1 − margen)`. La recuperación es **exacta**, no aproximada.
Es la misma aritmética que hacía inútil la vista `v_cotizacion_lineas_sin_costo`
del esquema archivado, donde bastaba restar la utilidad del importe.

**Lo que se implementó:** en P-06, sin `VER_COSTO` no se muestra el margen. El
vendedor ve precio de lista y **precio mínimo**, que es el piso duro de RN-08 y
lo que de verdad necesita para saber hasta dónde puede descontar. El margen no
le aporta nada ahí y sí revela el costo.

**Lo que queda por decidir:** en la **línea de cotización** el margen sí le sirve
al vendedor —es lo que dispara la autorización— y ahí el mismo cálculo aplica.
Las opciones son:

1. **Aceptarlo.** Reconocer que un vendedor puede deducir el costo de lo que
   cotiza, y que lo que RN-09 protege de verdad es el costo de los SKU que **no**
   está cotizando. Es defendible y no cuesta nada.
2. **Mostrar el margen en bandas** —«sobre el piso», «bajo el piso»— en vez del
   porcentaje. Protege el costo y conserva la señal que importa, que es
   semafórica y no numérica.
3. **Quitarle el margen al vendedor.** Contradice RN-09 y le quita la
   herramienta con la que se autorregula.

La opción 2 es la que preserva ambas cosas, pero cambia lo que el vendedor ve en
la pantalla que más usa. **Es decisión de Dirección, no técnica.**

---

## 10. Reglas derivadas al diseñar las mutaciones (2 de septiembre de 2026)

Ninguna de las dos está en el spec. Se derivaron de lo que sí dice, se
implementaron para poder construir, y **necesitan confirmación del Director**
junto con `Q-01`, que es de la misma familia: quién ve y quién mueve qué.

### Q-13 · Quién puede reasignar una oportunidad

**Lo que el spec dice:** nada explícito. La matriz de permisos de §5.2 tiene
once entradas y ninguna es «cambiar propietario». Lo único que hay es el
escenario de `RN-31`: «*el Gerente* cambia el propietario a Gabriel».

**Lo que se asumió:** puede reasignar quien tenga `VER_OPORTUNIDADES_OFICINA`.
Eso da Gerencia, Dirección y Administración, y deja fuera al vendedor.

**Por qué.** Si un vendedor pudiera cambiar el propietario, podría quitarse de
encima una oportunidad que va mal —y con ella su renglón de objetivos— o
tomar la de un compañero. Ninguna de las dos deja rastro visible en el pipeline
de nadie más, porque la oportunidad simplemente cambia de columna.

La condición se lee de `RolePermission`, no de un `switch` por rol. Si mañana el
negocio decide que Preventa también reasigna, es una fila en la base y no un
despliegue.

**Dónde vive:** `lib/domain/opportunity.ts`.
**Costo de cambiarla:** una línea.

### Q-14 · A quién se le puede reasignar

**Lo que se asumió:** solo a usuarios activos cuyo `countryCodes` incluya el
país de la oportunidad.

**Por qué.** Sin esta condición `AC-05` se rompe por la puerta de atrás. El
criterio exige que un `GERENTE_PAIS` de México no obtenga **ninguna**
oportunidad de Colombia por ningún filtro. Pero si el gerente mexicano pudiera
reasignar una oportunidad suya a un vendedor colombiano, ese vendedor la vería
en su pipeline: el alcance por país se habría aplicado correctamente en cada
consulta y aun así el dato habría cruzado la frontera. La fuga no está en el
filtro, está en la escritura.

Es más restrictiva que el spec, a propósito. Relajarla obliga a decidir antes
qué significa una oportunidad cuyo dueño no opera en su país: de quién es la
cuota que avanza, qué política comercial le aplica, quién la autoriza.

**Dónde vive:** la consulta de destinatarios válidos en `lib/domain/opportunity.ts`.
**Costo de cambiarla:** una condición.

---

## 11. El alta de oportunidad, y la excepción a INV-01 (2 de septiembre de 2026)

La pantalla se diseñó contra un boceto del cliente. Cuatro cosas del boceto
chocaban con decisiones ya tomadas y se resolvieron así:

| Lo que pedía el boceto | Qué se hizo | Por qué |
|---|---|---|
| Folio `OPP-2026-00431` visible antes de crear | `OPP-2026-·····  se asigna al crear` | El consecutivo solo avanza al insertar. Mostrarlo antes obligaría a reservarlo al abrir el formulario, y cada cancelación dejaría un hueco en la serie |
| Importes en `MXN` | **USD** | `enum Currency` tiene un solo valor. No es una preferencia distinta: es imposible en el esquema. Cambiarlo reactiva `INV-08` y arrastra la conversión de Defontana |
| «Jorge Medina · 100 % del crédito» | Solo el propietario | El crédito compartido es `RN-11` / `F-113`, **Fase 2**. Mostrar un 100 % sugiere que hay un control para cambiarlo |
| Botón «Crear y cotizar» | «Crear oportunidad» | El cotizador es E2. Se renombra cuando exista a dónde llevar |

### 11.1 · La búsqueda de organizaciones salta el alcance por rol

**Es la única excepción a `INV-01` en todo el sistema.** Decidida con el negocio
el 2-sep-2026, entre tres opciones.

**Lo que hace.** `buscarOrganizacionesParaAlta` no aplica `organizationScope`:
sugiere todas las organizaciones del país de quien busca, sean suyas o no.

**Por qué.** Si un vendedor no ve que «Hidrosistemas del Valle» ya existe porque
la ficha es de otro, va a dar de alta «Hidrosistemas del Valle SA». A partir de
ese momento el histórico de esa cuenta queda partido en dos **para siempre**:
los duplicados de organización no se limpian nunca, y ningún reporte por cuenta
vuelve a cuadrar. El costo del duplicado es permanente; el de la excepción, no.

**Qué se expone y qué no.** Nombre, tipo y ciudad. **Nunca el propietario, nunca
cifras, nunca conteos.** Un vendedor descubre qué empresas son clientes de
Avattar; no descubre de quién son ni cuánto valen ni cuántas oportunidades
tienen. El país sí acota: nadie ve la cartera de otro país (`AC-05`).

La excepción vive en una función con nombre propio y su justificación en el
encabezado, **no escondida dentro de una consulta**. Hay pruebas que verifican
que no filtre de más.

**Costo de revertirla:** cambiar el `where` por `withOrganizationScope`. Una
línea. Lo que no se revierte son los duplicados que se hayan creado mientras
tanto.

### 11.2 · Se puede crear en una etapa avanzada, con las mismas compuertas

**Decidido el 2-sep-2026.** El selector deja elegir cualquier etapa del pipeline
y el servidor evalúa `RN-02` igual que al mover, con la misma regla de
`ADVERTENCIA` y `BLOQUEANTE`.

**Por qué.** Al arrancar hay que capturar los tratos que ya vienen de Pipedrive
a medio camino. Sin esto, todos nacen en Calificación y el pipeline del primer
mes es ficción.

**La consecuencia, que es honesta y visible:** una oportunidad recién creada no
tiene propuesta ni cotización congelada, así que las etapas de Propuesta en
adelante fallan la compuerta y el formulario dice exactamente qué falta. El
único requisito que sí puede cumplirse al nacer es
`PERSONA_CON_ROL_DECLARADO`, porque la persona se captura en el mismo
formulario.

Nacer en etapa avanzada **deja fila en `StageTransition`** con `fromStageId`
nulo. Sin ella, la oportunidad aparecería en Negociación sin que nada explicara
cómo llegó.

### 11.3 · Organización, persona y oportunidad se crean en una sola transacción

No es un detalle de implementación. Si se crearan por separado y la oportunidad
fallara después, cada captura abandonada a la mitad dejaría una empresa huérfana
en el catálogo. Esa es la basura que nadie limpia. Hay una prueba que lo
verifica: con un pipeline de otro país, la organización **no** queda.

---

## 12. Los filtros por omisión de P-01 se quitaron (9 de septiembre de 2026)

**Diverge de §9.3**, que decía:

> «Por omisión, la pantalla de oportunidades abre en `dateField=CIERRE_ESTIMADO`
> y `period=ESTE_TRIMESTRE`, que es la pregunta que un vendedor y un gerente se
> hacen todos los días.»

Y de §9.2, que pedía `status` en «Abierta por omisión».

### Qué pasó

Se dio de alta una oportunidad el 9 de septiembre con cierre estimado el 30 de
octubre. **Desapareció de la pantalla**: no salía en el kanban ni en la tabla.
El encabezado decía «0 abiertas · $0.00», que era falso.

La causa no era un defecto de código: el filtro estaba haciendo exactamente lo
que §9.3 pide. El defecto era que **nadie podía verlo**. La barra de filtros de
§9 no existe todavía —el §17 la pone en E0 y está atrasada—, así que el recorte
se aplicaba en silencio y la pantalla afirmaba que no había nada.

`AC-23` ya lo prohibía en espíritu: «lo hace visible en la barra de filtros; **no
queda implícito**».

### Qué se hizo

`parseFilters` ya no pone preajuste ni estatus por omisión: `period` arranca en
`PERSONALIZADO`, que sin `from` ni `to` no arma cláusula de fecha, y `status`
arranca vacío. La pantalla abre mostrando **todo lo que el alcance del rol
permite ver**.

Nada más cambió. Elegir un preajuste sigue filtrando igual, el estado sigue
viviendo en la URL (`INV-10`) y el alcance por rol se sigue anteponiendo a
cualquier filtro (`AC-25`).

### Qué cuesta revertirlo

Dos literales en `lib/filters/opportunities.ts`: `PERSONALIZADO` → `ESTE_TRIMESTRE`
y `status` → `["ABIERTA"]`. Están comentados en el archivo.

### Cuándo reconsiderarlo

**Cuando exista la barra de filtros.** El valor por omisión de §9.3 es buena
pregunta de negocio; el problema era que fuera invisible. Con una barra que
muestre «Cierre estimado · Este trimestre» en una pastilla que se pueda quitar,
volver a §9.3 tiene sentido y conviene.

También conviene reconsiderarlo cuando haya volumen: con 500 oportunidades
abrir sin recorte es una pantalla que nadie puede leer, y ahí el valor por
omisión vuelve a ganar. Hoy hay una.

### Q-15 · Quién edita un contacto, y la asimetría entre la ficha y la gente

**Lo que el spec dice:** nada. §5.3 declara quién **ve** una cuenta; no dice
quién la edita, ni quién puede capturar a sus contactos.

**Lo que se asumió — dos reglas, no una:**

| Qué | Quién |
|---|---|
| **La ficha de la empresa** — razón social, identificador fiscal, giro, sector, ciudad, empleados, días de crédito, propietario | Su propietario, o quien tenga `VER_OPORTUNIDADES_OFICINA` |
| **Las personas** de esa empresa — alta y edición | Cualquiera que alcance la organización |

**Por qué la asimetría.** Capturar al contacto que acabas de conocer es parte
de trabajar la oportunidad. Un vendedor con una oportunidad en cuenta ajena la
alcanza por §5.3; si no pudiera capturar a su interlocutor, pasaría una de dos
cosas: o no lo captura —y el dato se pierde, que es exactamente lo que este
sistema existe para evitar— o le pide a otro que lo haga, y no se hace.

La **ficha**, en cambio, sí es del dueño de la cuenta. La razón social y los
días de crédito no son datos de una oportunidad: son de la relación comercial,
y esa la lleva alguien.

**Dos campos que deliberadamente NO son editables:**

- **El país de la organización.** Cambiarlo movería de país todas sus
  oportunidades y con ellas quién las ve: el alcance por rol se aplicaría
  correctamente en cada consulta y el dato habría cruzado la frontera igual
  (`AC-05`). Eso no es editar, es migrar, y necesita su propia decisión.
- **La empresa de una persona.** Mover a alguien de compañía cambiaría en
  silencio quién puede verlo, y casi siempre no es la misma persona en otra
  empresa: es una persona nueva que hay que dar de alta allá.

La matriz tampoco: la jerarquía matriz-filial es `F-402`, Fase 2.

**Dónde vive:** `lib/domain/contact.ts`.
**Costo de cambiarla:** una condición en `editarOrganizacion`.

**Para confirmar con el Director junto con `Q-01`, `Q-13` y `Q-14`**: las cuatro
son la misma pregunta —quién ve y quién toca qué— y conviene resolverlas en la
misma conversación.

---

## 13. MEDDIC, hitos y documentos (9 de septiembre de 2026)

Al habilitar las tres últimas pestañas del detalle aparecieron cuatro cosas que
el spec no resuelve. Ninguna se inventó en el código.

### `Q-16` · Quitar un documento no deja rastro, y apaga una compuerta

Un contrato o una orden de compra es lo que satisface la compuerta
`CONTRATO_O_OC_CARGADO` de la etapa de Cierre. Quitarlo la apaga. Hoy eso no se
audita, y no por descuido:

- `INV-15` **no cubre `Document`.** §6 acota el borrado lógico a Organization,
  Person, Opportunity, Activity y User. La fila se borra en duro.
- `INV-09` enumera las acciones sensibles y quitar un documento no está entre
  ellas, así que la unión `AuditAction` de `lib/audit/index.ts` no la admite.

Se dejó como el spec lo dice, en vez de ampliar el invariante por cuenta propia.

**El efecto colateral:** el archivo se queda en el bucket sin la fila que
guardaba su `storageKey`. Queda huérfano —recuperable solo a mano, por alguien
con acceso a Storage— y consume espacio para siempre.

**Costo de cambiarlo:** dos líneas. Agregar `"QUITAR_DOCUMENTO"` a la unión de
`lib/audit/index.ts` y envolver el `deleteMany` de `quitarDocumento` en
`auditedTransaction`. Si además se quiere recuperable, `Document` necesita
`deletedAt` y entra a la lista de §6.

**Dónde vive:** `lib/domain/document.ts`.

### `Q-17` · El bucket `documentos` está en público

Verificado el 9 de septiembre de 2026 contra la API de Storage: `public: true`,
sin límite de tamaño y sin restricción de tipos. **Cualquiera con la URL
descarga el archivo sin autenticarse**, y una URL que se filtra una vez —un
correo reenviado, un historial, una captura— es acceso permanente a un contrato.

La descarga se construyó con **URL firmada de vida corta** (diez minutos,
emitida en el servidor solo para quien alcanza la oportunidad), que es lo
correcto con el bucket privado. Con el bucket público el código sigue siendo
correcto pero la protección no sirve: la ruta directa también responde.

**Se apaga en** Supabase → Storage → `documentos` → Public bucket. No es un
cambio de código.

### Los pesos MEDDIC se leen del pipeline, con respaldo

`INV-05` prohíbe umbrales en el código, y §7 dice que los pesos se configuran
por pipeline. `MeddicWeight` puede estar vacío para un pipeline recién creado.
Cuando lo está se usan los pesos por omisión en vez de fallar: un puntaje
calculado con los pesos de omisión es más útil que una pantalla rota, y el
único efecto es que los seis componentes pesan lo mismo.

**Dónde vive:** `pesosMeddicDe` en `lib/scope/pipelines.ts`, y el respaldo en
`pesosDelPipeline` de `app/(app)/oportunidades/[id]/tabs.acciones.ts`.

### El cuadre de hitos distingue «no hay neto» de «cuadra en cero»

`RN-06` cuadra los hitos contra el neto de la cotización **congelada**. Sin
cotización congelada no hay total que repartir, y eso no es lo mismo que estar
cuadrado: son dos mensajes distintos en la pestaña, porque llevan a dos
acciones distintas —congelar una cotización, o repartir lo que falta—.

**Dónde vive:** `cuadreDeHitos` en `lib/domain/milestone.ts`.

---

## 14. Altas desde la pantalla de Contactos (11 de septiembre de 2026)

> **Revisado el 17 de septiembre de 2026 (§18).** Las dos reglas de país de esta
> sección —la cuenta nace en un país de la sesión, y el homónimo solo se
> rechaza dentro del mismo país— quedaron sin efecto: las cuentas ya no son de
> un país. Se conservan como historia de por qué se construyó así.

P-03 ganó dos botones: «Nueva cuenta» en Organizaciones y «Agregar contacto» en
Personas. Hasta entonces una organización solo nacía en línea dentro del alta
de oportunidad, y una persona solo desde la ficha de su empresa o el detalle.
Tres reglas se derivaron al construirlos; ninguna está en el spec.

### El país de la cuenta nueva sale de la sesión

Si quien la crea opera en un solo país, no se pregunta. Si opera en varios,
elige entre los suyos y nada más. Es la misma regla del alta en línea de
oportunidad, que ahí resuelve la ambigüedad con el país del pipeline; aquí no
hay pipeline y se pregunta. El servicio vuelve a comprobarlo (`AC-05`).

### El propietario es quien la crea

«La empresa que un vendedor da de alta es suya: es quien la trabaja», igual que
en el alta en línea. Reasignarla es de Gerencia (`Q-13`, `Q-14`) y se hace desde
«Editar cuenta», que ya valida que el destinatario opere en ese país.

### Un nombre repetido en el mismo país se rechaza, aunque no veas la existente

`crearOrganizacion` compara el nombre sin distinguir mayúsculas contra todas
las cuentas del país, **sin aplicar el alcance por rol**, y responde «Ya existe
una cuenta llamada … en México». Revela que la cuenta existe aunque la sesión
no la alcance. Es la misma decisión de §11.1 para el alta de oportunidad: el
duplicado partiría el histórico de la cuenta para siempre y la fuga del nombre
no cuesta nada comparable. Solo el nombre: nunca el propietario ni cifras.

El mismo nombre en otro país sí se permite: son carteras distintas (`AC-05`).

**Dónde vive:** `crearOrganizacion` en `lib/domain/contact.ts`.
**Costo de cambiarlo:** quitar la consulta `homonima`, o pasarla por
`withOrganizationScope` si se prefiere que solo detecte lo que la sesión ve.

### Agregar contacto desde Personas elige la empresa entre las que alcanzas

El formulario ofrece las cuentas que la sesión ya tiene en la otra pestaña,
filtradas en el cliente. Agregar gente exige alcanzar la cuenta (`Q-15`), así
que no tendría sentido ofrecer una que después el servidor va a rechazar. No se
crea la empresa desde ahí: para eso está el otro botón.

---

## 15. Módulo de usuarios (14 de septiembre de 2026)

Administración ganó la pestaña Usuarios: alta previa de perfiles por correo,
edición de rol, países y estado, y acceso para quien ya entró con Microsoft y
cayó en «sin acceso». Confirma la decisión del diseño §3.2 —el alta es un acto
administrativo, no hay autoaprovisionamiento— y le da pantalla. Cuatro cosas se
decidieron al construirlo.

### Permiso nuevo: `ADMINISTRAR_USUARIOS`

La tabla de §5.2 no tenía un permiso para esto y «editar catálogos» no lo
describe: un catálogo se desactiva, un usuario entra o no entra al sistema. Se
agregó a la matriz, concedido solo a `ADMINISTRADOR`, y se sembró en la base
como dato. Está en la tabla de §5.2 del spec.

### Nadie se quita a sí mismo el acceso ni el rol

Quien administra no puede desactivarse ni cambiar su propio rol. Es una regla
de seguridad operativa, no de negocio: evita que el último administrador se
cierre la puerta por accidente. Otro administrador sí puede hacerlo.

**Dónde vive:** `editarUsuario` en `lib/domain/usuario.ts`.

### Los correos se comparan sin distinguir mayúsculas

El vínculo del primer ingreso depende de que el correo del perfil y el que
devuelve Microsoft coincidan. Se guardan en minúsculas y se comparan sin
distinguir mayúsculas, en el alta y en `getSessionResult`.

### `entraObjectId` guarda el id de Supabase Auth, no el `oid` de Entra

Así estaba desde E0 y así sigue: es lo que `getSessionResult` compara con el
`sub` del token. El `oid` real de Entra llega en `custom_claims.oid` y no se
guarda. Renombrar la columna o guardar ambos es una decisión aparte; importa
solo si se va a cruzar con Graph o con nómina por object id.

**Dar acceso** a quien ya entró vincula ese id de una vez, y si ya existía un
perfil con el mismo correo sin vincular, lo reutiliza en vez de duplicarlo.

**Dónde vive:** `darAcceso` en `lib/domain/usuario.ts`; la lista de quienes
entraron sin perfil se lee de `auth.users` con la clave de servicio en
`lib/scope/usuarios.ts`.

---

## 16. Oficina activa, búsqueda global y menú contraído (14 de septiembre de 2026)

La barra superior ganó dos cosas que §13.5 pedía y no existían —el selector de
país operativo y el buscador— y la barra lateral aprendió a contraerse. Tres
decisiones se tomaron al construirlas.

### La oficina activa vive en una cookie, no en la URL

`INV-10` dice que el estado de los filtros vive en `searchParams`. La oficina
activa **no se trata como un filtro**, y esta es la excepción deliberada: es la
mesa desde la que se trabaja, no una pregunta sobre los datos. Ponerla en la URL
obligaba a arrastrar `?pais=CO` por cada enlace de la aplicación —los rubros del
menú, el logotipo, las tarjetas del kanban, los enlaces del buscador— y el
primero que se olvidara devolvía al usuario a México sin avisar. Una cookie
(`crm-oficina`, un año, `httpOnly`) sobrevive a cualquier enlace y a cerrar el
navegador, que es lo que uno espera de «estoy trabajando Colombia esta semana».

Lo que sí se mantiene de `INV-10` es el espíritu: la oficina **recorta dentro
del alcance del rol, nunca lo amplía** (`AC-25`). Se valida contra
`session.countryCodes` al escribirla y al leerla; una cookie manipulada con un
país que la sesión no alcanza se ignora y se cae al primero del alcance. Un
vendedor de México con la oficina puesta en Colombia ve el tablero, la lista
de cuentas y los contadores del menú **vacíos**, no llenos de datos ajenos.

Manda sobre P-01 (pipeline, política, tablero, tabla y las cuatro métricas
del encabezado, que antes sumaban todos los países mientras el tablero pintaba
uno), sobre P-07 (bandeja y agenda semanal, con la misma cláusula que el
contador de Actividades del menú, para que los dos digan lo mismo) y sobre los
contadores del menú. Una actividad sin oportunidad —de una cuenta, o suelta—
aparece en cualquier oficina, porque las cuentas no son de un país (§18); por lo
mismo, desde el 17 de septiembre **no manda sobre Contactos**. El detalle de
una oportunidad no la mira: se llega a él por enlace o por búsqueda, y ahí manda
el alcance del rol.

**Dónde vive:** `oficinaActiva` y `menuColapsado` en `lib/auth/session.ts`;
la acción `elegirOficinaAccion` en `app/(app)/acciones.ts`; los nombres de
cookie en `lib/preferencias.ts`.
**Costo de cambiarlo:** mover la oficina a `searchParams` es tocar cada
`<Link>` de la aplicación para que la conserve; un `Link` propio que la
agregue sería el mínimo.

### La búsqueda global mira todo el alcance, no solo la oficina activa

El buscador encuentra oportunidades, cuentas y personas de cualquier país que
la sesión alcance. Quien busca «Bancolombia» desde la oficina México quiere
encontrarla, no que le digan que no existe; el resultado de otro país lleva su
código al lado para que no sorprenda al abrirlo. Las cerradas también salen,
detrás de las abiertas y con su estado, porque un folio se busca justamente
cuando ya pasó.

Cinco por grupo, desde el segundo carácter, sin ranking: `contains` sin
distinguir mayúsculas sobre nombre, folio y cuenta. Es lo que hace falta para
llegar a algo que ya sabes cómo se llama; un buscador con pesos y sinónimos es
otra cosa y no está pedido.

**Dónde vive:** `buscarGlobal` en `lib/scope/busqueda.ts`, con los mismos
`withScope` de las pantallas (`INV-01`); la acción `buscarGlobalAccion` al lado
de la de oficina. No hay ficha de persona (P-05 no existe): una persona lleva a
la ficha de su empresa.

### El menú contraído se recuerda en una cookie que lee el servidor

El ancho de la barra lateral se guarda en `crm-menu` y el layout lo lee antes
de pintar, así que la barra ya nace de 64 o de 256 píxeles y no salta al
hidratar. La escribe el navegador con `document.cookie`, sin acción de
servidor: es una preferencia de pantalla, no un dato, y no merece una ida a la
base ni una revalidación. No es `httpOnly` por lo mismo.

---

## 17. Embudo, filtros y objetivos acumulativos (14 de septiembre de 2026)

P-01 ganó la vista de embudo y la barra de filtros de §9 —la deuda que `AC-23`
señalaba desde E0—, y P-08 existe por primera vez. Siete decisiones se tomaron
al construirlo; la primera es una **regla de negocio que no está en el spec**.

### Los objetivos se miden acumulados, no trimestre por trimestre

**Esto es nuevo.** §10.2 medía cada periodo por separado: cuota del trimestre
contra lo ganado en el trimestre. El negocio pidió otra cosa, con este ejemplo:

> «Si se establece un objetivo de 100 por trimestre y en el T1 no se vendió,
> pero en el T2 se vendió 200, eso cuenta para los 100 del T1 y los 100 del T2.»

Lo que se compara, entonces, es **acumulado contra acumulado**: la suma de las
cuotas del T1 al trimestre en curso contra la suma de lo ganado en ese mismo
tramo. Un trimestre flojo no se perdona, se arrastra; uno bueno lo paga. La
consecuencia visible es que la cifra grande de la pantalla es la del año a la
fecha, y que existe una cifra de **arrastre** —con cuánta deuda o cuánto
adelanto se entra al trimestre— que en el modelo anterior no tenía sentido.

La vista anual no acumula nada: el año **es** el periodo.

**Candidata a entrar al spec.** Cambia §10.2 y la lectura de `AC-29`.

**Dónde vive:** `computeCumulativeTrack` en `lib/domain/objectives.ts`, puro y
con pruebas. La pantalla solo lo pinta.
**Costo de cambiarlo:** volver al modelo por periodo es usar
`computePeriodProgress` con la cuota del trimestre en vez de la pista
acumulada. Las dos funciones ya existen y están probadas.

### La utilidad de la pantalla de objetivos depende de `VER_MARGEN`

`INV-02` dice que «el costo y la utilidad no se serializan para quien no tiene
`VER_COSTO`», y `VENDEDOR` no lo tiene. Pero §10.3 le promete ver su cuota de
utilidad, y el esquema le guarda una (`Objective.grossProfitQuota`). Las dos
cosas no pueden ser ciertas a la vez.

Se resolvió a favor de §10.3, con este razonamiento: lo que `INV-02` protege es
**el costo del proveedor**, y esta pantalla no muestra ningún costo ni ninguna
línea de cotización. Muestra la utilidad agregada de negocios que quien mira ya
ve uno por uno con su margen —`VENDEDOR` sí tiene `VER_MARGEN`—, y venta ×
margen **es** esa utilidad. Para un vendedor, la columna no revela nada que no
tuviera ya; para gerencia y dirección, que sí tienen `VER_COSTO`, la pregunta no
se plantea.

El conmutador Venta / Utilidad solo aparece con `VER_MARGEN`. Los permisos son
datos (`F-1005`): revocarlo quita la métrica sin tocar código.

**Dónde vive:** `puedeVerUtilidad` en `app/(app)/objetivos/page.tsx`.

### Fijar cuotas es `EDITAR_CATALOGOS`, no `VER_OBJETIVOS_EQUIPO`

Se evaluó usar `VER_OBJETIVOS_EQUIPO` —lo tienen gerencia y dirección— y se
descartó: un gerente de país podría fijar la cuota del equipo contra la que a él
lo miden. Queda en Administración, que es donde vive el resto de la
configuración.

Es probable que el negocio quiera que Dirección también pueda. Es un cambio de
matriz desde Administración, no de código.

**Dónde vive:** `fijarObjetivo` en `lib/domain/objetivo.ts`.

### La fila ANUAL no está protegida por la clave única

`@@unique([userId, fiscalYear, periodType, quarter])` **no impide dos objetivos
anuales** de la misma persona y el mismo año: ahí `quarter` es nulo, y en
Postgres `NULL` nunca es igual a `NULL`. Prisma lo delata al tipar la clave
compuesta con `quarter: number`.

`fijarObjetivo` busca y luego escribe dentro de la transacción, así que por la
aplicación no entran duplicados. El hueco sigue abierto para cualquier escritura
directa a la base.

**Costo de cerrarlo:** un índice parcial —`create unique index … on objectives
(user_id, fiscal_year) where quarter is null`— que Prisma todavía no sabe
expresar en el esquema. Sería la primera migración que vive solo en
`supabase/migrations/` y no en `schema.prisma`, y esa divergencia es la razón de
no haberlo hecho sin consultarlo. La otra salida es guardar `quarter = 0` en las
anuales, que cambia el significado de la columna y obliga a migrar los datos.

### La tasa de paso del embudo se mide con movimientos, no con inventario

La barra de cada etapa es **valor abierto**: cuánto dinero está parado ahí. La
línea de abajo es la **tasa de paso**: de las oportunidades que entraron a la
etapa anterior en los últimos 90 días, cuántas llegaron a esta o más lejos, leído
de `StageTransition`.

Son cifras de naturaleza distinta a propósito. Dividir el valor de una etapa
entre el de la anterior —el error clásico— da porcentajes por encima del 100 %
que no significan nada: una etapa puede tener más dinero que la previa solo
porque ahí se juntaron los negocios grandes.

Saltarse una etapa cuenta como haberla pasado. Sin nadie en el denominador, la
tasa es **nula**, no cero: cero sería una afirmación sobre el equipo.

**La entrada a la primera etapa se reconstruye.** El historial guarda
movimientos, y el alta no lo es: una oportunidad nace en una etapa sin que nadie
la mueva. Se deduce de la etapa `fromStage` de su primera transición —de ahí
venía— o, si nunca se movió, de la etapa donde sigue; la fecha es la de creación.
Sin eso, el denominador de la segunda etapa sería siempre cero.

Los 90 días no son un umbral de negocio (`INV-05`): nada cambia de veredicto al
moverlos. Es el tamaño de la muestra.

**Dónde vive:** `buildFunnel` en `lib/domain/funnel.ts` y `historiasDeEtapas` en
`lib/scope/funnel.ts`.

### «Solo en riesgo» es el único filtro que no viaja al SQL

§9.1 pide que los filtros se apliquen en la consulta, «nunca en memoria después
de traer todo». `atRisk` no puede: las banderas se calculan y no se guardan
(`INV-11`), así que no hay columna que consultar. El recorte ocurre en la
pantalla, **después** del alcance y de los demás filtros, así que sigue sin
poder ampliar nada (`AC-25`).

Los filtros `risk`, `stage`, `status`, `forecast`, `amount` y `meddic` ya se
parseaban y no tienen control en la barra todavía: la barra ofrece cliente,
vendedor, lapso, pipeline y «solo en riesgo», que es lo que se pidió. Agregar
los demás es agregar pastillas, no lógica.

### La cobertura reemplazó al piso de margen en el encabezado de P-01

El piso de margen ya se ve donde decide algo: en cada tarjeta, verde o coral
(§13.1). Repetirlo como indicador gastaba uno de los cinco lugares en un número
que no cambia nunca. En su lugar va la **cobertura** —pipeline del trimestre
sobre la brecha acumulada contra la cuota—, que no se veía en ningún otro lado y
que ahora existe porque existen los objetivos. Sin cuota fijada dice «—» y «sin
cuota fijada para el año», nunca un cero.

---

## 18. Las cuentas no son de un país (17 de septiembre de 2026)

**Decisión del negocio, revisada en uso.** El spec y la construcción de E0 daban
por hecho que una organización pertenece a un país y solo se ve desde él
(`AC-05` aplicado a cuentas, §5.3). Se probó y no resultó conveniente: una
misma empresa —Bancolombia, Cemex, un integrador regional— se atiende desde
varias oficinas y se le venden oportunidades en más de un país. Esconderla por
país producía duplicados y cuentas que nadie encontraba.

### La cuenta es una sola para toda la operación

Gerencia, Dirección y Administración ven **todas** las cuentas. Un vendedor
sigue viendo las suyas —donde es propietario o tiene una oportunidad— porque
esa regla es de propiedad, no de país (`RN-31`, §5.3), y no cambió.

El país sigue existiendo donde sí decide algo: en las **oportunidades**. El
alcance por oficina, la oficina activa de la barra superior, la política
comercial, el impuesto de la cotización y a quién se puede reasignar siguen
leyendo el país de la oportunidad, que es **el del pipeline elegido**. Antes se
tomaba de la cuenta; ahora una cuenta con sede en Chile puede tener una
oportunidad en el pipeline de México y otra en el de Colombia. Lo que sí se
sigue exigiendo es que quien crea la oportunidad opere en el país del pipeline
(`AC-05`).

**Dónde vive:** `organizationScope` en `lib/scope/organizations.ts`;
`crearOportunidad` en `lib/domain/opportunity.ts` (el país sale de
`pipeline.countryCode`); `actividadEnOficina` en `lib/scope/activities.ts` (una
actividad sin oportunidad aparece en toda oficina).

### El país de la cuenta se vuelve «sede», opcional e informativa

La columna `organizations.country_code` **no se borra**: los datos existentes lo
tienen y saber dónde está la sede de una empresa sigue siendo útil. Pasa a ser
opcional (migración `20260917120000_organizaciones_sin_pais`), se puede elegir
cualquiera de los tres países —o ninguno— al crear y al editar, y no recorta
nada. En pantalla se muestra como «Sede en México», solo si existe.

**Costo de cambiarlo:** volver a la regla por país es devolver el `countryCode:
{ in: session.countryCodes }` al alcance del gerente y a
`buscarOrganizacionesParaAlta`, y devolver la comprobación de que la sede está
entre los países de la sesión en `crearOrganizacion`.

### El identificador fiscal lleva un nombre genérico

Antes el campo se llamaba RFC, NIT o RUT según el país de la cuenta. Sin país
que lo decida, se llama **Identificador fiscal** en el formulario y en la ficha,
con la ayuda «RFC, NIT o RUT, según dónde facture la empresa». Una cuenta con
sede en Chile puede facturar con RFC en México; el nombre del campo no tiene por
qué adivinarlo.

### El homónimo se rechaza en cualquier país

La regla de §14 —mismo nombre en el mismo país se rechaza, en otro país se
permite— pierde la segunda mitad: si la cuenta es una sola para toda la
operación, «Bancolombia» con sede en Colombia y «Bancolombia» con sede en México
son la misma empresa partida en dos. `crearOrganizacion` busca el nombre sin
distinguir mayúsculas en todas las cuentas vivas, sin mirar la sede ni el
alcance, y responde «Ya existe una cuenta llamada …». Sigue sin revelar de quién
es.

**Lo que no se hizo:** un índice único en la base sobre el nombre en minúsculas
cerraría el hueco de dos altas simultáneas, pero Prisma no sabe expresar un
índice sobre una expresión, y sería una migración que vive solo en Supabase.
Misma razón que la fila anual de objetivos (§17): se anota, no se improvisa.

### Reasignar una cuenta ya no exige país

«Editar cuenta» ofrece cualquier usuario activo como propietario. La regla
`Q-14` —el destinatario debe operar en el país— queda solo para las
oportunidades, que sí lo tienen.

### Lo que esto cambia en el spec

`AC-05` («un usuario no ve datos de un país que no opera») sigue valiendo para
oportunidades, actividades y objetivos; deja de aplicar a cuentas y personas.
§5.3 (alcance de organizaciones por país para el gerente) queda superado. El
catálogo del negocio (`listado-funcionalidades-mvp-v2.md`, `AV-201`) hablaba de
«datos fiscales por país»; el campo existe, con nombre genérico.

---

## 19. La actividad se agenda, y la pregunta de §12.4 se hace cuando toca (22 de septiembre de 2026)

**Lo que reportó el negocio.** Que el formulario de actividades del detalle era
confuso, y sobre todo el tener que declarar un «siguiente paso» aparte cada vez.
Además borraba lo capturado cuando faltaba un campo, igual que el alta de
oportunidad antes del 18 de septiembre.

### La actividad nace por hacer

El formulario ya no es «registra lo que pasó y, de paso, agenda lo que sigue».
Es un composer de actividad: tipo, asunto, cuándo, notas, y una casilla
**«Marcar como hecha»** en el pie. Sin marcarla, la actividad queda **agendada**,
que es lo que el equipo hace la mayor parte del tiempo. El campo «Resultado»
solo aparece al marcarla: lo que salió de una conversación no se puede escribir
antes de tenerla.

Es la forma de la herramienta que el equipo venía usando, y eso es deliberado:
la captura de actividad es el hábito que decide si el CRM se adopta (§12.4), y
no es donde conviene que aprendan una mecánica nueva.

### Regla nueva, que no está en el spec

§12.4 dice: «una actividad que se completa sin agendar la siguiente **DEBE**
preguntar de forma explícita si se cierra sin seguimiento». La implementación
preguntaba **siempre** que no se llenara el siguiente paso. Ahora pregunta solo
cuando la oportunidad se queda de verdad sin nada pendiente:

- Si la actividad queda **por hacer**, ella misma es el próximo paso.
- Si la oportunidad **ya tenía** algo agendado, tampoco se queda sin él.
- Si se marca hecha y no queda nada, la pregunta sale como hasta ahora:
  `CONFIRMACION`, sin escribir nada, y se responde en el mismo formulario.

Es más fiel a la letra del DEBE —habla de quedarse sin siguiente— y quita el
regaño en los dos casos donde el dato ya estaba. **Candidata a entrar al spec.**

**Efecto de lado, buscado:** `lastActivityAt` solo avanza con actividades
hechas. Agendar una reunión para octubre no puede apagar la bandera de «sin
actividad reciente» con una promesa.

### Los tipos, en botones

Los seis tipos con dibujo —llamada, reunión, videollamada, correo, visita,
seguimiento— son botones; los otros siete del catálogo viven en «Otro…». El
mapa es por nombre y con hueco: Administración puede renombrar un tipo y lo
único que pasa es que se va al desplegable. Elegir el tipo **sugiere el asunto**
con su nombre, y no lo pisa si ya escribiste el tuyo.

### Edición rápida en la ficha

Los cinco datos de «Datos de la oportunidad» que se corrigen solos —tipo de
negocio, pronóstico, cierre estimado, origen y propietario— se editan en su
lugar: se pulsa, se elige, se guardó. Mover el cierre una semana costaba abrir
un formulario de nueve campos y guardar los nueve.

La lista de campos editables es **cerrada** (`lib/domain/opportunityField.ts`):
el nombre del campo llega del cliente, y sin lista bastaría cambiarlo en el
navegador para escribir en algo que la pantalla nunca ofreció. Todo lo demás
—autorización, `RN-29`, `INV-06`— sigue decidiéndose en `editarOportunidad`.

El nombre, el importe y la persona principal **no** están ahí: se escriben
mirando el resto del formulario, y para eso sigue el panel «Editar» del
encabezado.

---

## 20. Actividades con hora de inicio y fin, responsable y calendario de Microsoft 365 (22 de septiembre de 2026)

**Lo que pidió el negocio.** Hora de inicio y de fin en la actividad, como en la
herramienta anterior; que la actividad se agende en el calendario de Microsoft
365 de un usuario elegible; y poder editar una actividad ya creada.

### Las horas son de pared, en la zona del país de la oportunidad

`startsAt` es un instante y `durationMin` la duración: no hubo migración. Entre
la hora que se teclea y el instante hace falta una zona, y la que se usa es la
del **país de la oportunidad** (`Country.timezone`, ya en la base). La etiqueta
del formulario lo dice —«Hora de Ciudad de México»— y la pestaña, la agenda y
el calendario leen en esa misma zona.

**Defecto que esto corrige.** Hasta hoy la hora se interpretaba en la zona del
**servidor** y se mostraba en UTC. En Vercel, que corre en UTC, una llamada
capturada a las 10:30 en México se guardaba a las 10:30Z y se leía como 10:30 en
la agenda: coincidía por casualidad, pero era falso, y cualquier cálculo con la
hora real la habría corrido seis horas. La agenda semanal agrupaba por día UTC:
una reunión a las 22:00 en CDMX caía en el día siguiente.

**Por qué no la zona del navegador.** Sería la de quien captura, no la de la
reunión; se perdería al renderizar en el servidor; y una directora en México
leyendo una oportunidad chilena vería «10:30» sin saber de quién. La zona de la
oportunidad es una sola, se conoce con certeza y es la que el cliente entiende.

### El responsable

Un desplegable fija de quién es la actividad (`userId`) y en cuyo calendario se
agenda. Cualquier usuario activo que opere en el país de la oportunidad es
elegible; **no hay puerta por rol**. Asignarle una demostración a preventa es
coordinar, no transferir la oportunidad, así que `Q-13` (reasignar es de
Gerencia) no aplica. **Regla nueva, candidata a confirmar con el negocio.**

### Calendario de Microsoft 365 · F-605

- **Flujo de aplicación (client credentials), no delegado.** El inicio de sesión
  pasa por Supabase Auth, que entrega el token de Entra una vez y no lo renueva;
  y un token delegado solo escribe en el calendario de quien lo obtuvo. Agendar
  en el calendario de **otra** persona exige un permiso de aplicación.
- **Permisos.** `Calendars.ReadWrite` como *Application permission*, con
  consentimiento de administrador. `OnlineMeetings.ReadWrite` **no hace falta**:
  la videollamada se crea marcando el evento como reunión de Teams
  (`isOnlineMeeting`), y Graph genera el enlace.
- **Variables.** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
  Sin ellas, el CRM no toca el calendario y nada más cambia.
- **Qué se sincroniza.** Solo las actividades **por hacer**: las hechas son
  historia. El evento vive en el calendario del responsable
  (`/users/{correo}/events`), su id queda en `externalEventId`, editar lo
  actualiza y cambiar de responsable lo mueve de un calendario a otro. Al
  marcarla hecha, el evento se queda: ya ocurrió.
- **Nunca manda.** La actividad se escribe primero, en su transacción; el
  calendario va después. Si Graph falla, la actividad existe y el aviso lo dice.
  El calendario entra al dominio por parámetro, y las pruebas le pasan uno falso.
- **Se usa el correo, no `entraObjectId`.** Ese campo guarda hoy el id de
  Supabase Auth (§15); el UPN es el correo.

**Lo que no se verificó.** La llamada real a Graph: no hay secreto en el repo
ni acceso al tenant. Queda construida y apagada hasta que existan las variables.
Al encenderla conviene probar con una actividad de prueba y revisar que el
evento aparezca en el calendario del responsable elegido.

### Editar una actividad

El lápiz de cada fila abre el mismo composer con los datos cargados. La última
y la próxima actividad de la oportunidad se **recalculan desde la base** (al
registrar «solo avanzan»; al editar puede haber que retroceder). Completar la
última pendiente dispara la misma pregunta de §12.4 que al registrar.

---

## 21. Una sola cotización, editable, con bitácora · INV-06 enmendado (22 de septiembre de 2026)

**Lo que pidió el negocio.** Quitar el versionado de la cotización: una sola por
oportunidad, que se corrija en su lugar, y que cada cambio quede en la
bitácora. Cantidad, precio, descuento y costo editables; al agregar del
catálogo, precio y costo como referencia y no como imposición. Y corregir que
editar cantidad o descuento «no actualizaba» la cotización.

### Qué decía INV-06 y qué dice ahora

**Antes:** «una cotización congelada es inmutable; editar es versión nueva».
Congelar espejaba el neto y el margen en la oportunidad; la congelada gateaba
etapas, cuadraba hitos y fijaba el importe.

**Ahora:** **una cotización por oportunidad, editable mientras la oportunidad
está abierta. Cada cambio de línea escribe en `AuditLog` (`EDITAR_COTIZACION`)
el neto antes y después y qué línea y campo cambiaron, en la misma transacción
(INV-09). El espejo en la oportunidad —`amount`, `grossMargin`— se escribe en
cada cambio.** Con cero líneas, la oportunidad vuelve a valer su estimado y su
margen queda en blanco: una cotización vacía no dice nada.

La trazabilidad que INV-06 protegía no se pierde; cambia de forma. Con versiones
se sabía qué se ofreció en cada momento; con la bitácora se sabe **quién cambió
qué y cuándo**, que es lo que el negocio dijo necesitar.

**Es un cambio al contrato, decidido por el negocio y anotado en `CLAUDE.md`.**
El spec (`docs/CRM-AVTR-SPEC.md` §3) sigue diciendo lo anterior hasta que se
actualice; manda este documento.

### Lo que se toca y lo que no

- `Quote.version`, `status`, `frozenAt`, `frozenById` siguen en la base **sin
  uso**. No hubo migración: los datos anteriores quedan, y la cotización vigente
  es la de mayor versión, sin importar su estatus. Las versiones viejas son
  historia que nadie lee.
- El requisito de etapa `COTIZACION_CONGELADA` **se sigue llamando así en los
  datos** (`Stage.gateRequires`), pero significa «hay cotización con al menos
  una línea». Se renombró el campo del contexto (`tieneCotizacion`) y el mensaje;
  renombrar la clave sería una migración de datos para nada.
- Los hitos (RN-06) cuadran contra el neto de la cotización con líneas.
- `EditarOportunidad` bloquea el importe estimado cuando hay cotización con
  líneas, como antes con la congelada.
- El piso del SKU (RN-08) aplica al precio que quede, también al editar.

### El defecto que se corrigió

La celda de cantidad o descuento mandaba la línea **sin `productId`**; el
servidor la tomaba por concepto libre y la rechazaba por falta de descripción; y
la pantalla no mostraba ese rechazo. Parecía que «no actualizaba». Ahora editar
una línea es su propia operación (`editarLinea`): relee la línea en la base,
cambia solo el campo que llegó y avisa cuando el servidor rechaza.

### Precio y costo al agregar

Del catálogo, precio y costo **llenan** los campos al elegir el producto y se
pueden corregir antes de guardar. El costo solo aparece y solo se acepta con
`VER_COSTO`, al agregar y al editar: probar costos hasta que el margen cuadre es
deducirlo (§9.2, INV-02).

### La bitácora

Una lectura, no una tabla nueva: se arma desde las transiciones de etapa, la
auditoría de la oportunidad y de su cotización, las actividades **hechas** y el
alta. `editarOportunidad` empieza a auditar el cambio de cierre estimado
(`CAMBIAR_CIERRE_ESTIMADO`), porque es lo que más explica, meses después, por
qué un trimestre no cerró. Los filtros viven en la URL (INV-10). Sin `VER_COSTO`,
un cambio de costo se nombra pero no se cifra (INV-02).

### MEDDIC

Cada componente lleva una explicación de una línea debajo del nombre
(`DESCRIPCION_COMPONENTE`). Los cuatro estados son botones en la fila: «No
evaluado» y «Ausente» guardan al pulsar; «Parcial» y «Confirmado» también si ya
hay evidencia (y persona cuando aplica), y si no, abren el panel con ese estado
elegido. RN-30 no se relaja: se le quita el clic de más cuando ya se cumplía.

### Editar y Guardar, no guardar por celda (misma tarde)

La primera versión guardaba cada celda al salir del campo y anotaba una entrada
por campo. El negocio pidió un botón «Editar» y uno «Guardar», y que la
bitácora se escriba **solo al guardar y solo si algo cambió de valor**. Tiene
razón: corregir tres celdas es un cambio, no tres, y abrir la edición para
mirar no es nada.

- La tabla se lee. «Editar» abre las celdas; «Guardar cambios» manda todas en
  un viaje. Mientras se edita, agregar y quitar líneas se ocultan: mezclar
  cambios inmediatos con pendientes es cómo se pierde lo tecleado.
- El servidor compara cada campo con lo guardado (`guardarCambiosDeCotizacion`)
  y aplica solo lo distinto. Cero cambios: no escribe nada y devuelve
  `cambios: 0`; la pantalla dice «Sin cambios».
- **Una entrada por guardado**, con `after.lineas`: cada línea y campo, de qué
  a qué. Agregar y quitar línea siguen inmediatos y con su propia entrada,
  porque cambian el valor por definición.
- Todo o nada: un precio bajo el piso del SKU rechaza el guardado entero.

## 22. Productos sin lista, y los hitos no rebasan el neto (22 de septiembre de 2026)

Dos pedidos del negocio de la misma tarde. Ninguno está en el spec; los dos cambian una regla
que el código daba por sentada.

### Un producto puede existir sin precio de lista ni costo estándar

Hay servicios cuyo precio y costo se fijan en cada oportunidad. Hasta hoy, `crearProducto`
exigía ambos y abría la primera vigencia al crear.

- **Sin migración.** La ausencia de `PriceListEntry` ya es el estado: un producto sin lista es
  un producto sin vigencias. `Product.costUpdatedAt` queda `null` hasta que se capture un costo.
- **Precio y costo van juntos o no van.** El piso RN-08 se deriva de los dos
  (`costo ÷ (1 − piso)`, topado a lista); una lista con uno solo no significa nada. Uno sin el
  otro se rechaza con `VALIDACION` en el campo que falta.
- **Al cotizar**, el producto aparece marcado «sin lista»; precio y costo llegan vacíos y se
  fijan para esa oportunidad, obligatorios los dos, igual que el concepto libre de Q-07. **No hay
  piso de SKU** (no hay lista de la que derivarlo); RN-05 sigue señalando el margen de la línea.
  Quien no tiene `VER_COSTO` no puede capturar el costo, así que tampoco puede agregar la línea:
  es el mismo límite que ya tenía el concepto libre.
- **Editar** un producto sin lista con precio y costo abre su primera vigencia desde hoy. Dejar
  los dos vacíos al editar no toca la lista existente: quitar una lista no está previsto, y hacerlo
  por omisión de campos sería peligroso.

Dónde vive: `lib/domain/product.ts` (`validarPrecios` acepta el par vacío),
`lib/domain/quoteService.ts` (`guardarLinea` sin `precio`), `app/(app)/productos/acciones.ts`
(`importeOpcional`), `EditarProducto`, `TablaDeCotizacion`. Pruebas en
`tests/integracion/productos-edicion.test.ts` y `cotizacion.test.ts`.

### La suma de hitos no supera el neto

`cuadreDeHitos` (RN-06) sabía decir «sobran $200,000», pero nada impedía guardar ese estado. El
negocio pidió que no se pueda capturar más del 100 %.

- **Al guardar** (crear o editar), `topeDeHitos` compara la suma de los demás hitos más el nuevo
  contra el neto de la cotización con líneas. Si se pasa, `VALIDACION` en `amount` con las tres
  cifras: lo que sumarían, cuánto de más y contra qué neto. Al editar, el monto anterior del hito
  no cuenta.
- **Sin cotización con líneas no hay tope**: no hay contra qué comparar. Capturar en monto sigue
  permitido, como antes; capturar en porcentaje no, porque no hay neto que porcentuar.
- **«Sobran» sigue existiendo** en el cuadre: aparece solo si la cotización bajó después de
  capturar los hitos. Es justo el aviso que §4 quería conservar al guardar montos y no
  porcentajes.
- **La conversión de % a monto pasa al servidor**, con `Decimal` (INV-03). Antes la hacía el
  navegador con `number` antes de enviar.
- **El panel muestra el neto**: neto a repartir, ya asignado (o «en los otros hitos», al editar) y
  por asignar, con «Usar lo que falta». Era lo que faltaba para repartir sin adivinar.

Dónde vive: `lib/domain/milestone.ts` (`topeDeHitos`, puro, con tests),
`lib/domain/milestoneService.ts` (`guardarHito` con `modo`), `tabs.acciones.ts`, `PanelHitos`.
Pruebas en `lib/domain/milestone.test.ts` y `tests/integracion/meddic-hitos.test.ts`.

## 23. La cotización se recalcula al teclear, y «Ganado» en el encabezado (23 de septiembre de 2026)

### Aritmética de dinero en el navegador, con la misma librería

INV-03 dice «con `Decimal`, nunca con `number`», y hasta hoy el navegador no calculaba dinero:
cada cifra de la cotización llegaba formateada del servidor. El negocio pidió que, al editar,
neto, importe, utilidad, margen y totales se muevan **mientras se teclea**, no al guardar.

- `lib/domain/quote.ts` no puede correr en el cliente: `lib/money` es `Prisma.Decimal` y
  `components/**` no alcanza `@prisma/client`. Y repetir RN-07 con `number` pintaría el margen
  del color equivocado justo en el borde del piso, que es la señal más importante de la
  interfaz (§13.1).
- Por eso `components/cotizacion/calculoEnVivo.ts` repite las fórmulas con **`decimal.js`**, la
  misma librería que Prisma empaqueta, agregada como dependencia directa. Una **prueba de
  paridad** (`calculoEnVivo.test.ts`) compara, cadena por cadena, lo que el módulo formatea
  contra lo que el dominio calcula sobre las mismas líneas: si un día divergen, falla.
- **Lo guardado sigue siendo del servidor.** La vista previa no manda nada; «Guardar cambios»
  manda las celdas y el servidor recalcula con `Prisma.Decimal` (§21).
- Sin `VER_COSTO` no llega el costo (INV-02) y no se anticipan utilidad, margen ni piso: se
  muestran los guardados, atenuados, con «se recalcula al guardar». Adivinarlos sería mentir.
- **Agregar y quitar líneas viven solo en modo edición.** Son cambios de la cotización, y la
  cotización se cambia editando. Siguen siendo inmediatos, con su propia entrada en la bitácora;
  lo tecleado en otras celdas sobrevive porque el formulario no se remonta al agregar.

Dónde vive: `calculoEnVivo.ts`, `estadoDeEdicion.ts` (reductor: modo, generación, borrador),
`TablaDeCotizacion`, y `enVivo` desde `app/(app)/oportunidades/[id]/page.tsx`.

### «Ganado» donde estaba «Cobertura»

El negocio pidió ver el valor de las ganadas en el encabezado del pipeline, en la tarjeta que
ocupaba «Cobertura».

- **Ganado** = suma y conteo de las `GANADA` con `actualCloseDate` dentro del **año fiscal en
  curso**, sobre el mismo conjunto acotado que las demás tarjetas (alcance por rol, oficina y
  filtros de la URL): para un vendedor, lo suyo. Año fiscal y no trimestre porque la cuota se
  mide acumulada (§17); cambiarlo a trimestre es una línea (`ESTE_TRIMESTRE`).
- Una `GANADA` sin cierre real no cuenta: es un dato roto, no un cero.
- El selector de tarjeta (`opportunityCardSelect`) ahora trae `actualCloseDate`; el detalle lo
  hereda. El encabezado dejó de leer `avanceDeObjetivos`: una consulta menos por carga.
- La cobertura contra la cuota **no desaparece del sistema**: sigue en Objetivos (P-08), que es
  donde se decide sobre ella.

Dónde vive: `wonInPeriod` en `lib/domain/pipeline.ts` (puro, con tests) e `Indicadores` en
`app/(app)/oportunidades/page.tsx`.

## 24. La evidencia MEDDIC se señala, no se exige · RN-30 enmendada (23 de septiembre de 2026)

RN-30 decía: «un componente en `PARCIAL` o `CONFIRMADO` exige evidencia no vacía». `AC-13` lo
probaba: marcar parcial con evidencia vacía fallaba. El negocio pidió quitar el candado: quien
califica muchas veces sabe la respuesta antes de tener dónde apuntarla, y el bloqueo hacía que
se dejara de calificar.

- **Lo que cambia.** `validarComponente` ya no rechaza por evidencia vacía; `guardarComponenteMeddic`
  guarda `evidence = null`. `puedeCalificarDirecto` deja pasar parcial y confirmado sin evidencia:
  los cuatro estados se marcan al pulsar.
- **Lo que no cambia.** La persona ligada para confirmar al decisor económico y al campeón (§2.1)
  sigue siendo obligatoria: sin ella no hay a quién preguntarle. Los mínimos MEDDIC para cierre,
  ganada y «Compromiso» siguen gateando igual (§2.1).
- **Lo que lo sustituye.** `faltaEvidencia` (puro, con tests) es lo que la pantalla señala: marca
  ámbar «⚠ Sin evidencia» junto al estado y, arriba, «N calificados sin evidencia». El botón
  «Evidencia» no cambia de texto ni de aspecto (pedido del negocio): la señal es la marca. Sin evidencia el puntaje es una opinión; en vez de impedirla, se hace visible.
- **Riesgo asumido.** El puntaje MEDDIC puede llegar al mínimo de cierre o de ganada con
  componentes sin evidencia. Si el negocio quiere que la evidencia vuelva a contar en esas
  compuertas —por ejemplo, no ganar con componentes sin evidencia—, el lugar es
  `componentesFaltantesParaGanar`, no la validación por componente.
- El spec §3 (tabla de `MeddicComponentAssessment`, RN-30 y AC-13) sigue con la redacción vieja:
  actualizarlo.

Dónde vive: `lib/domain/meddic.ts` (`validarComponente`, `faltaEvidencia`, `puedeCalificarDirecto`),
`lib/domain/meddicService.ts`, `PanelMeddic`. Pruebas en `lib/domain/meddic.test.ts` y
`tests/integracion/meddic-hitos.test.ts`.

### Anotaciones fuera del alta de línea (misma tarde)

Las anotaciones «de la lista» y «por oportunidad» a la derecha de precio y costo unitario en
«Agregar línea» comprimían el campo hasta esconder la cifra. Se quitaron: el subtítulo del panel
ya dice de dónde vienen precio y costo, y el campo vuelve a su ancho.
