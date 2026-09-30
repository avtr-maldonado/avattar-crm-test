# Funcionalidades y casos de uso · CRM Avattar

Actualizado el 17 de septiembre de 2026, leído del código y no del spec: lo que aquí
dice «construido» se puede abrir hoy en `https://avattar-crm-test.vercel.app`.

Complementa, no reemplaza, a `docs/CRM-AVTR-SPEC.md` (qué se pidió) y a
`docs/listado-funcionalidades-mvp-v2.md` (el catálogo del negocio). Cuando una regla
diverge del spec, se cita la sección de `docs/decisiones-pendientes.md` que lo razona.

## Cómo leer este documento

- Cada **funcionalidad** (`F-nn`) dice qué hace, para quién y en qué pantalla del spec vive (`P-nn`).
- Cada funcionalidad trae sus **casos de uso** (`CU-nn.n`) en una tabla: quién, qué pasa y qué resulta,
  con las excepciones en la misma fila.
- Las reglas se citan con el código del spec (`RN`, `AC`, `INV`, `Q`) para poder rastrearlas.
- Estado: **construido** salvo que la fila diga lo contrario. La última sección lista lo pendiente.

## Actores

El eje del sistema es el **alcance por rol**: el rol define qué se puede hacer, la oficina define
sobre qué datos (`RN-14`). Toda lectura pasa por ese alcance antes que por cualquier filtro
(`INV-01`, `AC-25`).

| Rol | Alcance de datos | Lo que cambia en pantalla |
|---|---|---|
| **Vendedor** | Sus oportunidades (donde es propietario, no creador · `RN-31`, `Q-01`), sus actividades, su renglón de objetivos, las cuentas donde es propietario o tiene una oportunidad propia | Ve margen, **no ve costo ni utilidad de cotización** (`INV-02`). No se le ofrece el filtro «Vendedor» (`AC-24`). No entra a Análisis (403). Sus indicadores se calculan solo sobre lo suyo (§2.3) |
| **Preventa** | Las oportunidades donde está asignado como apoyo técnico (`Q-03`) | Igual que Vendedor en permisos |
| **Gerente de país** | Las oportunidades, actividades y objetivos de su oficina (puede llevar más de un país) y **todas las cuentas y personas** (§18) | Ve costo y utilidad, tabla de objetivos del equipo, Análisis; puede asignar propietario al crear y reasignar |
| **Dirección** | Los tres países | Lo del gerente, más la pestaña de política comercial en Administración |
| **Administración** | Los tres países | Todo lo anterior, más editar catálogos, fijar objetivos y administrar usuarios |

Los permisos son **datos** (`F-1005`): la matriz se ve en Administración › Roles y permisos y se
puede cambiar en la base sin desplegar. Los códigos que gobiernan lo anterior:
`VER_OPORTUNIDADES_OFICINA`, `VER_MARGEN`, `VER_COSTO`, `VER_OBJETIVOS_EQUIPO`, `VER_ANALISIS`,
`EDITAR_CATALOGOS`, `EDITAR_POLITICA_COMERCIAL`, `ADMINISTRAR_USUARIOS`.

## Reglas que atraviesan todo

| Regla | Qué significa para quien usa el sistema |
|---|---|
| Alcance antes que filtro (`INV-01`, `AC-25`) | Un filtro nunca muestra más de lo que el rol alcanza. Pegar en la URL el id de otro vendedor devuelve cero resultados, no los suyos |
| Las cuentas no son de un país (§18) | El país vive en la oportunidad y lo pone el pipeline. Una cuenta se ve desde todas las oficinas y se le vende en cualquier país; su sede es un dato informativo |
| El costo no sale del servidor (`INV-02`) | Quien no tiene `VER_COSTO` no recibe costo ni utilidad en ninguna respuesta; no es que la pantalla lo oculte |
| Los filtros viven en la URL (`INV-10`) | Una vista filtrada se pega en un correo y el botón de regresar funciona. La **oficina activa** es la excepción: es una cookie, porque es la mesa desde la que se trabaja, no un filtro (§16) |
| Nada se borra en duro (`INV-15`) | Organizaciones, personas, oportunidades, actividades y usuarios se desactivan o se marcan borrados. Documentos e hitos sí se borran, a propósito (`Q-16`) |
| Bitácora en la misma transacción (`INV-09`) | Crear y editar usuarios, y fijar objetivos, dejan quién, cuándo, antes y después. Si la bitácora falla, la operación falla |
| Umbrales en la base (`INV-05`) | Mínimos MEDDIC, días para estancada, impuesto y probabilidad por etapa se leen de la configuración, nunca del código |
| Dinero en USD (`D-A`) | Todo importe es USD con cuatro decimales. No hay tipo de cambio |

---

## 1. Acceso y sesión

### F-01 · Iniciar sesión con Microsoft

Entra ID a través de Supabase Auth. **El alta es administrativa**: nadie entra por primera vez sin
que Administración haya creado su perfil o le haya dado acceso (diseño §3.2).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-01.1 Primer ingreso con perfil precargado | Cualquier rol | Administración ya creó el perfil con su correo. Entra con Microsoft | El CRM vincula el perfil con su identidad de Microsoft (comparando el correo sin distinguir mayúsculas, §15) y lo lleva al pipeline. De ahí en adelante el vínculo es por identidad, no por correo |
| CU-01.2 Ingreso sin perfil | Persona de Avattar sin alta | Entra con Microsoft correctamente, pero ningún perfil tiene su correo | Cae en **Acceso no configurado**, que le explica que el alta la hace Administración. Su ingreso queda registrado y aparece en Administración › Usuarios para que le den acceso (F-36) |
| CU-01.3 Usuario desactivado | Perfil con `active = false` | Entra con Microsoft | La sesión exige perfil activo: cae en Acceso no configurado |
| CU-01.4 Microsoft o la base fallan | Cualquiera | Microsoft devuelve error, o el CRM no puede consultar su base al vincular | Vuelve a la pantalla de login con la causa concreta escrita. Nunca un 500 en blanco |
| CU-01.5 Ruta protegida sin sesión | Cualquiera | Abre `/oportunidades` sin sesión | Redirige a `/login`; al entrar, regresa a donde iba |

### F-02 · Cerrar sesión

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-02.1 Cerrar sesión | Cualquier rol | Pulsa su nombre en la barra superior y «Cerrar sesión» | Se cierra la sesión **del CRM**. La de Microsoft sigue abierta en el navegador |

### F-03 · Elegir la oficina activa

Solo aparece si el rol alcanza más de un país. Manda sobre el pipeline, actividades, objetivos
y los contadores del menú; no sobre contactos, porque las cuentas no son de un país (§18).
**Recorta dentro del alcance, nunca lo amplía** (§16).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-03.1 Cambiar de oficina | Gerente con varios países, Dirección, Administración | Pulsa MX, CO o CL en la barra superior | La preferencia se guarda un año; el pipeline, las actividades, los objetivos y los contadores releen con esa oficina. Contactos, el detalle de una oportunidad y el buscador no la miran: las cuentas no son de un país (§18) y en el detalle manda el alcance completo |
| CU-03.2 Un solo país | Vendedor, gerente de un país | — | El selector no se pinta: no hay nada que elegir |
| CU-03.3 Oficina fuera del alcance | Quien manipule la cookie | Pone un país que su rol no alcanza | Se ignora y se cae al primer país del alcance. Un vendedor de México con la oficina en Colombia vería pantallas vacías, no datos ajenos |

### F-04 · Buscar en todo el CRM

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-04.1 Buscar por nombre, folio o cuenta | Cualquier rol | Escribe dos o más caracteres en la barra superior (o pulsa Ctrl K / ⌘ K) | Hasta cinco oportunidades, cinco cuentas y cinco personas **dentro de su alcance**, de cualquier oficina. Las cerradas salen después de las abiertas, con su estado. Un resultado de otra oficina lleva su país al lado |
| CU-04.2 Abrir un resultado | Cualquier rol | Flechas y Enter, o clic | Oportunidad → su detalle. Cuenta → su ficha. Persona → la ficha de su empresa (no hay ficha de persona, P-05 pendiente) |
| CU-04.3 Nada coincide | Cualquier rol | — | «Nada con “…” dentro de tu alcance» |

### F-05 · Navegar

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-05.1 Contadores del menú | Cualquier rol | — | Oportunidades muestra las abiertas y Actividades las pendientes (vencidas y de hoy), **de la oficina activa y del alcance del rol**. Un cero no se pinta |
| CU-05.2 Contraer el menú | Cualquier rol | Pulsa el icono a la derecha de «CRM» | Quedan solo los iconos, con el nombre al pasar el cursor y el contador como insignia. Se recuerda entre sesiones sin parpadeo al cargar |
| CU-05.3 Pantalla angosta | Cualquier rol | Abre en tableta o teléfono | El menú lateral se vuelve una tira horizontal con los mismos rubros; el kanban apila las etapas como franjas |

### F-06 · Diagnóstico del despliegue

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-06.1 Verificar el ambiente | Quien despliega | Abre `GET /salud` (pública, sin datos de negocio) | Dice si la base responde, si `DATABASE_URL` tiene la forma correcta (sin credenciales, con una pista si está mal) y qué variables existen |

---

## 2. Pipeline de oportunidades · P-01

### F-07 · Ver el pipeline en cuatro vistas

Kanban, Tabla, Embudo y Forecast son cuatro lecturas de **la misma consulta**: cambiar de vista
no vuelve a la base. La vista, los filtros y el pipeline viven en la URL.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-07.1 Abrir el pipeline | Cualquier rol | Entra a Oportunidades | Abre en Kanban, en el pipeline de venta de la oficina activa. Arriba, el selector de vistas, un botón de embudo que muestra u oculta la fila de filtros —**cerrada al entrar**, con un punto cuando hay filtros activos— y «Nueva oportunidad»; debajo, al abrirla, los filtros (F-09). Si la oficina no tiene pipeline, lo dice |
| CU-07.2 Kanban | Cualquier rol | — | Una columna por etapa, **incluidas las vacías**, con conteo, probabilidad, total y ponderado; el total y el ponderado suman **solo las abiertas** (`RN-12`). Todas caben en el ancho sin scroll horizontal; las tarjetas se compactan según la columna. Cada tarjeta: nombre, cuenta y cierre, propietario, importe, margen (como cifra; solo la pérdida en coral, §33), puntaje MEDDIC y el triángulo de riesgo si aplica. Con el filtro de estatus, las **ganadas** llevan borde verde y relleno verde tenue, y las **perdidas** borde coral y relleno coral tenue, más una pastilla, debajo de las abiertas, y no se arrastran |
| CU-07.3 Tabla | Cualquier rol | Pulsa «Tabla» | Las mismas oportunidades renglón a renglón, con la etapa como columna |
| CU-07.4 Embudo | Cualquier rol | Pulsa «Embudo» | Una barra por etapa con el valor abierto contra la etapa mayor, y debajo la **tasa de paso** de los últimos 90 días: de las que entraron a la etapa anterior, cuántas llegaron a esta o más lejos (§17). A la derecha, la cola de riesgo ordenada por valor con la razón concreta |
| CU-07.4b Qué suma la barra | Cualquier rol | Pulsa la barra de una etapa | Se abre el detalle: las oportunidades abiertas de esa etapa con folio, cuenta, propietario, importe y ponderado (importe × probabilidad de la etapa, `RN-01`), el total y la explicación de la tasa de paso. Cada folio lleva a la oportunidad |
| CU-07.5 Embudo sin movimientos | Cualquier rol | Nadie entró a la etapa anterior en la ventana | La leyenda dice «no hay con qué medirlo», no «0 %» |
| CU-07.6 Forecast | Cualquier rol | Pulsa «Forecast» y elige meses o trimestres fiscales | Un tablero de columnas como el kanban, pero la columna es **cuándo**: cada oportunidad mostrada va en la columna de su cierre estimado, con la misma tarjeta; los trimestres se nombran **Q1–Q4** del año fiscal. La cabecera de cada columna trae cuántas, el total abierto, el ponderado por etapa (`RN-01`) y una barra con la mezcla por categoría de pronóstico (el juicio del vendedor · `RN-15`), cuyo desglose sale al pasar el cursor —la leyenda de colores de abajo se quitó el 29-sep-2026—; lo omitido cuenta en el total y no en la barra; las cerradas se ven pero no suman (`RN-12`) y van debajo de las abiertas |
| CU-07.7 Forecast · mover la ventana | Cualquier rol | Pulsa «‹ Anteriores», «Hoy» o «Siguientes ›» | La ventana es de seis meses o cuatro trimestres y avanza de periodo en periodo, nunca hacia atrás del periodo en curso. Las flechas dicen cuántas oportunidades quedan fuera hacia cada lado, para que nada se pierda sin aviso |
| CU-07.8 Forecast con cierres vencidos | Cualquier rol | Hay abiertas con cierre estimado en el pasado | Van en una columna «Vencidas» al principio, en coral: son fechas que hay que corregir, no dinero de un mes que ya pasó. Al mover la ventana hacia adelante, cuentan entre las que quedan atrás |
| CU-07.9 Nada con los filtros | Cualquier rol | Los filtros dejan el tablero vacío | Estado vacío con «Limpiar filtros» y «Nueva oportunidad» |

### F-08 · Indicadores del encabezado

Cinco cifras compactas; el detalle de cada una está al pasar el cursor. Para un vendedor se
calculan **solo sobre sus oportunidades** (§2.3).

| Indicador | Qué mide |
|---|---|
| Valor abierto | Suma de las abiertas visibles |
| Ponderado | Importe × probabilidad de la etapa (`RN-01`). MEDDIC no lo altera |
| Cierre del trimestre | Abiertas con **cierre estimado** dentro del trimestre fiscal en curso |
| Ganado | Suma y conteo de las **ganadas** con cierre real dentro del año fiscal en curso (§10.2: lo ganado se mide con `actualCloseDate`). Sobre el mismo conjunto acotado que las demás; verde cuando hay alguna. Sustituyó a «Cobertura» el 23-sep-2026; la cobertura contra la cuota sigue en Objetivos (F-31) |
| En riesgo | Suma y conteo de las que traen alguna bandera (F-12) |

### F-09 · Filtrar el pipeline

Pastillas que dicen su valor —«Lapso · Cierre estimado · este trimestre»— para que ningún recorte
quede invisible (`AC-23`). Salda la deuda de E0.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-09.1 Por pipeline | Cualquier rol | Elige un pipeline de la oficina (venta o renovaciones) | El tablero cambia de columnas; el elegido manda aunque no sea el de omisión |
| CU-09.2 Por cliente | Cualquier rol | Marca una o varias cuentas (con buscador si hay más de ocho) y aplica | Solo cuentas dentro de su alcance aparecen como opción |
| CU-09.3 Por vendedor | Gerente, Dirección, Administración | Marca uno o varios y aplica | A un vendedor **no se le ofrece**: solo hay una opción posible y desplegarlo revelaría la lista de compañeros (`AC-24`) |
| CU-09.4 Por lapso | Cualquier rol | Elige **sobre qué fecha** (cierre estimado, cierre real, creación, última actividad) y qué periodo (este trimestre, anterior, próximo, este año, año anterior, últimos 30 o 90 días, vencidas, personalizado con desde/hasta), en el mismo desplegable | El campo y el rango viajan juntos siempre: un rango sin su campo produce números que nadie puede reproducir (§9.3) |
| CU-09.5 Solo en riesgo | Cualquier rol | Pulsa la pastilla | Quedan las que traen alguna bandera. Es el único filtro que se aplica en memoria, porque las banderas se calculan y no se guardan (`INV-11`); se recorta después del alcance, así que no amplía nada |
| CU-09.8 Por estatus | Cualquier rol | Abre «Estatus» y marca Abiertas, Ganadas y/o Perdidas, y aplica | Un desplegable como el de Vendedor. Sin nada en la URL se ven **solo las abiertas** (§9.2; decisiones §25); aplicar sin marcar nada vuelve a ese reposo. Las cerradas se pintan debajo de las abiertas, con su color; «Ganado» del encabezado no depende de este filtro |
| CU-09.9 Por pronóstico | Cualquier rol | Abre «Pronóstico» y marca Compromiso, Mejor caso, Pipeline y/o Omitida | Filtra por la categoría de pronóstico (`RN-15`), en la consulta. Vacío = todas |
| CU-09.6 Limpiar | Cualquier rol | Pulsa «Limpiar» | Vuelve al pipeline sin recortes |
| CU-09.7 URL manipulada | Vendedor | Pega `owner=<otro vendedor>` en la URL | Cero resultados. Ni los del otro ni los suyos (`AC-25`) |
| CU-09.9 Sin perder la vista | Cualquier rol | Aplica o limpia un filtro estando en Tabla, Embudo o Forecast | La vista y la agrupación del forecast se conservan en la URL; antes cualquier filtro devolvía al kanban (29-sep-2026) |

### F-10 · Crear una oportunidad

Desde el modal «Nueva oportunidad». A la derecha de cada campo, una anotación dice qué hizo el
sistema con lo que se escribió: `existente`, `nueva`, `sugerido`, `Q4 2026`. Es lo que evita el
error caro de esta pantalla: crear una cuenta duplicada sin darse cuenta.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-10.1 Con una cuenta existente | Cualquier rol | Escribe el nombre de la cuenta y elige una de las sugeridas (dentro de su alcance) | Se enlaza la existente. El nombre de la oportunidad se sugiere con el prefijo de la cuenta y se puede completar sin perder lo escrito |
| CU-10.1b Tipo de negocio y pronóstico | Ídem | El tipo de negocio abre en «Sin especificar» y es **obligatorio**; el campo «Pronóstico» lleva un icono de ayuda que explica en una línea qué es Compromiso, Mejor caso, Pipeline y Omitida (`RN-15`) | Sin tipo de negocio no se crea: «Elige el tipo de negocio», en el campo. La ayuda también está al editar |
| CU-10.2 Con una cuenta nueva en línea | Cualquier rol | Escribe un nombre que no existe y lo deja | La cuenta se crea **en la misma operación** que la oportunidad, con la sede del país del pipeline y quien crea como propietario (§14, §18) |
| CU-10.3 Con una persona principal | Cualquier rol | Con cuenta existente, el campo es un desplegable con **todos sus contactos** (nombre · cargo · rol) y la opción «Nuevo contacto…», que abre debajo la captura de nombre, cargo y rol en el comité. Con cuenta nueva, se escribe directamente el nombre | Opcional a propósito: exigirla pelea contra la captura rápida. Ver los contactos de golpe evita crear a alguien que ya estaba. Solo se listan los de cuentas que la sesión alcanza; si no alcanza ninguna, queda capturar uno nuevo |
| CU-10.4 Pipeline, etapa y cierre | Cualquier rol | Elige pipeline y etapa de entrada (cada etapa dice cuántos requisitos tiene), importe estimado, origen y cierre estimado | **El país de la oportunidad es el del pipeline** (§18): a una misma cuenta se le vende en México y en Colombia. Hay que operar en ese país (`AC-05`). La fecha se anota con su trimestre fiscal. El folio `OPP-AAAA-NNNNN` se asigna al crear, consecutivo por año, y es inmutable (`INV-12`) |
| CU-10.5 Asignar a otra persona | Gerente, Dirección, Administración | Elige propietario | Solo usuarios **activos que operan en ese país** (`Q-14`). Un vendedor siempre crea a su nombre (`Q-13`) |
| CU-10.6 La etapa de entrada tiene requisitos en advertencia | Cualquier rol | La compuerta no se cumple (p. ej. persona con rol declarado) | El formulario dice qué falta y ofrece «Crear de todos modos». Queda registrado y alimenta el reporte semanal de incumplimiento (§8.3) |
| CU-10.7 La etapa de entrada es bloqueante | Cualquier rol | La compuerta no se cumple | No se puede crear ahí. Hay que cumplir los requisitos o elegir otra etapa |
| CU-10.8 Nombre de cuenta repetido | Cualquier rol | Escribe una cuenta nueva cuyo nombre ya existe, en cualquier país, aunque no la alcance | Se rechaza con el mensaje de que ya existe. Un duplicado partiría el histórico para siempre (§14, §18) |
| CU-10.9 Creada | Cualquier rol | — | Aviso «Oportunidad creada» con su folio y navegación al detalle |
| CU-10.10 Falta un campo al crear | Cualquier rol | Pulsa «Crear oportunidad» sin importe, sin fecha o sin nombre | El formulario señala qué falta junto a cada campo y **conserva todo lo demás capturado**. La señal de un campo se apaga en cuanto se corrige; si el servidor lo vuelve a rechazar, se vuelve a encender. «Cancelar» sí limpia el formulario |

### F-11 · Mover una oportunidad de etapa

Desde el kanban arrastrando, o desde la barra de etapas del detalle (que también sirve para
teclado y táctil). Es la misma acción por los dos caminos: una sola evaluación de `RN-02`.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-11.1 Cumple los requisitos | Quien alcance la oportunidad | Suelta la tarjeta en otra columna | Se mueve **cuando el servidor confirma**, no antes; mientras decide, la tarjeta se atenúa. Se sella la fecha de entrada a la etapa (`RN-03`) y queda en el historial |
| CU-11.2 Falta un requisito y la etapa está en advertencia | Ídem | Suelta la tarjeta | Un panel lista **todo** lo que falta, no solo lo primero, y ofrece «Mover de todos modos». Si acepta, el avance queda marcado como incumplimiento (§8.3) |
| CU-11.3 Falta un requisito y la etapa es bloqueante | Ídem | Suelta la tarjeta | El panel lista lo que falta y no ofrece omitir: hay que cumplirlo |
| CU-11.4 Los requisitos posibles | — | Según cómo esté configurada cada etapa | Persona con rol declarado · propuesta cargada · cotización congelada · hitos capturados · hitos cuadrados · decisor económico confirmado (MEDDIC) · puntaje MEDDIC mínimo para cierre · contrato u orden de compra cargado · sin autorización pendiente |

### F-12 · Banderas de riesgo

Se **calculan** cada vez que se pregunta; no existe un campo «en riesgo» que alguien pueda olvidar
destildar (`INV-11`, `RN-13`).

| Bandera | Cuándo se enciende | Cómo se ve |
|---|---|---|
| Sin actividad | No hay siguiente actividad agendada, o la agendada ya venció (`RN-10`) | Triángulo coral en la tarjeta; «Sin actividad futura programada · 34 días sin contacto» en la cola de riesgo |
| Estancada | Lleva en la etapa más días que el límite de esa etapa (`RN-03`). Registrar una llamada **no** reinicia el contador: solo cambiar de etapa | Triángulo apagado; «Estancada 26 días en Negociación» |
| ~~Margen bajo~~ | **Dejó de ser bandera** el 24-sep-2026 (decisiones §27): el margen ya se ve en la tarjeta, verde o coral (§13.1), y como bandera duplicaba la señal y llenaba la cola de riesgo. Quedan Sin actividad y Estancada |

---

## 3. Detalle de la oportunidad · P-02

### F-13 · Consultar una oportunidad

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-13.1 Abrir el detalle | Quien la alcance | Pulsa la tarjeta o el resultado del buscador | Barra superior con el nombre, el folio y la cuenta; estado, pipeline y banderas; a la derecha «Ver cuenta», **«Ganada»** (verde) y **«Perdida»** (coral) (F-38); la barra de etapas; y las pestañas Resumen, Actividades, Cotización, MEDDIC, Hitos, Documentos y Bitácora, con su conteo. El historial de etapas vive en Bitácora, no en Resumen. La pestaña vive en la URL |
| CU-13.2 Oportunidad fuera del alcance | Vendedor | Pega el enlace de una que no es suya | **404**, igual que si no existiera. Distinguir «no existe» de «no es tuya» le confirmaría que la del compañero existe |

### F-14 · Editar los datos comerciales

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-14.1 Editar la propia | Propietario, o quien tenga alcance de oficina (`Q-13`) | Pulsa el **lápiz** en el título de «Datos de la oportunidad»; cambia nombre, importe estimado, cierre, categoría, persona principal u origen | Se guarda con las reglas de negocio: «Compromiso» exige el mínimo MEDDIC (`RN-29`); reasignar es de Gerencia. Lo que el dato quiere decir se explica en el propio campo |
| CU-14.2 Reasignar | Gerente, Dirección, Administración | Cambia el propietario | Solo a un usuario activo que opere en el país de la oportunidad (`Q-14`). El anterior deja de verla si era vendedor |
| CU-14.3 Cerrada | Cualquiera | Intenta editar una ganada o perdida | No se edita mientras está cerrada. «Reabrir» la devuelve a abierta (F-43, `RN-18` enmendada) |
| CU-14.4 Corregir un dato sin abrir nada | Ídem que CU-14.1 | Pulsa el tipo de negocio, el pronóstico, el cierre estimado, el origen o el propietario en «Datos de la oportunidad» | El dato se vuelve control ahí mismo y guarda al elegir; Esc cancela. Rigen las mismas reglas que el panel completo: «Compromiso» exige puntaje MEDDIC y reasignar es de Gerencia. Si el servidor lo rechaza, el dato se queda como estaba y un aviso dice por qué (decisiones §19) |

### F-38 · Marcar ganada o perdida

Botones «Ganada» y «Perdida» en el encabezado del detalle, **desde cualquier etapa** (decisiones
§25). Los dos sellan `actualCloseDate` con el día de hoy, dejan rastro en la bitácora y no mueven
la oportunidad de etapa. `INV-07` sigue: no se gana sin cumplir las condiciones, y las condiciones
son las de §25.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-38.1 Ganar | Propietario, o quien tenga alcance de oficina | Pulsa «Ganada» | Un panel enseña las tres condiciones con palomita o cruz: cotización con al menos una línea, hitos capturados y hitos que **cuadran** con el neto (`RN-06`). Solo con las tres se puede confirmar; el servidor las vuelve a comprobar (`INV-07`) |
| CU-38.2 Falta algo | Ídem | Intenta ganar sin cotización, sin hitos o con hitos que no cuadran | El panel no deja confirmar y dice qué falta con la cifra: «Faltan $200,000 por asignar en hitos» (`AC-18`). Se resuelve en las pestañas Cotización e Hitos |
| CU-38.3 Perder | Ídem | Pulsa «Perdida», elige el motivo y, si el motivo lo pide, escribe el competidor | Se marca perdida con el cierre real de hoy. Sin motivo se rechaza (`AC-20`); un motivo que exige competidor lo pide (`RN-16`). No hace falta cotización |
| CU-38.4 Lo que queda | — | Ganada o perdida | `GANADA` o `PERDIDA`, `actualCloseDate` de hoy y `MARCAR_GANADA` / `MARCAR_PERDIDA` en `AuditLog`, en la misma transacción (`INV-09`). La bitácora lo enseña como «Ganada · $1,000,000.00 · Desde Negociación» o «Perdida · Precio · Competidor: …» |
| CU-38.5 Ya cerrada | Cualquiera | Intenta ganar o perder una cerrada | Se rechaza; en su lugar aparece «Reabrir» (F-43). Los botones de cierre no se ofrecen |
| CU-38.6 Lo que ya no se exige | — | — | El puntaje MEDDIC mínimo para ganar (`RN-28`) y el contrato u orden de compra cargado (`RN-06`) **no se exigen** para ganar: decisión del negocio del 24-sep-2026, anotada en §25 con dónde volver a exigirlos |

### F-43 · Reabrir una oportunidad

Botón «Reabrir» en la cabecera de una ganada o perdida (decisiones §32, `RN-18` enmendada).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-43.1 Reabrir | Propietario, Gerencia con alcance de oficina, Administración | Pulsa «Reabrir» y confirma | Vuelve a **abierta en la etapa donde se cerró**, con el mismo folio (`INV-12`). Se borran el cierre real y el motivo de pérdida; cotización, hitos, MEDDIC y actividades se quedan. Queda en la bitácora quién y desde qué estatus (`INV-09`) |
| CU-43.2 Quien no la alcanza | Vendedor que no es propietario | Intenta reabrir | El botón no aparece y el servidor rechaza |
| CU-43.3 Ya abierta | Cualquiera | — | No hay nada que reabrir: el botón solo existe en cerradas |


### F-15 · Agendar o registrar una actividad

Desde la pestaña Actividades del detalle, con «Nueva actividad». Es el flujo que decide la
adopción (§12.4). Por omisión la actividad se **agenda**; «Marcar como hecha», en el pie, la
convierte en el registro de algo que ya pasó. Lleva fecha, hora de inicio y de fin, y un
responsable; las horas son **de la ciudad del país de la oportunidad** (decisiones §20). Si el
calendario de Microsoft 365 está configurado, lo agendado aparece en el calendario del responsable.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-15.1 Agendar lo que sigue | Quien alcance la oportunidad | Elige el tipo —seis en botones con icono, los otros siete en «Otro…»—, acepta el asunto que el tipo sugiere, pone fecha, inicio y fin (mover el inicio arrastra el fin), elige al responsable y guarda | Queda pendiente y pasa a ser la «próxima actividad» de la oportunidad si es la más cercana. **No pregunta nada:** una actividad agendada ya es el siguiente paso (§19). Con el calendario configurado, aparece en el calendario de Microsoft 365 del responsable y la fila lo marca «en el calendario» |
| CU-15.2 Registrar lo que acaba de pasar | Ídem | Marca «Marcar como hecha» | Aparece el campo Resultado, que solo existe hacia atrás. Se guarda como realizada y adelanta la última actividad de la oportunidad. No va al calendario: es historia |
| CU-15.3 Hecha, y la oportunidad se queda sin nada agendado | Ídem | Guarda una actividad hecha sin que quede ningún pendiente | El sistema **pregunta explícitamente** si se cierra sin seguimiento (§12.4) y no escribe nada hasta que se responda: se agenda el que sigue en el mismo formulario, o se guarda sin seguimiento. Lo capturado sigue ahí |
| CU-15.4 Hecha, pero ya había algo agendado | Ídem | Lo mismo, con una actividad pendiente viva | No pregunta: la oportunidad no se queda sin próximo paso |
| CU-15.5 En una oportunidad cerrada | Ídem | Registra sin siguiente paso | No pregunta: en una cerrada, no tener siguiente paso es lo normal |
| CU-15.6 Falta el asunto | Ídem | Pulsa Guardar con el asunto vacío | Lo señala junto al campo y **conserva todo lo demás capturado**; la señal se apaga al corregir |
| CU-15.7 Fin antes del inicio | Ídem | Pone una hora de fin anterior a la de inicio | La duración lo dice en rojo mientras captura; al guardar, el servidor lo rechaza junto al campo Fin y lo demás se conserva |
| CU-15.8 Las horas son de la ciudad de la oportunidad | Cualquiera | Captura «10:30» en una oportunidad chilena | Es 10:30 en Santiago, y así se lee en la pestaña, en la agenda y en el calendario. La etiqueta del formulario lo dice: «Hora de Santiago» (§20) |
| CU-15.9 Elegir responsable | Quien alcance la oportunidad | Elige a otro usuario activo que opere en el país | La actividad es suya: aparece en su agenda y, si aplica, en su calendario. No hay puerta por rol: coordinar no es reasignar (§20) |
| CU-15.10 El calendario no responde | Ídem | Guarda con Microsoft 365 caído, sin permisos o sin configurar | La actividad se guarda igual. Si había credenciales y falló, un aviso dice que no llegó al calendario y que editar y guardar de nuevo reintenta. Sin credenciales, no se menciona el calendario |
| CU-15.11 Editar una actividad | Quien alcance la oportunidad | Pulsa el lápiz de la fila | El mismo formulario, con los datos cargados. Cambiar horario o notas actualiza el evento del calendario; cambiar de responsable lo mueve a su calendario. Completar la última pendiente pregunta como al registrar (§12.4). La última y la próxima actividad de la oportunidad se recalculan |
| CU-15.12 Un tipo que no está en los botones | Ídem | Lo elige en «Otro…» | Se aplica igual. Los botones son los seis con dibujo; si Administración renombra un tipo, ese tipo pasa al desplegable y nada más |
| CU-15.13 Desde Actividades | Cualquiera | Pulsa el lápiz de una actividad en la bandeja o en la semana | Se edita en el sitio con el mismo formulario del detalle, en la zona del país de su oportunidad y con sus responsables (F-29, F-30). El alta sigue viviendo en la oportunidad: el botón «Registrar actividad», que no llevaba a ningún lado, se quitó el 29-sep-2026 |

### F-16 · Cotizar

Pestaña Cotización. **Una cotización por oportunidad, editable en su lugar** (INV-06 enmendado,
decisiones §21): no se congela ni se versiona; cada cambio queda en la bitácora. Las columnas de
costo y utilidad **solo llegan** a quien tiene `VER_COSTO`; el margen, a quien tiene `VER_MARGEN`
(`RN-09`).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-16.1 Abrir la cotización | Quien alcance la oportunidad | Pulsa «Abrir cotización» | Nace vacía con la tasa de impuesto del país **copiada** en ese momento (`RN-24`): un cambio de tasa no altera cotizaciones existentes. Abrirla otra vez devuelve la misma |
| CU-16.2 Agregar una línea de catálogo | Ídem | En modo edición pulsa «+ Agregar línea» (con la cotización vacía, «Agregar la primera línea»); elige un producto; precio y costo de la lista vigente **llenan** los campos y se pueden corregir antes de guardar; pone cantidad y descuento | La línea sigue ligada a su producto. Se recalculan subtotal bruto, neto, impuesto, total, costo, utilidad y margen, y el neto y el margen se espejan en la oportunidad al momento |
| CU-16.2b Producto sin lista | Ídem | Elige un producto marcado «sin lista» | Precio y costo llegan vacíos y **se fijan para esta oportunidad**; los dos son obligatorios, como en el concepto libre. Sin `VER_COSTO` no se puede capturar el costo, y la línea no entra (decisiones §22) |
| CU-16.3 Agregar un concepto libre | Ídem | Escribe descripción, unidad, precio y **costo** | El costo es obligatorio (`Q-07`): sin él el margen de la línea sería falso |
| CU-16.4 Editar líneas | Ídem | Pulsa «Editar»; cambia cantidad, precio unitario, descuento o costo en las celdas que haga falta; pulsa «Guardar cambios» | **Mientras teclea**, precio neto, importe, utilidad, margen y los totales se recalculan al momento con `decimal.js` —la misma aritmética que el servidor, probada en paridad—; nada se guarda hasta pulsar. Sin `VER_COSTO` el margen no se puede anticipar: se muestra el guardado, atenuado, «se recalcula al guardar». Al guardar se escriben de una vez **solo los campos que cambiaron de valor**, se recalculan los totales y se espeja el neto. Si nada cambió, avisa «Sin cambios» y no anota nada. Mientras se edita, agregar y quitar líneas se ocultan. Antes, editar cantidad o descuento fallaba en silencio y parecía que «no actualizaba» |
| CU-16.6 Costo sin permiso | Vendedor sin `VER_COSTO` | Intenta fijar o cambiar un costo | No se acepta (`INV-02`): probar costos hasta que el margen cuadre sería deducirlo. La columna ni siquiera se pinta |
| CU-16.8 Quitar una línea | Ídem | En modo edición pulsa la ✕ | Se quita y se recalcula. Si era la última, la oportunidad vuelve a valer su **estimado** y su margen queda en blanco: una cotización vacía no dice nada |
| CU-16.9 Lo que queda en la bitácora | — | Cada **guardado** cuya cotización quede con un total distinto del de la última anotación, suba o baje | **Una** entrada `EDITAR_COTIZACION` con el neto anotado antes y el de ahora, y la lista de celdas que cambiaron en ese guardado, en la misma transacción (`INV-09`). Agregar o quitar líneas no anota por sí solo: lo recoge el siguiente guardado. Un guardado que no mueve el total —solo el costo, o dos cambios que se compensan— se guarda sin anotar (decisiones §26). Se lee en la pestaña Bitácora (F-37) |
| CU-16.10 Compuertas e hitos | — | Una etapa exige `COTIZACION_CONGELADA`; los hitos se cuadran | El requisito conserva su nombre en los datos pero exige **cotización con al menos una línea**; los hitos cuadran contra su neto (`RN-06`) |

### F-17 · Calificar con MEDDIC

Pestaña MEDDIC. **MEDDIC gatea, no pondera** (§2.1): bloquea avances y el marcado como ganada,
pero no cambia el importe ponderado. Cada componente lleva debajo una línea que dice qué hay que
haber averiguado para marcarlo.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-17.1 Calificar sin entrar | Quien alcance la oportunidad | Pulsa uno de los cuatro estados en la fila del componente | «No evaluado», «Ausente» y «Parcial» se guardan al pulsar. **«Confirmado» abre el panel** si falta la evidencia —o la persona, para decisor y campeón— con ese estado ya elegido y el foco en lo que falta (§27). El puntaje se recalcula **en la misma transacción** con los pesos del pipeline (`Q-08`, `AC-16`) |
| CU-17.2 Sin evidencia | Ídem | Marca «Parcial» sin haber escrito evidencia | Se guarda igual (`RN-30` enmendada, §24). La tarjeta lleva la marca ámbar «⚠ Sin evidencia» y el encabezado cuenta «N calificados sin evidencia». **Confirmar** sí la exige (§27): «… confirmado necesita evidencia: escribe en qué te basas» |
| CU-17.3 Evidencia y persona | Ídem | Pulsa «Evidencia» | El panel completo: estado, evidencia y, para decisor económico y campeón, la persona del comité (§2.1). Si la persona no existe, **«Nueva persona…»** abre nombre, cargo y rol en el comité (propuesto según el componente) y nace en la cuenta de la oportunidad al guardar, en la misma transacción (§27) |
| CU-17.4 Documentar después | Ídem | Pulsa «Evidencia» y escribe en qué se apoya | La marca desaparece y la evidencia se lee en la tarjeta, bajo la descripción del componente (volvió el 24-sep-2026) |
| CU-17.5 Decisor o campeón confirmado sin persona | Ídem | Confirma sin ligar a alguien del comité | Se rechaza: hay que elegir una persona real del comité de compra (§2.1) |
| CU-17.6 Lo que el puntaje gatea | — | Según la política comercial del país | Entrar a la etapa de cierre pide un mínimo; marcar ganada pide otro mayor y decisor, dolor y campeón confirmados; la categoría «Compromiso» pide un mínimo (`RN-28`, `RN-29`). Los mínimos son configurables (`INV-05`) |

### F-18 · Hitos de facturación

Pestaña Hitos. Siempre **monto**, nunca porcentaje guardado (§6.3): si la cotización cambia, el
sistema avisa que el calendario dejó de cuadrar en vez de recalcular en silencio.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-18.1 Capturar un hito | Quien alcance la oportunidad | Pulsa «Agregar hito». El panel muestra **neto a repartir, ya asignado y por asignar** antes de teclear; captura concepto, fecha y monto (o % del neto con el conmutador USD/%). «Usar lo que falta» llena el campo con lo que queda | Se agrega al calendario. La conversión de % a monto la hace el servidor con `Decimal` (`INV-03`); se guarda siempre el monto. Un rechazo no borra lo capturado |
| CU-18.1b Pasarse del neto | Ídem | Captura un monto que, sumado a los demás hitos, supera el neto | El formulario lo avisa en coral mientras se teclea, y el servidor lo **rechaza** con las cifras: «sumarían $1,200,000: $200,000 más que el neto de $1,000,000» (decisiones §22). Al editar, el monto anterior del hito no cuenta. Sin cotización con líneas no hay tope ni porcentaje: se captura en monto |
| CU-18.2 Cuadre | — | — | La pestaña dice cuánto falta contra el neto de la cotización con líneas: «faltan $200,000 por asignar», con la barra y las tres cifras debajo. Distingue «no hay neto todavía» de «cuadra en cero». «Sobran» solo puede aparecer si la cotización bajó después de capturar los hitos. Es la condición para ganar (F-38) |
| CU-18.3 Marcar cumplido | Ídem | Pulsa el hito | Pasa a cumplido con fecha, o vuelve a pendiente. Es lo que convierte el calendario en seguimiento de cobro |
| CU-18.4 Quitar | Ídem | — | Se borra la fila (en duro, a propósito · `Q-16`) |

### F-19 · Documentos

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-19.1 Subir | Quien alcance la oportunidad | Elige tipo (propuesta, contrato u orden de compra, otro) y archivo | Va a Storage y queda listado. Un contrato u orden de compra **cumple la compuerta** de cierre |
| CU-19.2 Descargar | Ídem | Pulsa el documento | Se abre con una URL firmada de corta vida |
| CU-19.3 Quitar | Ídem | — | La fila se borra en duro; el archivo queda en el bucket. Quitar un contrato **apaga la compuerta** y no deja bitácora (`Q-16`, pendiente de decidir) |

---

### F-37 · Bitácora de la oportunidad

Pestaña Bitácora. Una línea de tiempo, de lo más reciente a lo más viejo, armada desde lo que ya
existía: transiciones de etapa, auditoría de la oportunidad y de su cotización, actividades **hechas**
y el alta. No es una tabla nueva; es una lectura (decisiones §21).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-37.1 Leer la historia | Quien alcance la oportunidad | Abre la pestaña | Cada evento con qué pasó, cuándo (en la zona de la oportunidad) y quién. La creación dice en qué etapa nació |
| CU-37.2 Movimiento de etapa | — | Se cambió de etapa | «Etapa: Propuesta → Negociación», con la marca «Avanzó con advertencia» si saltó una compuerta (§8.3) |
| CU-37.3 Cierre estimado | — | Se movió la fecha de cierre | «Cierre estimado: 20 dic 2026 → 15 ene 2027». Se anota desde el 22 de septiembre de 2026; los cambios anteriores no existen en la historia |
| CU-37.4 Cotización | — | Se agregó, editó o quitó una línea | «Cotización: $80,000.00 → $95,000.00» y debajo qué línea y campo cambiaron. Sin `VER_COSTO`, un cambio de costo se nombra pero no se cifra (`INV-02`) |
| CU-37.5 Actividad hecha | — | Se registró o completó una actividad | Entra con palomita. Las pendientes no: son agenda, no historia |
| CU-37.6 Filtrar | Cualquiera | Pulsa Todo, Etapas, Cotización, Actividades o Cambios | El filtro vive en la URL (`INV-10`); cada pestaña dice cuántos hay |

## 4. Contactos · P-03 y P-04

### F-20 · Ver las cuentas

Pestaña Organizaciones. **Las cuentas se ven todas** (§18 y §29): cualquier rol, desde cualquier
oficina. Lo que tiene propietario y se recorta son las personas.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-20.1 Listar | Cualquier rol | Entra a Contactos | Nombre, tipo (y la sede si la tiene), oportunidades abiertas, pipeline, ganado 12 meses, propietario y última actividad (en rojo pasados 30 días). Indicadores: cuentas, con pipeline abierto, estratégicas, sin actividad |
| CU-20.2 Vendedor | Vendedor | — | Ve todas las cuentas, pero **los agregados se calculan solo sobre sus oportunidades** (§5.3): una cuenta ajena aparece sin pipeline, y no puede deducir por resta el de un compañero |
| CU-20.3 Sin histórico | Cualquier rol | Ninguna oportunidad cerrada todavía | «Ganado 12 meses» dice «sin histórico», no cero: el sistema arrancó en limpio y un cero afirmaría que la cuenta no compró (`C-02`) |

### F-21 · Ver las personas

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-21.1 Listar | Cualquier rol | Pestaña Personas | Nombre, cargo, correo, teléfono, rol en el comité de compra, empresa y **propietario**. La fila dice si te la compartieron y quién, o con cuántos la compartes |
| CU-21.2 Vendedor | Vendedor, Preventa | — | Ve las suyas, las que le compartieron y las de cuentas donde tiene una oportunidad (§29). Lo demás no viaja |
| CU-21.3 Gerente | Gerente de país | — | Además, las de todos los usuarios de su país. Dirección y Administración ven todas |

### F-22 · Crear una organización

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-22.1 Alta | Cualquier rol | «Nueva organización» desde la pestaña o desde el estado vacío: nombre, razón social, identificador fiscal (RFC, NIT o RUT, con nombre genérico), tipo, sector, ciudad y **sede** opcional en cualquier país | Quien crea queda como propietario (§14). La sede es informativa: no decide quién la ve (§18) |
| CU-22.2 Nombre repetido | Cualquier rol | Ya existe una con ese nombre, en cualquier país, aunque no la alcance | Se rechaza; solo se le dice que existe, nunca de quién es (§18) |

### F-23 · Crear una persona

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-23.1 Desde Personas | Cualquier rol | «Nueva persona»: elige la empresa, nombre, cargo, correo, teléfono, rol en el comité | Nace siendo de quien la captura (§29); se comparte o transfiere después |
| CU-23.2 Desde la ficha de la cuenta | Cualquier rol | «Agregar persona» en el comité de compra | Nace ligada a esa cuenta |

### F-24 · Editar organización y persona

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-24.1 Editar la cuenta | Propietario, o Gerencia con alcance de oficina (`Q-15`) | Desde su ficha | Mismo formulario del alta con los datos cargados, sede incluida. Reasignar la cuenta admite cualquier usuario activo: no hay país que lo limite (§18) |
| CU-24.2 Editar una persona | Quien la administra: su propietario, el gerente de su país, Dirección, Administración (§29) | Desde Personas o desde el comité de la ficha | Ídem. A quien se la compartieron le aparece «Solo lectura» y el servidor rechaza la edición |

### F-25 · Ficha de la cuenta

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-25.1 Abrir | Cualquier rol | Pulsa la cuenta | Encabezado con jerarquía matriz-filial si la hay; indicadores de pipeline abierto, ponderado, cerradas y personas; oportunidades abiertas (para un vendedor, solo las suyas) y cerradas; bitácora cronológica; comité de compra con roles (solo las personas que alcanza, con su propietario); datos de la cuenta (razón social, propietario, empleados, días de crédito, alta) |

### F-42 · Compartir y transferir personas

Botón «Compartir» junto a cada persona, en Personas y en el comité de la ficha, solo para quien
la administra. Un panel con el propietario y las casillas de con quién se comparte (§29).

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-42.1 Compartir | Propietario, gerente de su país, Dirección, Administración | Busca por nombre y elige a uno o varios usuarios (quedan como fichas con «quitar») y guarda | Ellos la ven en Personas, en la ficha y en el detalle de oportunidad, **solo lectura**. Queda en la bitácora con quién estaba y con quién queda (`INV-09`) |
| CU-42.2 Dejar de compartir | Los mismos | Desmarca y guarda | Deja de verla, salvo que tenga una oportunidad en la cuenta |
| CU-42.3 Transferir | Los mismos | Cambia el propietario | Quien la recibe la administra; quien la entrega deja de verla salvo que se la compartan o tenga oportunidad ahí. Bitácora `CAMBIAR_PROPIETARIO` |
| CU-42.4 Límite por país | Vendedor, Gerente | Elige a alguien de otro país | No aparece en la lista; el servidor lo rechaza. Dirección no tiene el límite |
| CU-42.5 Reasignar una oportunidad | Gerencia | Cambia el propietario de una oportunidad | Las personas de la cuenta se comparten con el nuevo propietario, en la misma transacción |
| CU-42.6 Contactos que ya existían | — | Migración del 25-sep-2026 | Su propietario es el dueño de la cuenta y quedaron compartidos con todos los vendedores |

---

## 5. Productos · P-06

### F-26 · Consultar el catálogo

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-26.1 Listar | Cualquier rol | Pestaña Catálogo | SKU, nombre, familia, unidad, modelo de precio y precio vigente. **Costo y margen solo con `VER_COSTO`** (`INV-02`) |
| CU-26.2 Costo viejo | Quien ve costo | El costo no se actualiza en 60 días | Se marca en ámbar (`Q-05`): un costo viejo hace que el margen mienta |

### F-27 · Consultar la lista de precio

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-27.1 Vigencias | Cualquier rol | Pestaña Lista de precio | El histórico de vigencias por producto. Se cotiza con la vigencia del día y cambiar una lista no altera cotizaciones ya creadas (`RN-26`) |

### F-28 · Crear y editar productos

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-28.1 Alta | Administración (`EDITAR_CATALOGOS`) | SKU, nombre, familia, unidad, modelo de precio; precio y costo **opcionales, pero juntos** | El SKU se fija al crear, como el folio: lo referencian líneas y reportes. Con precio y costo nace la primera vigencia; con los dos vacíos el producto queda **sin lista** y precio y costo se fijan en cada cotización (CU-16.2b). Uno sin el otro se rechaza: una lista con uno solo no significa nada (decisiones §22) |
| CU-28.1b Estrenar lista | Administración | Edita un producto sin lista y captura precio y costo | Nace su primera vigencia desde hoy. Dejar los dos vacíos al editar no toca la lista; quitar una lista existente no está previsto |
| CU-28.2 Cambiar precio | Administración | Edita el precio | Nace una vigencia nueva; las anteriores se conservan |
| CU-28.3 Dar de baja | Administración | Desactiva | Nada se borra (`INV-15`). Un producto inactivo no se ofrece al cotizar |
| CU-28.4 Carga masiva | — | — | **Pendiente** |

---

## 6. Actividades · P-07

Acotadas a la oficina activa, igual que el contador del menú, para que los dos digan lo mismo.

### F-29 · Bandeja de trabajo

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-29.1 Abrir | Cualquier rol | Entra a Actividades | Tres listas que piden acciones distintas: **Vencidas** (deuda, lo más viejo primero), **Hoy** (el plan del día) y **Sin próximo paso** (oportunidades abiertas sin nada agendado, por importe · `RN-10`) |
| CU-29.2 Resolver en el sitio | Cualquier rol | Pulsa el lápiz de la fila | Abre la actividad cargada: marcarla hecha con su resultado, reprogramarla, cambiar responsable. Misma acción y mismas reglas que el detalle (F-15), incluida la pregunta de §12.4 si la oportunidad se queda sin pendiente |
| CU-29.3 Ir al detalle | Cualquier rol | Pulsa la oportunidad, o «Agendar» en las que no tienen próximo paso | Lleva al detalle, donde se agenda el siguiente paso |
| CU-29.4 Sin oportunidad | Cualquier rol | Una actividad suelta, sin oportunidad | Se lista pero no trae lápiz: la acción autoriza cargando la oportunidad |
| CU-29.5 Nada pendiente | Cualquier rol | — | Estados vacíos que lo dicen: «Nada agendado para hoy» |

### F-30 · Agenda semanal

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-30.1 Ver la semana | Cualquier rol | Pulsa «Semana» | Siete días desde el lunes, siempre los siete aunque alguno quede vacío, con lo realizado y lo pendiente |
| CU-30.2 Editar | Cualquier rol | Pulsa el lápiz junto a la hora | Igual que en la bandeja (CU-29.2); también las ya realizadas |

---

## 7. Objetivos · P-08

**La medición es acumulada** (§17, regla nueva que no está en el spec): la cuota del Q1 al
trimestre en curso contra lo ganado en ese tramo. Un trimestre bueno paga la deuda del anterior.
Dos vistas en la URL (§34): **Objetivos**, la cuadrícula por vendedor y trimestre, y **Avance**, la
medición. Los trimestres se nombran **Q1 a Q4**.

### F-31 · Ver el avance contra objetivos

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-31.1 Vista Objetivos | Cualquier rol | Entra a Objetivos (vista por omisión) | Cuatro indicadores de dos líneas con **el año**: cuota (suma de Q1 a Q4), logrado, cumplimiento y cobertura. Debajo, la cuadrícula por vendedor y trimestre con el total anual y el total compañía |
| CU-31.2 Vista Avance | Cualquier rol | Pulsa «Avance» y un trimestre de la tira | Los mismos cuatro indicadores con lo **acumulado al Q** elegido; tira Q1 a Q4 con lo de cada trimestre solo. Nada que arrastrar en el año completo |
| CU-31.3 Venta o utilidad | Quien tenga `VER_MARGEN` | Conmuta la métrica | La utilidad se mide con la utilidad de la cotización congelada de cada ganada (§10.2). Para un vendedor no revela nada que no tuviera: venta × margen, ambos ya visibles para él (§17) |
| CU-31.4 Cambiar de año | Cualquier rol | Elige el año fiscal | Solo se ofrecen años con cuota, más el año en curso |
| CU-31.5 Vendedor | Vendedor | — | Ve **solo su renglón** (§2.3): ni la cuota ni el avance de sus compañeros |
| CU-31.6 Sin cuota fijada | Cualquier rol | La oficina no tiene objetivos ese año | En Objetivos, la cuadrícula vacía invita a agregar al primer vendedor; en Avance, estado vacío con el enlace a Objetivos |
| CU-31.7 Una anual previa no suma los trimestres | Cualquier rol | Alguien conserva una cuota anual fijada antes de la cuadrícula | Aviso en Avance: para el año manda la anual (`RN-32`); volver a guardar sus trimestres la retira (§34) |

### F-32 · Tabla del equipo

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-32.1 Ver al equipo | Gerente, Dirección, Administración (`VER_OBJETIVOS_EQUIPO`) | — | Por persona: cuota acumulada, logrado, cumplimiento, arrastre y cobertura; cuántos van por debajo. El **total se suma de las filas visibles**, nunca de una consulta aparte (§10.3) |

### F-33 · Fijar objetivos en la cuadrícula

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-33.1 Capturar la hoja | Administración (`EDITAR_CATALOGOS` · §17) | Teclea Q1 a Q4 de cada vendedor en las celdas y pulsa «Guardar cambios» una sola vez | Solo viaja lo que cambió; **cada cuota que cambia** queda en bitácora con la cifra anterior (`INV-09`). Se captura una métrica a la vez (venta o utilidad, el conmutador de arriba); la otra se conserva. El total anual es la suma de los trimestres: la cuota anual ya no se captura aparte (§34) |
| CU-33.2 Utilidad mayor que la venta | Administración | — | Se rechaza cuando ese trimestre tiene venta: sería un margen arriba del 100 %. Con venta en cero se acepta, para poder capturar la utilidad antes |
| CU-33.5 Agregar vendedor | Administración | «+ Agregar vendedor», elige a alguien activo del país sin fila | Nace con los cuatro trimestres en cero; se guarda con los demás cambios |
| CU-33.6 Eliminar vendedor | Administración | «Eliminar» en su fila y guardar | Borra sus cuotas del año, de venta y utilidad, trimestrales y anual; cada una queda en bitácora con las cifras que tenía |
| CU-33.7 Guardar sin cambios | Administración | Nada cambió de valor | «Nada que guardar»: no se escribe nada |
| CU-33.8 Descartar | Administración | «Descartar» | La cuadrícula vuelve a lo guardado |
| CU-33.3 Persona de otro país | Administración | Elige a alguien que no opera en la oficina | Se rechaza: la oficina sumaría una cuota que nadie de ahí va a cubrir |
| CU-33.4 Gerente intenta fijar | Gerente de país | — | No puede: fijaría la cuota contra la que a él lo miden. Conceder el permiso a Dirección es un cambio de matriz, no de código |

---

## 8. Administración · P-11

### F-34 · Consultar la configuración

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-34.1 Pipelines y etapas | Administración | Pestaña | Por pipeline: etapas con probabilidad, días para estancada, requisitos de entrada y modo (advertencia o bloqueante). **Solo lectura**: se edita en la base |
| CU-34.2 Catálogos | Administración | Pestaña | Orígenes, roles de comité, motivos de pérdida, familias. Solo lectura |
| CU-34.3 Roles y permisos | Administración | Pestaña | La matriz de §5.2 con `ADMINISTRAR_USUARIOS` agregado. Solo lectura |
| CU-34.4 Política comercial | Dirección, Administración | Pestaña | Umbrales de descuento, mínimos y pesos MEDDIC, SLA, por país. Solo lectura |

### F-35 · Administrar usuarios

Pestaña Usuarios, solo con `ADMINISTRAR_USUARIOS`. Cada operación deja bitácora.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-35.1 Alta previa | Administración | Correo, nombre, rol y países | El perfil queda listo, sin vincular; el primer ingreso con Microsoft lo vincula por correo (F-01) |
| CU-35.2 Editar | Administración | Cambia rol, países, nombre o estado | Desactivar es quitar el acceso. **Nadie se quita a sí mismo** el acceso ni el rol de administrador (§15) |
| CU-35.3 Dar acceso a quien ya entró | Administración | En la lista de quienes entraron con Microsoft sin perfil, asigna rol y país | Se crea el perfil ya vinculado, o se vincula el que existía con ese correo |

---

## 9. Análisis · P-09

### F-36 · Entrar a Análisis

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-36.1 Vendedor | Vendedor | Abre `/analisis` | **403**, no una pantalla vacía (`AC-02`) |
| CU-36.2 Gerencia y dirección | Gerente, Dirección, Administración | Abre `/analisis` | Tres pestañas: Análisis de ventas, Forecast, Actividad y MEDDIC. Arriba de cada una, indicadores de dos líneas (nombre y valor; el detalle al pasar el cursor · §36). Los reportes que requieren historia dicen «sin datos suficientes», nunca cero (`Q-06`, `C-02`) |
| CU-36.3 Filtrar | Gerente, Dirección | Las mismas pastillas que el pipeline: país y vendedor abren una lista de casillas con «Ninguno» y «Aplicar»; el año, una lista de uno. Cualquiera de los elegidos cuenta. Producto y tipo de negocio dejaron de ser filtros (§36): siguen como agrupaciones de las gráficas | Recorta **dentro** del alcance (`AC-25`); todo queda en la URL (`INV-10`) y el enlace se puede compartir. Un gerente solo ve los países donde opera; la oficina activa no recorta aquí |

### F-39 · Análisis de ventas (reportes 1 a 3, en gráficas · §35)

Debajo de los cuatro indicadores, cuatro tarjetas con gráficas interactivas (Recharts): dos por fila en
escritorio, una columna en pantallas angostas. Cada punto lleva tooltip con las cifras exactas
(«$328,835.00»); ejes y etiquetas van en corto («$328.8K»). «Agrupar por» cambia la gráfica al instante y
queda en la URL. Las tablas se quedaron en Forecast y Actividad.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-39.1 Avance contra objetivo | Gerente, Dirección | Agrupa lo ganado del año por trimestre, cliente, producto o tipo | Barras verticales de lo ganado por `actualCloseDate`, con el valor encima. Por trimestre, los cuatro en orden aunque estén en cero, el que corre y el que no ha empezado dicho en el tooltip; con cuota consolidada (`RN-32`), la cuota va como barra clara al lado y el tooltip trae cuota y cumplimiento. Por cliente, producto o tipo, de mayor a menor. El total no es una barra. Por producto cada venta se reparte entre las líneas de su cotización; sin cotización, barra «Sin cotización» atenuada |
| CU-39.2 Cuota consolidada | Gerente, Dirección | — | Suma de las cuotas del alcance (`RN-32`), siempre comparable con lo ganado porque ya no hay filtros de producto ni tipo (§36). Sin cuota fijada, el indicador lo dice y la gráfica no inventa una |
| CU-39.3 Histórico | Gerente, Dirección | Agrupa por año o trimestre | Toda la historia; el filtro de año no aplica. Lo ganado en barras y la utilidad como línea, sobre el mismo eje en dólares; la variación contra el periodo anterior con ventas es un porcentaje y va en el tooltip, con participación y negocios |
| CU-39.4 Rentabilidad | Dirección, Administración (`VER_COSTO`) | Agrupa por producto, tipo o cliente | Barras horizontales apiladas costo + utilidad, con la venta al final, de mayor a menor venta; tooltip con venta, costo, utilidad, margen y negocios. Una pérdida muestra solo el costo y la utilidad negativa en coral (§33) |
| CU-39.5 Margen | Dirección, Administración (`VER_COSTO`) | Misma agrupación que Rentabilidad | Barras de 0 a 100 % con el por ciento al final, de mayor a menor margen; un margen negativo se dibuja en cero y se lee en coral |
| CU-39.6 Rentabilidad sin permiso | Gerente sin `VER_COSTO` | Abre la pestaña | El costo no viaja (`INV-02`): el histórico no lleva línea de utilidad y la tarjeta de rentabilidad y margen muestra un aviso, no ceros |
| CU-39.7 Muchos registros | Cualquiera con acceso | Decenas de clientes o productos | Las barras verticales crecen a lo ancho con scroll; las horizontales crecen a lo alto con scroll a partir de trece filas. Sin registros, la tarjeta dice qué falta |

### F-40 · Forecast (reportes 4 a 6, en gráficas · §37)

Debajo de los cuatro indicadores, seis tarjetas en dos columnas (una en pantallas angostas): embudo por
trimestre, distribución del pipeline, ciclo de venta, antigüedad y estancamiento, antigüedad contra
importe, y la tabla de las de mayor importe. Tooltips con las cifras exactas; ejes en corto.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-40.1 Embudo por trimestre | Gerente, Dirección | — | Una barra por trimestre de cierre estimado (`expectedCloseDate`): la altura es el importe abierto y el segmento verde de abajo el ponderado (importe × probabilidad de etapa, `RN-01`). Tooltip: oportunidades, importe, ponderado y peso en el pipeline |
| CU-40.2 Filtros del embudo | Gerente, Dirección | Probabilidad mínima (≥ 25, 50 o 75 %) y categorías de pronóstico | Recortan antes de agregar; viven en la URL y mueven la gráfica, la distribución y los indicadores |
| CU-40.3 Distribución del pipeline | Gerente, Dirección | «Agrupar por» cliente o vendedor | Barras horizontales del importe abierto, de mayor a menor, con importe y peso al final; cambia al instante y queda en la URL (`g4`) |
| CU-40.4 Ciclo de venta | Gerente, Dirección | «Agrupar por» vendedor o trimestre | Por vendedor, barras de días promedio con la mediana como línea punteada; por trimestre, la evolución como línea con la misma mediana (`g5`). Sin ganadas en el año, «sin datos suficientes» |
| CU-40.5 Antigüedad y estancamiento | Gerente, Dirección | — | Tres indicadores (sin actividad, cierre vencido, edad promedio) y barras **agrupadas** por vendedor: abiertas, estancadas, sin actividad y vencidas. Nunca apiladas: se traslapan |
| CU-40.6 Antigüedad contra importe | Gerente, Dirección | — | Cada abierta como un punto edad × importe, coloreado por el estado de su etapa: en tiempo (menos del 75 % del límite), en riesgo (del 75 % al límite), fuera del límite; la edad promedio como línea. Tooltip con folio, oportunidad, cliente, etapa, edad, días en etapa, límite, importe, vendedor y estado |
| CU-40.7 Las de mayor importe | Gerente, Dirección | — | Tabla de las 20 abiertas que más pesan, con «En etapa» teñido por la misma regla; el folio lleva a la oportunidad |

### F-41 · Actividad y MEDDIC (reportes 8 y 9, en gráficas · §38)

Debajo de los cuatro indicadores, cuatro tarjetas con gráficas en dos columnas (una en pantallas
angostas), la tabla operativa de las que están en cierre sin llegar al mínimo, y un bloque «Detalle» con
las dos tablas originales, de menor jerarquía. Los filtros globales mueven todo; no hay conmutadores.

| Caso | Quién | Qué pasa | Resultado |
|---|---|---|---|
| CU-41.1 Actividad por vendedor | Gerente, Dirección | — | Barras agrupadas: una serie por tipo de actividad que exista (los tipos son datos), una barra por vendedor. Solo cuenta lo **hecho** en el año fiscal (§19). Tooltip con cada tipo y el total |
| CU-41.2 Actividad por mes | Gerente, Dirección | — | Los doce meses del año fiscal, desde el mes de arranque, con cero en claro donde no hubo nada. No se inventa actividad. Tooltip con las hechas del mes |
| CU-41.3 Abiertas y sin siguiente paso | Gerente, Dirección | — | Barras agrupadas por vendedor: abiertas en azul y sin siguiente paso (`RN-10`) en coral, para que salte a la vista. Tooltip con ambas y el porcentaje; con cero abiertas, «—» |
| CU-41.4 Salud MEDDIC por etapa | Gerente, Dirección | — | Barras horizontales de 0 a 100 con el promedio por etapa y «Mínimo: 70» (política comercial, `INV-05`) como línea: verde en o sobre el mínimo, coral debajo, gris y «Sin datos» donde nadie está calificado. Tooltip con abiertas, promedio, bajo el mínimo y sin calificar |
| CU-41.5 En cierre sin llegar al mínimo | Gerente, Dirección | — | Tabla a lo ancho: folio con enlace, oportunidad y MEDDIC en coral. Vacía dice «Ninguna oportunidad en etapa de cierre está por debajo de 70» |
| CU-41.6 Detalle | Gerente, Dirección | — | Las tablas originales (resumen por vendedor con hechas, tipos, abiertas y sin siguiente paso; salud MEDDIC por etapa) siguen debajo para la operación |
| CU-41.7 Indicadores | Gerente, Dirección | — | Actividades hechas, sin siguiente paso (coral cuando hay), en cierre bajo el mínimo (verde en cero, coral con alguna) y componentes sin evidencia (`RN-30`) |

---

## 10. Lo que no está construido

| Funcionalidad | Estado | Nota |
|---|---|---|
| Marcar ganada o perdida (`RN-07`, `INV-07`, `AC-19`) | Pendiente | La validación de dominio existe en parte (`componentesFaltantesParaGanar`); falta la acción y su pantalla |
| Autorizaciones de descuento · P-10 | Fuera de este alcance | Decisión del negocio. La compuerta «sin autorización pendiente» existe pero nunca se activa |
| Reportes D y E de la propuesta de Análisis (cuentas y catálogo; gobierno) | Fuera de esta entrega | Decisión del negocio del 25-sep-2026; A, B y C están construidos (decisiones §28) |
| Vistas guardadas (§9.5) | Pendiente | Los filtros ya viven en la URL, que es el prerrequisito |
| Editar pipelines, catálogos, permisos y política desde la interfaz | Pendiente | Hoy se consultan; se cambian en la base |
| Carga masiva de productos y costos (`Q-05`) | Pendiente | |
| Ficha de persona · P-05 | Pendiente | El buscador lleva a la empresa |
| Colombia y Chile productivos · E5 | Pendiente | Los pipelines existen; faltan datos, cuotas y equipos |
| Bucket `documentos` privado (`Q-17`) | Riesgo abierto | Hoy está en público |
| Prospectos, crédito compartido, migración desde Pipedrive | Fuera | `decisiones-pendientes.md` §4 |
