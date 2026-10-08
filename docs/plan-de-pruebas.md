# Plan de pruebas · CRM Avattar

8 de octubre de 2026. 140 casos de prueba manuales para las once áreas pedidas, derivados de
`docs/funcionalidades-y-casos-de-uso.md` (lo construido al 7 de octubre de 2026). Cada caso dice
quién lo ejecuta, qué hace y qué debe ver; la columna Resultado se llena al ejecutar. La copia viva
para ejecutar y anotar está en claude.ai; este archivo es la versión del repo.

## Cómo ejecutar el plan

**Ambiente.** `https://avattar-crm-test.vercel.app`, o local con `pnpm dev`. La base es compartida y
lo que se cree durante la ejecución queda: usar el prefijo «QA-» en cuentas, personas, productos y
oportunidades para reconocerlos y limpiarlos después.

**Cuentas de prueba.** Una cuenta de Microsoft por rol. Hoy tienen acceso un Vendedor (MX), un
Preventa (MX) y tres de Administración (dos con MX/CO/CL y una solo MX). Faltan un Gerente de país
(MX) y una Dirección (MX/CO/CL): se dan de alta en Administración › Usuarios con el correo de
Microsoft que va a entrar (caso 11.1) y el primer ingreso los vincula. Los casos de compartir y de
alcance necesitan además un **segundo Vendedor** (MX) sin oportunidades en las cuentas QA-.

| Rol | Clave | Países | Lo que importa para este plan |
|---|---|---|---|
| Vendedor | V (V2 el segundo) | MX | Solo sus oportunidades y actividades; no ve costo ni Análisis; no elige propietario |
| Preventa | P | MX | Solo lectura de las que le asignan; registra actividades; no crea, edita ni mueve |
| Gerente de país | G | MX | La oficina MX; asigna y reasigna propietario; ve costo, equipo y Análisis |
| Dirección | D | MX/CO/CL | Lo del gerente en los tres países; política comercial |
| Administración | A | MX/CO/CL | Todo lo anterior; catálogos, objetivos, usuarios y matriz de permisos |

**Datos previos.** Pipelines activos: Ventas México, Ventas Colombia, Ventas Chile y Renovaciones
MX. Antes de empezar, anotar en Administración › Pipelines y etapas qué etapas de Ventas México
tienen requisitos y en qué modo (advertencia o bloqueante), y en Política comercial el mínimo MEDDIC
para cierre: los casos 1.9, 1.10, 3.2, 3.3 y 3.9 dependen de eso. Hacen falta: dos cuentas con
oportunidades abiertas del Vendedor, una cuenta sin oportunidades, una oportunidad con actividad
vencida y otra sin actividad agendada, una ganada y una perdida.

**Cómo registrar.** Cada caso tiene ID (bloque.número), prioridad (A: flujo principal o regla de
negocio; M: variante o validación; B: detalle de pantalla), rol, pasos y resultado esperado. En
Resultado se escribe **Pasa**, **Falla** o **Bloqueado**; si falla, en la misma celda una línea con lo
que se vio y el nombre de la captura. Un caso se ejecuta como está escrito; si el ambiente no lo
permite, es Bloqueado con la causa. La columna Caso cita el caso de uso (CU-nn.n) o la decisión (§nn)
de donde sale la regla, para rastrear un fallo hasta su origen. Dos comportamientos están anotados
como **conocidos** (§48): se registran como Falla con esa referencia, no se dejan pasar.

**Orden sugerido.** 11 Administración → 7 Productos → 5 y 6 Contactos → 1 a 4 Oportunidades → 8
Actividades → 9 Objetivos → 10 Análisis. Cada bloque usa lo que el anterior creó.

## 1. Creación de oportunidades

Desde «Nueva oportunidad» en Oportunidades y desde la ficha de una cuenta. Salvo que se diga otra
cosa, con el Vendedor (V) y la oficina MX.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 1.1 | A | Abrir el alta (CU-07.1, CU-10.4) | V | En Oportunidades pulsa «Nueva oportunidad» | Modal con cuenta, persona principal, nombre, pipeline, etapa de entrada, tipo de negocio en «Sin especificar», pronóstico con icono de ayuda, importe estimado, origen y cierre estimado. El pipeline ofrece solo los de México: Ventas México y Renovaciones MX | |
| 1.2 | A | Crear con cuenta existente (CU-10.1, CU-10.9) | V | Escribe las primeras letras de una cuenta existente y elige la sugerida; acepta el nombre sugerido «Cuenta · » y complétalo; tipo de negocio, importe 50,000, cierre dentro del trimestre; «Crear oportunidad» | La anotación junto a la cuenta dice «existente». Aviso «Oportunidad creada» con folio OPP-2026-NNNNN consecutivo al último; navega al detalle; aparece en el kanban en la etapa de entrada con el Vendedor como propietario | |
| 1.3 | A | Crear con cuenta nueva en línea (CU-10.2) | V | Escribe como cuenta «QA-Cuenta Nueva 01», que no existe, y déjala; completa el resto; crea | Anotación «nueva». Se crean la cuenta y la oportunidad en la misma operación; en Contactos la cuenta existe con sede México (el país del pipeline) y el Vendedor como propietario | |
| 1.4 | A | Nombre de cuenta repetido (CU-10.8) | V | Escribe como cuenta nueva el nombre exacto de una cuenta existente de otro propietario, o el mismo con otras mayúsculas; crea | Se rechaza con el mensaje de que la cuenta ya existe; no se crea nada; lo capturado se conserva | |
| 1.5 | M | Persona principal existente (CU-10.3) | V | Con cuenta existente abre «Persona principal» | Lista todos los contactos de la cuenta (nombre · cargo · rol) y «Nuevo contacto…»; al elegir uno y crear, esa persona queda como principal en el detalle | |
| 1.6 | M | Persona principal nueva (CU-10.3) | V | Elige «Nuevo contacto…», captura nombre, cargo y rol en el comité; crea | La persona nace en la cuenta y queda como principal; aparece en Contactos › Personas con el Vendedor como propietario | |
| 1.7 | A | Tipo de negocio obligatorio (CU-10.1b) | V | Deja «Sin especificar» y crea | «Elige el tipo de negocio» junto al campo; no se crea; lo demás se conserva | |
| 1.8 | A | Faltan importe, fecha o nombre (CU-10.10) | V | Borra importe y fecha; crea; corrige uno; luego «Cancelar» y vuelve a abrir | Señal junto a cada campo faltante y todo lo demás capturado sigue; al corregir un campo su señal se apaga; tras Cancelar el formulario abre limpio | |
| 1.9 | A | Etapa de entrada con requisito en advertencia (CU-10.6) | V | Elige como etapa de entrada una con requisitos en modo advertencia (la etapa dice «N requisitos») sin cumplirlos; crea | El formulario lista qué falta y ofrece «Crear de todos modos»; al aceptar se crea, avisa que nació sin cumplir requisitos y en Bitácora queda marcado | |
| 1.10 | A | Etapa de entrada bloqueante (CU-10.7) | V | Elige una etapa con requisitos en modo bloqueante sin cumplirlos; crea | Lista lo que falta sin ofrecer omitir; no se crea | |
| 1.11 | A | El vendedor crea a su nombre (CU-10.5, Q-13) | V | Observa el alta | No hay campo «Propietario»; la oportunidad creada queda a nombre del Vendedor | |
| 1.12 | A | El gerente asigna propietario (CU-10.5, Q-14) | G | Abre el alta; en «Propietario» elige a un vendedor activo de México; crea | Solo se listan usuarios activos que operan en el país del pipeline; la oportunidad nace del vendedor elegido, él la ve en su pipeline y el Gerente también | |
| 1.13 | M | Pipelines por alcance (CU-10.4, §48) | D | Abre el alta con Dirección (MX/CO/CL) | El campo pipeline ofrece Ventas México, Ventas Colombia, Ventas Chile y Renovaciones MX; con el Vendedor solo los dos de México (caso 1.1) | |
| 1.14 | A | El país es el del pipeline (CU-10.4, §18) | D | Crea una oportunidad en Ventas Colombia sobre una cuenta con sede México | Se crea; aparece con la oficina CO activa y no con MX; la cuenta sigue siendo una sola | |
| 1.15 | M | Cierre con trimestre fiscal (CU-10.4) | V | Pon una fecha de cierre y mira la anotación del campo | Dice el trimestre fiscal, por ejemplo «Q4 2026» | |
| 1.16 | M | Responsable de preventa (CU-44.1) | G | En el alta elige «Responsable de preventa» (el campo aparece si hay preventas en MX); crea | La oportunidad nace con preventa; al entrar con la cuenta Preventa, la ve en su tablero en solo lectura | |
| 1.17 | A | Preventa no crea (CU-44.5, §46) | P | Entra a Oportunidades y a la ficha de una cuenta | No hay botón «Nueva oportunidad» en ninguna de las dos | |
| 1.18 | M | Desde la ficha de cuenta (CU-25.2) | V | En Contactos abre una cuenta y pulsa «Nueva oportunidad» | Se abre el mismo modal con la cuenta puesta y marcada «existente», sus contactos cargados y el nombre sugerido; crear lleva al detalle; «Cancelar» y reabrir conserva la cuenta puesta | |

## 2. Navegación entre vistas

Kanban, Tabla, Embudo y Forecast son cuatro lecturas de la misma consulta; la vista, los filtros y
el pipeline viven en la URL (INV-10).

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 2.1 | A | Abrir el pipeline (CU-07.1) | V | Entra a Oportunidades | Abre en Kanban, en el pipeline de venta de la oficina activa; arriba el selector de vistas, el botón de embudo con la fila de filtros cerrada y «Nueva oportunidad» | |
| 2.2 | A | Kanban (CU-07.2) | V | Observa columnas y tarjetas | Una columna por etapa, incluidas las vacías, con conteo, probabilidad, total y ponderado de las abiertas; sin scroll horizontal. Cada tarjeta: nombre, cuenta, cierre, propietario, importe, margen, puntaje MEDDIC y el triángulo de riesgo si aplica | |
| 2.3 | A | Tabla (CU-07.3) | V | Pulsa «Tabla»; luego el botón Atrás del navegador | Las mismas oportunidades por renglón con la etapa como columna; el folio enlaza al detalle; la URL cambia y Atrás vuelve al kanban | |
| 2.4 | A | Embudo y su detalle (CU-07.4, CU-07.4b) | V | Pulsa «Embudo»; pulsa la barra de una etapa con oportunidades; cierra con Escape, con la ✕ y con un clic fuera | Una barra por etapa con el valor abierto y debajo la tasa de paso; a la derecha la cola de riesgo con la razón concreta. Al pulsar, popup con las oportunidades que suman la barra (folio con enlace, cuenta, propietario, importe, ponderado) y el total; los tres cierres funcionan | |
| 2.5 | M | Embudo sin movimientos (CU-07.5) | V | Mira una etapa a la que nadie entró en los últimos 90 días | La leyenda dice «no hay con qué medirlo», no «0 %» | |
| 2.6 | A | Forecast por meses y trimestres (CU-07.6) | V | Pulsa «Forecast»; conmuta meses y trimestres; pasa el cursor por la barra de una cabecera | Columnas por periodo de cierre estimado con la misma tarjeta; cabecera con cuántas, total abierto, ponderado y barra por categoría de pronóstico con el desglose al pasar el cursor; trimestres nombrados Q1 a Q4 | |
| 2.7 | M | Forecast: mover la ventana (CU-07.7) | V | Pulsa «Siguientes ›» dos veces, «‹ Anteriores» y «Hoy» | Ventana de seis meses o cuatro trimestres que avanza de periodo en periodo y nunca antes del periodo en curso; las flechas dicen cuántas oportunidades quedan fuera a cada lado | |
| 2.8 | M | Forecast con vencidas (CU-07.8) | V | Con una abierta cuyo cierre estimado ya pasó, abre Forecast | Va en la columna «Vencidas» al principio, en coral | |
| 2.9 | A | Los filtros no cambian la vista (CU-09.9) | V | En Tabla, en Embudo y en Forecast aplica un filtro de cliente y luego «Limpiar»; pega la URL en otra pestaña | La vista y la agrupación del forecast se conservan; la URL lleva vista y filtro y en la otra pestaña se reproduce igual | |
| 2.10 | M | Filtros cerrados al entrar (CU-07.1) | V | Aplica un filtro y recarga la página | La fila de filtros está cerrada y el botón de embudo lleva un punto; al abrirla, la pastilla dice su valor | |
| 2.11 | A | Estatus: abiertas por omisión (CU-09.8) | V | Sin filtros cuenta las tarjetas; abre «Estatus», marca Ganadas y Perdidas, aplica | Sin nada en la URL se ven solo abiertas; con el filtro, las cerradas aparecen debajo de las abiertas, ganadas en verde y perdidas en coral, con pastilla, y no se arrastran | |
| 2.12 | M | Sin filtro de vendedor para el vendedor (CU-09.3, AC-24) | V y G | Abre la fila de filtros con cada rol | Al Vendedor no se le ofrece la pastilla «Vendedor»; al Gerente sí | |
| 2.13 | A | URL manipulada (CU-09.7, AC-25) | V | Pega en la URL `owner=<id de otro vendedor>` (el id se copia de la URL del Gerente al filtrar por ese vendedor) | Cero resultados: ni los del otro ni los suyos | |
| 2.14 | M | Solo en riesgo (CU-09.5) | V | Pulsa la pastilla «Solo en riesgo» | Quedan las que traen bandera (sin actividad o estancada) y los indicadores se recalculan sobre ellas | |
| 2.15 | M | Vacío por filtros y vacío real (CU-07.9, CU-07.10) | V y G | a) Con el Vendedor aplica un filtro que no deje nada; b) con el Gerente cambia la oficina a CO, sin oportunidades | a) Estado vacío con «Limpiar filtros» y «Nueva oportunidad». b) «Todavía no hay oportunidades en esta oficina» con «Nueva oportunidad» y sin «Limpiar filtros», igual en kanban, embudo y forecast | |
| 2.16 | M | Indicadores del encabezado (F-08) | V y G | Compara los cinco indicadores con cada rol | Para el Vendedor se calculan solo sobre sus oportunidades; para el Gerente, sobre la oficina. «Ganado» suma las ganadas del año fiscal por cierre real; «Cierre del trimestre», las abiertas con cierre estimado en el trimestre | |
| 2.17 | M | Oficina activa (CU-03.1, CU-03.2) | D y V | Dirección pulsa MX, CO y CL en la barra superior; el Vendedor mira la barra | Pipeline, actividades, objetivos y contadores releen con la oficina elegida; el Vendedor no tiene selector | |
| 2.18 | B | Pantalla angosta (CU-05.3) | V | Reduce la ventana a 400 px de ancho o abre en un teléfono | El menú se vuelve una tira horizontal, el kanban apila las etapas y la página no hace scroll horizontal | |

## 3. Mover entre etapas

Arrastrando en el kanban o desde la barra de etapas del detalle: es la misma acción por los dos
caminos y una sola evaluación de requisitos (RN-02). Usar oportunidades QA- del Vendedor.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 3.1 | A | Arrastrar cumpliendo requisitos (CU-11.1) | V | Arrastra una tarjeta a la siguiente etapa, una sin requisitos o con los requisitos cumplidos | La tarjeta se atenúa mientras el servidor decide y se mueve al confirmar; en el detalle la barra de etapas marca la nueva; en Bitácora «Etapa: X → Y» con fecha y quién | |
| 3.2 | A | Advertencia: falta un requisito (CU-11.2) | V | Arrastra a una etapa en modo advertencia sin cumplir sus requisitos; cierra el panel con Escape; repite y acepta «Mover de todos modos» | Panel que lista todo lo que falta y ofrece «Mover de todos modos»; Escape, «Entendido» o un clic fuera cierran sin mover; al aceptar se mueve y la Bitácora marca «Avanzó con advertencia» | |
| 3.3 | A | Bloqueante: falta un requisito (CU-11.3) | V | Arrastra a una etapa en modo bloqueante sin cumplir sus requisitos | Panel con lo que falta, sin «Mover de todos modos»; la tarjeta vuelve a su columna | |
| 3.4 | A | Desde la barra de etapas del detalle (F-11) | V | En el detalle pulsa otra etapa en la barra; repite usando Tab y Enter | Mismo resultado que arrastrar, con la misma evaluación; funciona con teclado | |
| 3.5 | M | Cumplir el requisito y reintentar (CU-11.4) | V | Con una etapa que exija «persona con rol declarado»: agrega al comité una persona con rol y vuelve a mover | Ahora pasa sin panel | |
| 3.6 | A | Las cerradas no se arrastran (CU-07.2) | V | Con el filtro Estatus en Ganadas, intenta arrastrar una ganada | No se puede arrastrar; nada cambia | |
| 3.7 | A | Preventa no mueve (CU-44.6) | P | En una asignada intenta arrastrar la tarjeta y cambiar la etapa desde el detalle | No se ofrece; si se fuerza, el servidor rechaza con «Solo su propietario o Gerencia pueden modificarla» | |
| 3.8 | M | Estancada no se reinicia con actividad (F-12, RN-03) | G | Con una oportunidad que lleve en su etapa más días que el límite de la etapa, registra una actividad hecha y mira la bandera | Sigue «Estancada N días en …»; solo cambiar de etapa reinicia el contador | |
| 3.9 | M | Entrar a cierre con MEDDIC bajo (CU-17.6, RN-28) | V | Mueve a la etapa de cierre una oportunidad con puntaje MEDDIC menor al mínimo de la política comercial | El panel lista el requisito de puntaje mínimo, con o sin «Mover de todos modos» según el modo de la etapa | |
| 3.10 | M | Historial por los dos caminos (CU-37.2) | V | Mueve una oportunidad arrastrando y otra desde la barra; abre Bitácora › Etapas en cada una | Las dos transiciones aparecen igual, con la fecha en la zona del país y quién la hizo | |

## 4. Editar oportunidades

El panel completo (el lápiz de «Datos de la oportunidad») y el dato rápido (pulsar el dato en la
ficha) aplican las mismas reglas.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 4.1 | A | Abrir y guardar el panel (CU-14.1) | V | En el detalle pulsa el lápiz de «Datos de la oportunidad»; cambia nombre e importe estimado; guarda | Se guardan; el encabezado y la tarjeta del kanban muestran lo nuevo; sin cotización con líneas, el importe que se ve es el estimado | |
| 4.2 | A | Cierre estimado y bitácora (CU-37.3, §49) | V | a) Cambia el cierre estimado y guarda. b) Abre el panel, no toques la fecha, cambia solo el nombre y guarda. Revisa Bitácora › Cambios | a) «Cierre estimado: antes → ahora». b) No aparece ninguna entrada nueva de cierre estimado | |
| 4.3 | A | Compromiso exige MEDDIC (CU-14.1, RN-29) | V | Con puntaje MEDDIC bajo el mínimo pon Pronóstico en «Compromiso»; guarda | Rechazo junto al campo con el puntaje y el mínimo; no se guarda. Conocido (§48): este panel puede vaciar los demás campos al rechazar; si pasa, Falla con esa referencia | |
| 4.4 | A | Reasignar propietario (CU-14.2, Q-14, CU-42.5) | G | Edita y cambia el propietario a otro vendedor activo de México; guarda | Solo se ofrecen activos que operan en el país; el vendedor anterior deja de verla; Bitácora con el cambio; las personas de la cuenta quedan compartidas con el nuevo propietario | |
| 4.5 | A | El vendedor no reasigna (CU-14.2, Q-13) | V | Abre el panel | No hay campo de propietario para él | |
| 4.6 | A | Dato rápido (CU-14.4) | V | En «Datos de la oportunidad» pulsa el pronóstico y elige otro; pulsa el cierre estimado y cambia la fecha; pulsa el origen y sal con Esc | Cada dato se vuelve control ahí mismo y guarda al elegir; Esc cancela; un rechazo deja el dato como estaba con un aviso que dice por qué | |
| 4.7 | M | Origen y persona principal (CU-14.1) | V | Cambia el origen y pon la persona principal en «Sin especificar»; guarda | Se guardan; quitar la persona principal la retira de la oportunidad, no de la cuenta | |
| 4.8 | A | Cerrada no se edita (CU-14.3) | V | Abre una ganada o una perdida | Sin lápiz ni datos rápidos; en su lugar «Reabrir» | |
| 4.9 | A | Preventa no edita (CU-44.4, CU-44.6) | P | Abre una asignada | Todo en solo lectura, con «Responsable de preventa» en los datos y sin lápiz; la pestaña Actividades sí deja registrar | |
| 4.10 | M | Responsable de preventa (CU-44.2, CU-44.3) | G | Edita y cambia el responsable de preventa; luego retíralo con «Sin preventa» | Solo usuarios activos con rol Preventa del país; cada cambio queda en Bitácora con los nombres; al retirarlo la cuenta Preventa deja de verla y en Actividades sus actividades dicen «Sin acceso» | |
| 4.11 | M | Fuera del alcance (CU-13.2) | V | Pega la URL del detalle de una oportunidad de otro vendedor | 404, igual que si no existiera | |
| 4.12 | M | Pestañas con conteo y en la URL (CU-13.1) | V | Recorre Resumen, Actividades, Cotización, MEDDIC, Hitos, Documentos y Bitácora; usa Atrás | Cada pestaña muestra su conteo; la URL cambia con la pestaña y Atrás vuelve a la anterior | |

## 5. Creación de cuenta de organización

Contactos › Organizaciones › «Nueva cuenta». Las cuentas se ven todas desde cualquier rol y oficina
(§18); la sede es informativa.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 5.1 | A | Alta completa (CU-22.1) | V | Nombre «QA-Cuenta 02», razón social, identificador fiscal, tipo Cliente, sector, ciudad, sede México, empleados 120, días de crédito 30, estratégica; «Crear cuenta» | Aviso «Cuenta creada»; aparece en la lista con tipo, sede y «Estratégica»; el Vendedor es el propietario | |
| 5.2 | A | Mínimo: nombre y tipo (CU-22.1) | V | Solo nombre «QA-Cuenta 03» y tipo | Se crea; sin sede definida | |
| 5.3 | A | Nombre repetido (CU-22.2) | V | Nombre de una cuenta existente de otro propietario, también con otras mayúsculas | Se rechaza diciendo que ya existe, sin decir de quién es | |
| 5.4 | A | Dato inválido conserva lo demás (CU-22.3, §48) | V | Llena todos los campos, pon «muchos» en Empleados; «Crear cuenta»; corrige a 120; luego «Cancelar» y vuelve a abrir | Señal junto a Empleados con el dato concreto; los demás campos conservan lo tecleado; al corregir la señal se apaga; tras Cancelar el formulario abre limpio y sin errores viejos | |
| 5.5 | M | Sin nombre (CU-22.3) | V | Deja el nombre vacío y crea | Señal en Nombre; nada se crea; lo demás se conserva | |
| 5.6 | M | Visible para todos (§18, CU-20.1) | G y D | Entra con el Gerente y con Dirección, esta última con la oficina CL | La cuenta QA- creada por el Vendedor se ve con cualquier rol y oficina | |
| 5.7 | M | La fila lleva a la ficha (CU-20.4, §49) | V | Pulsa una celda de la fila que no sea el nombre; Ctrl+clic en otra fila; selecciona texto de una celda con el ratón | Abre la ficha; Ctrl+clic abre en pestaña nueva; seleccionar texto no navega | |
| 5.8 | M | Ficha de la cuenta nueva (CU-25.1, CU-20.3) | V | Abre la ficha de QA-Cuenta 02 | Indicadores en cero o «—»; «Ganado 12 meses» dice «sin histórico» si no hay cierres; comité vacío; datos de la cuenta con propietario y fecha de alta | |
| 5.9 | M | Editar la cuenta (CU-24.1) | V y G | El Vendedor edita su cuenta; el Gerente edita la misma y la reasigna a otro usuario activo | Mismo formulario con los datos cargados, sede incluida; reasignar admite cualquier usuario activo sin límite de país; un error al guardar conserva lo editado | |
| 5.10 | M | El vendedor ve agregados solo suyos (CU-20.2) | V | Mira en la lista una cuenta con oportunidades de otro vendedor | Aparece sin pipeline abierto: no se deduce lo del compañero | |

## 6. Creación de contacto de persona

Una persona nace siendo de quien la captura y la ven su propietario, quien la administra (el
gerente de su país, Dirección, Administración), a quien se la comparten y quien tenga una
oportunidad en la cuenta (§29). V2 es el segundo Vendedor, sin oportunidades en las cuentas QA-.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 6.1 | A | Desde Personas (CU-23.1) | V | Contactos › Personas › «Nueva persona»: empresa QA-Cuenta 02, nombre «QA Persona 01», cargo, correo, teléfono, rol en el comité; guarda | Aparece en la lista con su empresa y el Vendedor como propietario | |
| 6.2 | A | Desde la ficha de la cuenta (CU-23.2) | V | En el comité de compra de QA-Cuenta 02 pulsa «Agregar persona» y captura otra | Nace ligada a la cuenta y aparece en el comité con su rol | |
| 6.3 | A | Desde el alta de oportunidad (CU-10.3) | V | Verifica en Personas la persona creada en el caso 1.6 | Existe, con el Vendedor como propietario | |
| 6.4 | M | Desde MEDDIC (CU-17.3) | V | En una oportunidad abre MEDDIC › Decisor económico › Evidencia › «Nueva persona…»; captura y guarda | Nace en la cuenta de la oportunidad y queda ligada al componente | |
| 6.5 | A | Validación (CU-23.1) | V | Guarda sin nombre; luego sin empresa | Señal junto al campo; nada se crea. Conocido (§48): este formulario puede vaciar los demás campos al rechazar; si pasa, Falla con esa referencia | |
| 6.6 | A | Quién la ve (CU-21.2, CU-21.3) | V2, G y D | Entra con cada uno y abre Personas | V2 no ve a QA Persona 01; el Gerente (su país), Dirección y Administración sí | |
| 6.7 | A | Compartir y dejar de compartir (CU-42.1, CU-42.2) | V y V2 | El Vendedor pulsa «Compartir» en QA Persona 01, elige a V2 y guarda; V2 la busca; el Vendedor desmarca a V2 y guarda | V2 la ve en Personas con «Solo lectura» y sin «Editar»; al desmarcar deja de verla; la bitácora registra con quién estaba y con quién queda | |
| 6.8 | M | Transferir (CU-42.3) | V | En «Compartir» cambia el propietario a V2 y guarda | V2 la administra; el Vendedor deja de verla salvo que tenga una oportunidad en la cuenta | |
| 6.9 | M | Límite por país (CU-42.4) | G y D | El Gerente intenta compartir con alguien de otro país; Dirección hace lo mismo | Al Gerente no se le ofrece en la lista; Dirección sí puede | |
| 6.10 | M | Editar solo quien administra (CU-24.2, §47) | V2 | Con una persona compartida abre Personas, la ficha de su cuenta y el comité en el detalle de una oportunidad de esa cuenta | Sin «Editar» en los tres: «Solo lectura» en Personas y «· de <propietario>» en el detalle | |
| 6.11 | M | Buscar persona (CU-04.1, CU-04.2) | V | Escribe su nombre en la barra superior (o Ctrl K) y abre el resultado | Aparece entre personas, dentro del alcance; abrirla lleva a la ficha de su empresa | |

## 7. Creación de productos

Productos › «Nuevo producto», solo con EDITAR_CATALOGOS (Administración). Precio de lista y costo
estándar van juntos o no van (§22).

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 7.1 | A | Alta con lista (CU-28.1) | A | SKU «QA-001», nombre, familia, unidad, modelo de precio, precio 1,000 y costo 600; guarda | Aparece en Catálogo con su precio vigente; en Lista de precio nace la primera vigencia desde hoy; costo y margen visibles para Administración | |
| 7.2 | A | Alta sin lista (CU-28.1) | A | SKU «QA-002» con precio y costo vacíos | Se crea marcado «sin lista» | |
| 7.3 | A | Precio sin costo (CU-28.1, §22) | A | Precio 1,000 y costo vacío; luego costo 600 y precio vacío | Se rechaza en los dos casos: van juntos o no van. Conocido (§48): el formulario puede vaciar los demás campos al rechazar; si pasa, Falla con esa referencia | |
| 7.4 | A | SKU repetido (CU-28.1) | A | Otro producto con SKU «QA-001» | Se rechaza | |
| 7.5 | M | Estrenar lista (CU-28.1b) | A | Edita QA-002 y captura precio y costo | Nace su primera vigencia desde hoy; deja de decir «sin lista» | |
| 7.6 | A | Cambiar precio (CU-28.2, RN-26) | A | Edita QA-001: precio 1,200 | Nueva vigencia; la anterior se conserva en Lista de precio; una cotización que ya tenía la línea conserva el precio viejo | |
| 7.7 | A | Dar de baja (CU-28.3, INV-15) | A | Desactiva QA-002 | No se ofrece al cotizar; sigue en el catálogo como inactivo, nada se borra | |
| 7.8 | A | Sin permiso (F-28, INV-02) | V y G | Entra a Productos con cada rol | El Vendedor ve catálogo y lista sin costo ni margen y sin «Nuevo producto» ni editar; el Gerente ve costo y margen pero tampoco edita | |
| 7.9 | M | Costo viejo (CU-26.2) | A | Con un producto cuyo costo no cambió en 60 días, mira el catálogo | El costo va en ámbar | |
| 7.10 | M | El producto en la cotización (CU-16.2, CU-16.2b) | V | En una oportunidad abre la cotización, agrega QA-001 y luego un producto sin lista | QA-001 llena el precio (y el costo solo para quien lo ve); el producto sin lista pide precio y costo para esa oportunidad, y sin VER_COSTO la línea no entra | |

## 8. Actividades

El alta vive en la pestaña Actividades del detalle; la pantalla Actividades lista, agrupa y edita.
Las horas son de la ciudad del país de la oportunidad (§20). Una actividad agendada ya es el
siguiente paso (§19).

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 8.1 | A | Agendar desde el detalle (CU-15.1) | V | Detalle › Actividades › «Nueva actividad»: tipo Llamada, asunto sugerido, fecha de mañana, 10:30 a 11:00, responsable el propio; guarda | Queda pendiente sin preguntar nada; es la «próxima actividad» de la oportunidad; en la lista con la pastilla «Por realizar»; la etiqueta de hora dice la ciudad («Hora de Ciudad de México») | |
| 8.2 | A | Registrar hecha con una pendiente viva (CU-15.2, CU-15.4) | V | Con la de 8.1 pendiente, nueva actividad, «Marcar como hecha», escribe el resultado; guarda | Aparece el campo Resultado; se guarda como «Realizada» (verde); no pregunta; la última actividad de la oportunidad avanza; no va al calendario | |
| 8.3 | A | Hecha sin nada agendado pregunta (CU-15.3) | V | En una oportunidad sin pendientes registra una hecha. a) Agenda el siguiente paso en el mismo formulario. b) En otra, «Guardar sin seguimiento» | Pregunta explícita «¿La cierras sin seguimiento?» con los campos de siguiente paso y «Guardar sin seguimiento»; nada se escribe hasta responder y lo capturado sigue. a) Se guardan las dos. b) Se guarda y la oportunidad aparece en «sin próximo paso» | |
| 8.4 | A | Marcar hecha al editar no pregunta (CU-15.14, §49) | V | Edita la pendiente de 8.1, que es la última pendiente, marca «Marcar como hecha» y guarda | Se guarda sin preguntar; pastilla «Realizada»; un aviso dice que la oportunidad quedó sin próximo paso | |
| 8.5 | A | Validaciones (CU-15.6, CU-15.7) | V | a) Asunto vacío. b) Hora de fin anterior a la de inicio | a) Señal en el asunto y lo demás se conserva. b) La duración en rojo al capturar; al guardar, rechazo junto a Fin | |
| 8.6 | M | Horas de la ciudad (CU-15.8) | D | En una oportunidad chilena captura 10:30; mira la pestaña y la agenda | La etiqueta dice «Hora de Santiago»; en la pestaña y en la agenda se lee 10:30 | |
| 8.7 | M | Responsable (CU-15.9) | V | Agenda con otro usuario activo del país como responsable | Aparece en la agenda de ese usuario; no hay puerta por rol | |
| 8.8 | A | Lista (CU-29.1, CU-29.5) | V | Entra a Actividades | Pendientes y hechas de las últimas dos semanas con qué, estado, tipo, fecha y hora, responsable y lápiz; vencidas primero y hechas al final; debajo las oportunidades sin próximo paso con «Agendar»; solo lo suyo | |
| 8.9 | A | Kanban (CU-29.3) | V | Pulsa «Kanban» | Cuatro columnas: por realizar, en progreso, realizadas en verde y vencidas en coral; no se arrastra; el lápiz edita | |
| 8.10 | A | Semana y navegación (CU-29.4, CU-30.3) | V | Pulsa «Semana»; luego «›», «‹» y «Hoy»; copia la URL | Siete días desde el lunes con hoy marcado; bloques por hora, verde lo hecho y coral lo vencido; la cabecera suma las horas del día; la tira dice el rango y la URL lleva `semana=`; «Hoy» solo aparece fuera de la semana en curso | |
| 8.11 | A | Editar en el sitio (CU-29.2, CU-15.13) | V | Desde la lista y desde la semana pulsa el lápiz y reprograma | El mismo formulario del detalle; al guardar la actividad cambia de estado o de columna | |
| 8.12 | M | Estado en el detalle (CU-13.3, §49) | V | Con una vencida, una en curso, una de mañana y una hecha, abre el detalle › Actividades | Cada una con su pastilla: Vencida en coral, En progreso, Por realizar, Realizada en verde | |
| 8.13 | M | Indicadores y contador (CU-05.1, F-29) | V | Compara «vencidas» y «hoy» con el contador de Actividades en el menú | Coinciden | |
| 8.14 | M | Preventa (CU-44.5, CU-29.7) | P y G | Preventa registra una actividad en una asignada; el Gerente le retira el apoyo; Preventa vuelve a Actividades | Puede registrar y editar; tras retirarlo la oportunidad va apagada con «Sin acceso», sin enlace ni lápiz, en lista, kanban y semana | |
| 8.15 | B | Calendario de Microsoft 365 (CU-15.1, CU-15.10) | V | Si el calendario está configurado, agenda y abre el calendario del responsable; si no, verifica que no se mencione | Aparece el evento y la fila dice «en el calendario»; sin credenciales no se menciona; si falla, un aviso lo dice y la actividad se guarda igual | |
| 8.16 | M | Cerrada no pregunta (CU-15.5) | V | En una ganada registra una hecha sin siguiente paso | No pregunta | |

## 9. Objetivos

La medición es acumulada: la cuota de Q1 al trimestre elegido contra lo ganado (cierre real) en ese
tramo (§17). Dos vistas en la URL: Objetivos (la cuadrícula) y Avance (§34). Usar la oficina MX y el
año fiscal en curso.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 9.1 | A | Capturar la cuadrícula (CU-33.1) | A | Vista Objetivos, métrica Venta: teclea Q1 a Q4 para dos vendedores; «Guardar cambios» una sola vez | Se guarda en un viaje; el total anual de cada fila es la suma de sus trimestres; en la bitácora una entrada por cuota que cambió, con la cifra anterior | |
| 9.2 | A | Agregar y eliminar vendedor (CU-33.5, CU-33.6) | A | «+ Agregar vendedor» y elige a un activo del país sin fila; luego «Eliminar» en otra fila; guarda | El nuevo nace con los cuatro trimestres en cero; eliminar borra sus cuotas del año y cada una queda en bitácora con lo que tenía | |
| 9.3 | M | Guardar sin cambios y descartar (CU-33.7, CU-33.8) | A | Pulsa «Guardar cambios» sin tocar nada; luego teclea algo y «Descartar» | «Nada que guardar» y no se escribe nada; descartar devuelve la cuadrícula a lo guardado | |
| 9.4 | A | Utilidad mayor que la venta (CU-33.2) | A | Conmuta a Utilidad y pon en un trimestre más que su venta; guarda. Repite en un trimestre con venta en cero | Se rechaza con venta: sería un margen arriba del 100 %; con venta en cero se acepta | |
| 9.5 | A | El gerente no fija cuotas (CU-33.4) | G | Entra a Objetivos | Ve la cuadrícula sin poder editar ni guardar | |
| 9.6 | A | Avance acumulado (CU-31.2, §17) | G | Pulsa «Avance» y elige Q2 en la tira | Los cuatro indicadores con lo acumulado de Q1 y Q2 contra lo ganado por cierre real en ese tramo; la tira muestra cada trimestre por separado | |
| 9.7 | A | El vendedor ve solo su renglón (CU-31.5) | V | Entra a Objetivos y a Avance | Solo su fila; sin la tabla del equipo ni las cuotas de los demás | |
| 9.8 | M | Tabla del equipo (CU-32.1) | G | En Avance mira la tabla | Por persona: cuota acumulada, logrado, cumplimiento, arrastre y cobertura, y cuántos van por debajo; el total es la suma de las filas visibles | |
| 9.9 | M | Venta o utilidad (CU-31.3) | G | Conmuta la métrica en Avance | La utilidad se mide con la de la cotización de cada ganada | |
| 9.10 | M | Sin cuota fijada (CU-31.6) | A | Cambia la oficina a CO | En Objetivos la cuadrícula vacía invita a agregar al primer vendedor; en Avance, vacío con el enlace a Objetivos | |
| 9.11 | M | Cambiar de año (CU-31.4) | G | Abre el selector de año | Solo se ofrecen años con cuota, más el en curso | |
| 9.12 | M | Lo ganado suma (F-31, §10.2) | G | Marca ganada una oportunidad QA- de un vendedor con cuota (necesita cotización con líneas e hitos cuadrados); vuelve a Avance | «Logrado» sube por el neto de la cotización en el trimestre del cierre real; la cobertura usa el cierre estimado de las abiertas | |

## 10. Análisis

Tres pestañas de gráficas con filtros y lapso en la URL. El costo solo llega a quien tiene
VER_COSTO (INV-02). Ejecutar con el Gerente salvo que se diga otra cosa.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 10.1 | A | Acceso por rol (CU-36.1, CU-36.2) | V y G | El Vendedor abre `/analisis`; el Gerente entra desde el menú | 403 para el Vendedor, no una pantalla vacía; el Gerente ve tres pestañas e indicadores de dos líneas | |
| 10.2 | A | Filtros en la URL (CU-36.3) | G | Filtra por país y por vendedor con «Aplicar»; copia la URL en otra pestaña | Recorta dentro del alcance; la otra pestaña reproduce lo mismo; el Gerente solo ve sus países y la oficina activa no recorta aquí | |
| 10.3 | A | Lapso (CU-36.4, §45) | G | En «Lapso» elige Año, luego Trimestre Q3, luego Mes, luego Rango con desde posterior a hasta y después en orden | La pastilla dice el lapso («Q3 2026», «sep 2026», «1 jul – 30 sep 2026») y la URL lleva `anio=`, `q=`, `mes=` o `desde=`/`hasta=`; el rango en desorden no se aplica; un valor inválido en la URL vuelve al año en curso | |
| 10.4 | A | Avance contra objetivo (CU-39.1, CU-39.2) | G | En Ventas agrupa por trimestre, cliente, producto y tipo; luego pon el lapso en un mes y mira la cuota | Barras de lo ganado por cierre real; por trimestre los cuatro en orden con la cuota como barra clara; con mes o rango no hay barra de cuota y los indicadores de cuota y cumplimiento dicen «sin cuota comparable en este lapso» | |
| 10.5 | M | Histórico (CU-39.3) | G | Agrupa por año y por trimestre | Toda la historia sin importar el lapso; barras de lo ganado y, con VER_COSTO, la utilidad como línea; variación en el tooltip | |
| 10.6 | A | Rentabilidad y margen (CU-39.4, CU-39.5, CU-39.6) | D y G | Dirección mira las dos tarjetas; el Gerente (sin VER_COSTO si la matriz lo dice así) abre la pestaña | Barras apiladas costo y utilidad con la venta al final; margen de 0 a 100 %; una pérdida en coral; sin permiso, aviso en la tarjeta y sin línea de utilidad en el histórico, nunca ceros | |
| 10.7 | A | Detalle al pulsar en Ventas (CU-39.8) | G | Pulsa una barra de ganado; cierra con Escape, con la ✕ y con un clic fuera | Popup con los renglones del tooltip y la lista de ventas que suman la barra (folio con enlace, cuenta, vendedor, cifra y fecha de cierre); los tres cierres funcionan | |
| 10.8 | A | Forecast: embudo, filtros y distribución (CU-40.1 a CU-40.3) | G | Abre Forecast; aplica probabilidad mínima 50 % y una categoría; agrupa la distribución por cliente y por vendedor | Una barra por trimestre de cierre estimado con el ponderado en verde; los filtros mueven gráfica, distribución e indicadores y quedan en la URL; la distribución va de mayor a menor con `g4` en la URL | |
| 10.9 | M | Ciclo, antigüedad, dispersión y las 20 mayores (CU-40.4 a CU-40.7) | G | Recorre las cuatro tarjetas | Ciclo con la mediana como línea; barras agrupadas por vendedor (abiertas, estancadas, sin actividad, vencidas); puntos edad por importe coloreados por el estado de su etapa; tabla de 20 con el folio enlazado | |
| 10.10 | M | Detalle al pulsar en Forecast (CU-40.8) | G | Pulsa la barra «Estancadas» de un vendedor y luego un punto de la dispersión | El popup lista las estancadas de ese vendedor con desde cuándo; el punto abre la ficha de esa oportunidad | |
| 10.11 | A | Actividad y MEDDIC (CU-41.1 a CU-41.5, CU-41.7) | G | Abre la pestaña con el lapso en el año | Actividad por vendedor con una serie por tipo; actividad por mes con los doce meses del año fiscal; abiertas en azul y sin siguiente paso en coral; salud MEDDIC con «Mínimo: 70»; tabla de las que están en cierre bajo el mínimo; indicadores en coral cuando hay deuda | |
| 10.12 | M | Detalle al pulsar en Actividad (CU-41.8) | G | Pulsa la barra de un mes y una etapa de salud MEDDIC | La lista de actividades de ese mes (asunto, oportunidad, fecha, tipo y quién); las abiertas de la etapa con su puntaje en semáforo | |
| 10.13 | B | Pantalla angosta | G | Reduce a 400 px de ancho en las tres pestañas | Una columna de tarjetas; sin scroll horizontal de página | |

## 11. Administración

Usuarios, configuración en lectura y la matriz de permisos. Es el primer bloque a ejecutar: deja
listas las cuentas de prueba.

| ID | P | Caso | Rol | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|
| 11.1 | A | Alta previa de usuario (CU-35.1, CU-01.1) | A | Usuarios › nuevo: correo de Microsoft real, nombre, rol Gerente de país, país MX; guarda. Esa persona entra con Microsoft | El perfil queda sin vincular; al entrar se vincula por correo (sin distinguir mayúsculas) y cae en el pipeline con su rol | |
| 11.2 | A | Ingreso sin perfil (CU-01.2, CU-35.3) | A | Alguien de Avattar sin perfil entra con Microsoft; Administración le da acceso desde la lista de quienes entraron sin perfil | Cae en «Acceso no configurado»; aparece en Usuarios; al asignarle rol y país entra | |
| 11.3 | A | Editar y desactivar (CU-35.2, CU-01.3) | A | Cambia rol y países de un usuario de prueba; desactívalo; él intenta entrar | Los cambios quedan en bitácora; el desactivado cae en «Acceso no configurado» | |
| 11.4 | A | Nadie se quita a sí mismo (CU-35.2, §15) | A | Intenta desactivarte o quitarte el rol de Administración | Se rechaza | |
| 11.5 | M | Configuración en lectura (CU-34.1, CU-34.2, CU-34.4) | A y D | Abre Pipelines y etapas, Catálogos y Política comercial con cada rol | Se consultan sin edición; Dirección ve Política comercial; las etapas muestran probabilidad, días para estancada, requisitos y modo | |
| 11.6 | A | Matriz de permisos (CU-34.5, CU-34.6, §40) | A y G | Roles y permisos: abre en lectura; «Editar permisos»; desmarca VER_ANALISIS para Gerente; el Gerente abre `/analisis`; vuelve a marcarlo; «Terminar edición» | La matriz abre en lectura (—, ✓, «hasta 30 %»); cada cambio guarda al instante con bitácora; el Gerente recibe 403 sin esperar un despliegue y vuelve a entrar al restituirlo; la columna de Administración no se edita; con otro rol no hay botón | |
| 11.7 | M | Tope de descuento (CU-34.6) | A | En edición fija 30 % en «Autorizar descuento» para Gerente | En lectura dice «hasta 30 %» | |
| 11.8 | M | Sin ADMINISTRAR_USUARIOS (F-35) | G | Intenta entrar a Administración › Usuarios | No se ofrece y el servidor rechaza | |
| 11.9 | M | Cerrar sesión (CU-02.1, CU-01.5) | Cualquiera | Menú de usuario › «Cerrar sesión»; luego abre `/oportunidades` sin sesión | Vuelve al login sin texto explicativo; la ruta protegida redirige a `/login` y al entrar regresa a donde iba | |
| 11.10 | B | Diagnóstico (CU-06.1) | A | Abre `/salud` | Dice si la base responde y qué variables existen, sin credenciales ni datos de negocio | |

## Resumen y registro de ejecución

140 casos: 79 de prioridad alta, 57 media y 4 baja. Una pasada completa toma unas dos jornadas con
las cinco cuentas listas.

| Bloque | Casos | Alta | Media | Baja |
|---|---|---|---|---|
| 1. Creación de oportunidades | 18 | 12 | 6 | 0 |
| 2. Navegación entre vistas | 18 | 8 | 9 | 1 |
| 3. Mover entre etapas | 10 | 6 | 4 | 0 |
| 4. Editar oportunidades | 12 | 8 | 4 | 0 |
| 5. Creación de cuenta de organización | 10 | 4 | 6 | 0 |
| 6. Creación de contacto de persona | 11 | 6 | 5 | 0 |
| 7. Creación de productos | 10 | 7 | 3 | 0 |
| 8. Actividades | 16 | 9 | 6 | 1 |
| 9. Objetivos | 12 | 6 | 6 | 0 |
| 10. Análisis | 13 | 8 | 4 | 1 |
| 11. Administración | 10 | 5 | 4 | 1 |
| Total | 140 | 79 | 57 | 4 |

**Registro de ejecución.** Una fila por pasada.

| Fecha | Ambiente y commit | Probador | Ejecutados | Pasan | Fallan | Bloqueados |
|---|---|---|---|---|---|---|
| | | | | | | |

**Incidencias.** Una fila por fallo, con el ID del caso.

| Caso | Qué se vio | Captura | Severidad | Estado |
|---|---|---|---|---|
| | | | | |

**Lo que este plan no cubre.** Cotización (F-16), MEDDIC (F-17), hitos (F-18), documentos (F-19),
marcar ganada o perdida (F-38), reabrir (F-43), la bitácora completa (F-37) y el buscador global
(F-04) solo entran donde otro caso los necesita. Se agregan como bloques 12 a 15 cuando se pidan.
