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
