---
tipo: documento
encabezado: CRM Avattar · Manual funcional
ceja: Manual funcional
titulo: CRM\nAvattar
subtitulo: Qué hace cada pantalla, para quién y con qué reglas
portada: completa
meta:
  Sistema: CRM Avattar
  Fecha: 23 de noviembre de 2026
  Versión:
  Clasificación: Uso interno Avattar
  Elaboró:
  Revisó:
firmas:
  - | Elaboró · Avattar IT Solutions
  - | Revisó · Avattar IT Solutions
---

## Para qué sirve el CRM

El CRM Avattar es la herramienta de ventas de Avattar IT Solutions en México, Colombia y Chile. Reemplaza a Pipedrive y, además de llevar el avance de cada oportunidad por etapas, **gobierna el margen y el cobro**: cada venta se cotiza con su costo, se califica con MEDDIC y se gana solo cuando su calendario de facturación cuadra con lo cotizado.

Este manual describe lo que hoy está construido, pantalla por pantalla: qué hace, quién puede usarlo y qué reglas aplica el sistema. Sirve para capacitar al equipo comercial, para preparar pruebas y para responder «¿por qué se comporta así?».

> Todos los importes están en dólares (USD). El CRM no maneja tipo de cambio.

## Roles y qué ve cada uno

El **rol** define qué puedes hacer; la **oficina** define sobre qué datos. Primero se aplica lo que tu rol alcanza y después cualquier filtro: un filtro nunca te muestra más de lo que te corresponde.

| Rol | Qué datos alcanza | Qué cambia en pantalla |
|---|---|---|
| Vendedor | Sus oportunidades (donde es propietario), sus actividades y su renglón de objetivos | Ve el margen, no el costo ni la utilidad. No entra a Análisis. Sus indicadores se calculan solo sobre lo suyo |
| Preventa | Las oportunidades donde es responsable de preventa | Las ve en solo lectura y les registra actividades. No crea, edita, mueve, cotiza ni califica |
| Gerente de país | Oportunidades, actividades y objetivos de su oficina (puede tener varios países) | Ve costo y utilidad, el equipo en Objetivos y Análisis. Reasigna oportunidades y administra a vendedores y preventas de sus países |
| Dirección | Los tres países | Lo del gerente, más la política comercial en Configuración |
| Administración | Los tres países | Todo lo anterior, más productos, cuotas, la matriz de permisos y cualquier usuario |
| Marketing | Prospectos de sus países | Capta, valida, asigna, descarta e importa prospectos. No ve oportunidades ni objetivos |

Los permisos son datos: Administración los cambia en Configuración, en Roles y permisos, sin esperar un despliegue.

## Reglas que conviene conocer

| Regla | Qué significa en el día a día |
|---|---|
| Las cuentas se ven todas | Cualquier rol ve todas las organizaciones, desde cualquier oficina. El país vive en la oportunidad, no en la cuenta: a una misma cuenta se le vende en México y en Colombia |
| Las personas tienen propietario | Cada contacto es de quien lo captura. Lo ve su propietario, su gerente, Dirección, Administración, a quien se lo compartan y quien tenga una oportunidad en esa cuenta |
| El costo no sale del servidor | Si no tienes permiso para ver costo, el costo y la utilidad no llegan a tu pantalla; no es que se oculten |
| Los filtros viven en la dirección | Una vista filtrada se puede pegar en un correo y el botón de regresar funciona. La oficina activa es la excepción: se recuerda como preferencia |
| Nada se borra | Cuentas, personas, oportunidades, actividades y usuarios se desactivan. Los documentos y los hitos sí se quitan |
| Todo cambio sensible deja rastro | Lo que cambia una cotización, una etapa, un permiso o una cuota queda en la bitácora con quién, cuándo, antes y después |
| Los umbrales son configuración | Los mínimos MEDDIC, los días para considerar estancada una etapa, el impuesto y la probabilidad de cada etapa se leen de la configuración |

## Entrar y moverse

### Iniciar sesión
Se entra con la cuenta de Microsoft de Avattar. **El alta es administrativa**: si nadie creó tu perfil, verás «Acceso no configurado» y tu intento quedará listado en Configuración, en Usuarios, para que te den acceso. Un usuario desactivado cae en la misma pantalla. Para salir, pulsa tu nombre en la barra superior y elige «Cerrar sesión»; esto cierra la sesión del CRM, no la de Microsoft.

### Oficina activa
Si tu rol alcanza más de un país, la barra superior muestra MX, CO y CL. La oficina elegida recorta el pipeline, las actividades, los objetivos y los contadores del menú, y se recuerda durante un año. No recorta contactos ni el buscador. Con un solo país, el selector no aparece.

### Buscador
Escribe dos o más letras en la barra superior, o pulsa Ctrl K. Aparecen hasta cinco oportunidades, cinco cuentas y cinco personas de todo tu alcance, de cualquier oficina. Una oportunidad abre su detalle; una cuenta o una persona abren la ficha de la empresa.

### Menú
El menú tiene tres secciones: **Marketing** (Prospectos), **Comercial** (Oportunidades, Contactos, Productos, Actividades, Objetivos, Análisis) y **Sistema** (Configuración). Cada rubro aparece solo si tu rol lo usa. Oportunidades cuenta las abiertas y Actividades las vencidas y las de hoy. El menú se contrae a iconos y en teléfono se vuelve una tira horizontal.

## Prospectos

Marketing capta prospectos por canal (Web, LinkedIn, Redes sociales, Evento, Referido), los valida, los califica y los asigna a un vendedor, que los acepta o rechaza y los convierte en oportunidad.

### Las nueve etapas
Nuevo, En validación, Contactado, Calificado, Asignado, Aceptado, Rechazado, Convertido y Descartado. Convertido y Descartado son finales. El vendedor ve sus prospectos **a partir de Asignado**: lo que Marketing todavía valida no es suyo aunque lleve su nombre.

### Lista, kanban y detalle
- **Lista:** contacto, empresa, canal, campaña, etapa, puntaje, vendedor, ingreso, días, próxima actividad y estado del SLA. El menú de cada fila muestra solo lo que puedes hacer.
- **Kanban:** seis columnas por etapa abierta; arrastrar cambia de etapa si la transición está permitida.
- **Indicadores:** abiertos, sin asignar, sin seguimiento, SLA vencido y tasa de conversión.
- **Detalle:** al pulsar una fila se abre un popup con datos, origen, SLA y tres pestañas: actividades, información e historia.
- **Filtros y búsqueda:** por etapa, canal, campaña, vendedor e ingreso; «Solo los míos»; búsqueda por contacto, empresa, correo o teléfono.
- **Exportar:** descarga en CSV lo que estás viendo.

### Captar y gestionar
- **Nuevo prospecto:** recibe un folio PRO-AAAA-NNNNN y nace en Nuevo, o en Asignado si ya trae vendedor.
- **Importar CSV:** primero revisa fila por fila qué falta o qué está duplicado; después crea solo los válidos. Hay una plantilla descargable.
- **SLA de primer contacto:** cada país fija cuántas horas hay para el primer contacto. Llegar a Contactado, o registrar una actividad hecha, lo cumple.
- **Asignar:** a vendedores o gerentes activos del país, uno por uno o varios a la vez.
- **Descartar:** exige un motivo del catálogo.

### Convertir
Quien tiene permiso para convertir (ventas y Gerencia; Marketing no) pulsa «Convertir a oportunidad» y completa tres bloques en un solo envío:
1. **Cuenta:** si ya existe una con ese nombre viene elegida; si no, se crea. Una cuenta nueva con el nombre de otra existente se rechaza.
2. **Contacto:** de la cuenta elegida, con la persona del correo del prospecto propuesta si ya existe.
3. **Oportunidad:** nombre sugerido, pipeline del país, etapa, importe, cierre y tipo de negocio.

Las actividades del prospecto pasan a la oportunidad y el prospecto queda Convertido.

## Pipeline de oportunidades

### Cuatro vistas de lo mismo
- **Kanban:** una columna por etapa, incluidas las vacías, con conteo, probabilidad, total y ponderado de las abiertas. Cada tarjeta muestra nombre, cuenta, cierre, propietario, importe, margen, puntaje MEDDIC, banderas de riesgo y el estado del último análisis con IA.
- **Tabla:** las mismas oportunidades, renglón por renglón.
- **Embudo:** una barra por etapa con el valor abierto y la tasa de paso de los últimos 90 días. Al pulsar una barra se abre qué oportunidades la suman. A la derecha, la cola de riesgo ordenada por valor.
- **Forecast:** columnas por mes o trimestre fiscal de cierre estimado, con total, ponderado y la mezcla por categoría de pronóstico. Las abiertas con cierre ya vencido van al principio, en coral: son fechas por corregir.

### Indicadores del encabezado
| Indicador | Qué mide |
|---|---|
| Valor abierto | La suma de las abiertas que ves |
| Ponderado | Importe por la probabilidad de la etapa. MEDDIC no lo altera |
| Cierre del trimestre | Abiertas con cierre estimado en el trimestre fiscal en curso |
| Ganado | Ganadas con cierre real dentro del año fiscal en curso |
| En riesgo | Las que traen alguna bandera |

### Filtros
El botón de filtros muestra u oculta la fila de pastillas; está cerrada al entrar y lleva un punto cuando hay filtros aplicados. Se filtra por pipeline (venta o renovaciones), cliente, vendedor, lapso, estatus, pronóstico y «solo en riesgo». **Un lapso siempre dice sobre qué fecha aplica:** cierre estimado, cierre real, creación o última actividad. Por omisión se ven solo las abiertas. A un vendedor no se le ofrece el filtro de vendedor.

### Crear una oportunidad
«Nueva oportunidad» abre un formulario que te dice, junto a cada campo, qué hizo el sistema con lo que escribiste: cuenta existente o nueva, nombre sugerido, trimestre del cierre.
- **Cuenta:** elige una existente o escribe una nueva; la nueva se crea en la misma operación. Un nombre repetido se rechaza, en cualquier país.
- **Contacto principal:** opcional; con cuenta existente se eligen sus contactos o se captura uno nuevo.
- **Pipeline y etapa:** solo los pipelines de tus países. El país de la oportunidad es el del pipeline.
- **Tipo de negocio:** obligatorio.
- **Propietario y preventa:** Gerencia puede asignar el propietario; un vendedor siempre crea a su nombre.
- **Folio:** OPP-AAAA-NNNNN, consecutivo por año. No cambia nunca, ni al reabrir.

Si falta un dato, el formulario lo señala y conserva todo lo demás. Cancelar y volver a abrir empieza en limpio.

### Mover de etapa
Arrastra la tarjeta en el kanban o usa la barra de etapas del detalle. La tarjeta se mueve cuando el servidor confirma. Cada etapa puede pedir requisitos de entrada (persona con rol declarado, propuesta cargada, cotización con líneas, hitos capturados o cuadrados, decisor económico confirmado, puntaje MEDDIC mínimo, contrato u orden de compra). Si falta algo, un panel lo lista completo:
- **Etapa en advertencia:** ofrece «Mover de todos modos» y deja anotado el incumplimiento.
- **Etapa bloqueante:** no deja pasar hasta cumplir.

### Banderas de riesgo
Se calculan cada vez que se consulta; nadie las captura ni las olvida.
- **Sin actividad:** no hay siguiente actividad agendada, o la agendada ya venció.
- **Estancada:** lleva en la etapa más días que el límite de esa etapa. Registrar actividades no reinicia el contador; solo cambiar de etapa.

## Detalle de la oportunidad

Arriba, el nombre, el folio, la cuenta, el estado y las banderas; a la derecha, «Ver cuenta», «Ganada» y «Perdida». Debajo, la barra de etapas y las pestañas. La pestaña abierta queda en la dirección. Si pegas el enlace de una oportunidad que no alcanzas, verás «no encontrada», igual que si no existiera.

### Datos de la oportunidad
El lápiz abre la edición completa. Tipo de negocio, pronóstico, cierre estimado, origen y propietario también se corrigen ahí mismo, sin abrir el panel. «Compromiso» exige el mínimo MEDDIC y reasignar es de Gerencia. Una oportunidad cerrada no se edita, salvo la **fecha ganada**, que no puede ser futura y queda en la bitácora.

### Actividades
Por omisión, una actividad se **agenda**. «Marcar como hecha» la convierte en el registro de algo que ya pasó y agrega el campo Resultado.
- Las horas son las de la **ciudad del país de la oportunidad**: 10:30 en una oportunidad chilena es 10:30 en Santiago, y así se ve en todas partes.
- El responsable puede ser cualquier usuario activo del país. Lo agendado aparece en su calendario de Microsoft 365 cuando la integración está configurada; si el calendario falla, la actividad se guarda igual.
- Llamadas y videollamadas admiten pegar la **transcripción**, que se guarda tal cual y nunca va al calendario.
- Si registras una actividad hecha y la oportunidad se queda sin nada agendado, el sistema pregunta si cierras sin seguimiento. Si ya hay algo agendado, no pregunta.

### Cotización
Hay **una cotización por oportunidad**, editable mientras la oportunidad está abierta.
- Al abrirla copia la tasa de impuesto del país; un cambio posterior de tasa no la altera.
- «Editar» abre las celdas de cantidad, precio, descuento y costo; los totales se recalculan mientras tecleas y nada se guarda hasta «Guardar cambios».
- Las líneas pueden venir del catálogo (con precio y costo de la lista vigente, corregibles) o ser conceptos libres, que exigen costo.
- El neto y el margen se reflejan en la oportunidad al momento.
- Cada guardado que cambia el total deja una entrada en la bitácora con el neto anterior, el nuevo y las celdas que cambiaron.
- Sin permiso para ver costo, la columna de costo no existe para ti y no puedes capturarlo.

### MEDDIC
Cada componente se califica como No evaluado, Ausente, Parcial o Confirmado. **MEDDIC no cambia el ponderado; sirve de compuerta:** bloquea la entrada a la etapa de cierre y la categoría «Compromiso» por debajo del mínimo que fija la política comercial del país.
- Parcial se guarda aunque no tenga evidencia, y la tarjeta lo señala «Sin evidencia».
- Confirmado exige evidencia; decisor económico y campeón exigen además una persona del comité, que se puede crear desde el mismo panel.

### Hitos de facturación
Los hitos se guardan siempre como **monto**; se pueden capturar en porcentaje del neto y el sistema los convierte. El panel muestra el neto, lo asignado y lo que falta. La suma de hitos no puede rebasar el neto, y la pestaña dice cuánto falta: «faltan $200,000 por asignar». Marcar un hito como cumplido lo convierte en seguimiento de cobro.

### Documentos
Se suben propuestas, contratos u órdenes de compra y otros archivos. Un contrato u orden de compra cumple la compuerta de cierre. Se descargan con un enlace temporal.

### Bitácora
La historia de la oportunidad, de lo más reciente a lo más antiguo: cambios de etapa (y si avanzó con advertencia), cambios de cierre estimado, cambios de cotización, actividades hechas, análisis con IA, cierre y reapertura. Se filtra por Todo, Etapas, Cotización, Actividades o Cambios.

### Ganar, perder y reabrir
- **Ganada:** se puede marcar desde cualquier etapa si se cumplen tres condiciones: cotización con al menos una línea, hitos capturados y hitos que cuadran con el neto. El panel muestra cada una con su estado y dice qué falta con la cifra.
- **Perdida:** exige un motivo; si el motivo lo pide, también el competidor.
- Las dos sellan el cierre real con la fecha de hoy y quedan en la bitácora.
- **Reabrir:** solo quien tiene ese permiso en la matriz (por omisión, Administración). Vuelve a abierta en la etapa donde se cerró, con el mismo folio; cotización, hitos, MEDDIC y actividades se conservan.

### Responsable de preventa
Se asigna al crear o al editar la oportunidad, entre los usuarios de Preventa del país. Preventa ve sus oportunidades en el pipeline y en su agenda, en solo lectura, y les registra actividades.

## Análisis con IA

### Analizar desde el CRM
La pestaña **Análisis** es la primera del detalle. Quien tiene el permiso «Analizar con IA» (por omisión Vendedor, Gerencia, Dirección y Administración) pulsa el botón en una oportunidad abierta.
1. Antes de enviar, el CRM avisa que el análisis se procesará con IA y tendrá un costo aproximado de $0.08 USD para la organización.
2. Si nada cambió desde la última ficha, pregunta si quieres analizar de todos modos.
3. Mientras trabaja, la pestaña dice «Analizando...» y se actualiza sola.

El CRM manda a Claude el expediente de la oportunidad **sin costo, utilidad ni margen**: datos, etapa, MEDDIC, hitos, cotización, banderas y las últimas actividades con sus notas y transcripciones. La ficha que vuelve trae un estado (Saludable, En riesgo, Crítica o Sin información), un diagnóstico y cuatro cuadrantes: **Fortalezas, Riesgos, Siguientes pasos y Recomendaciones**. Cada punto cita la actividad que lo sostiene; el sistema verifica que la cita exista textualmente antes de guardar. Las versiones anteriores quedan plegadas y la etiqueta del último análisis aparece en la tarjeta y en la tabla del pipeline.

### Desde tu propio cliente de IA
Cada usuario puede conectar su cliente de IA (Claude, ChatGPT, Copilot) al servidor MCP del CRM, autorizándolo con su cuenta de Microsoft. El cliente consulta oportunidades, actividades y notas **con tu mismo alcance**, nunca más, y nunca recibe costo ni margen. El propietario o Gerencia pueden guardar desde ahí una ficha con la misma forma que la del botón; Preventa puede leer, no guardar.

## Actividades

Tres vistas sobre las mismas actividades, acotadas a la oficina activa:
- **Lista:** pendientes y hechas en las últimas dos semanas, con estado, tipo, fecha, responsable y lápiz para editar. Debajo, las oportunidades sin próximo paso con «Agendar».
- **Kanban:** cuatro columnas por estado: por realizar, en progreso, realizadas (verde) y vencidas (coral).
- **Semana:** de lunes a domingo, con las horas de cada día; se navega con flechas y «Hoy».

El estado se calcula: realizada, vencida, en progreso o por realizar. «Solo mías» deja las actividades donde eres responsable. Los filtros de estado, tipo, oportunidad y lapso viven en la dirección. «Nueva actividad» permite elegir la oportunidad buscando por nombre, folio o cuenta. Si dejaste de alcanzar una oportunidad, su actividad sigue en tu historial marcada «Sin acceso».

## Contactos

### Organizaciones
Todas las cuentas, desde cualquier oficina: nombre, tipo, oportunidades abiertas, pipeline, ganado en 12 meses, propietario y última actividad. Para un vendedor, los agregados se calculan solo sobre sus oportunidades. Sin cierres todavía, «Ganado 12 meses» dice «sin histórico», no cero. Al pulsar cualquier parte de la fila se abre la ficha.

### Ficha de la cuenta
Jerarquía matriz-filial, indicadores, oportunidades abiertas y cerradas, bitácora, comité de compra y datos de la cuenta. Desde aquí se crea una oportunidad con la cuenta ya puesta.

### Personas
Nombre, cargo, correo, teléfono, rol en el comité, empresa y propietario. Quien administra a una persona (su propietario, el gerente de su país, Dirección o Administración) puede editarla, **compartirla** en solo lectura con otros usuarios o **transferirla**. Al reasignar una oportunidad, las personas de la cuenta se comparten con el nuevo propietario.

## Productos

- **Catálogo:** SKU, nombre, familia, unidad, modelo de precio y precio vigente. Costo y margen solo con permiso; un costo sin actualizar en 60 días se marca en ámbar.
- **Lista de precio:** el histórico de vigencias. Cambiar un precio crea una vigencia nueva y no altera cotizaciones ya hechas.
- **Alta y edición:** con el permiso «Editar productos y cuotas». Precio y costo van juntos o no van: un producto sin lista existe y su precio y costo se fijan en cada cotización. Un producto inactivo no se ofrece al cotizar.

## Objetivos

La medición es **acumulada**: la cuota del Q1 al trimestre en curso contra lo ganado en ese mismo tramo, así que un buen trimestre paga la deuda del anterior. Lo ganado se mide con la fecha de cierre real; la cobertura, con la de cierre estimado.
- **Vista Objetivos:** cuota del año, logrado, cumplimiento y cobertura, y la cuadrícula por vendedor y trimestre.
- **Vista Avance:** lo acumulado al trimestre elegido, con la tira Q1 a Q4.
- **Venta o utilidad:** se conmuta con el permiso de ver margen.
- **El vendedor ve solo su renglón.** Gerencia, Dirección y Administración ven al equipo, con el total sumado de las filas visibles.
- **Fijar cuotas:** con el permiso «Editar productos y cuotas» se captura la hoja completa y se guarda una vez; cada cuota que cambia queda en la bitácora. Un eslabón ata los cuatro trimestres de un vendedor. Una utilidad mayor que la venta se señala al momento y apaga el guardado.
- Se ofrecen el año en curso y el siguiente.

## Análisis de ventas

Para Gerencia, Dirección y Administración; un vendedor recibe «sin permiso». Tres pestañas, filtros por país, vendedor y lapso (año fiscal, trimestre, mes o rango), todo en la dirección para compartir el enlace.

| Pestaña | Qué muestra |
|---|---|
| Análisis de ventas | Avance contra objetivo por trimestre, cliente, producto o tipo; histórico por año o trimestre; rentabilidad y margen (solo con permiso de costo) |
| Forecast | Embudo por trimestre de cierre, distribución por cliente o vendedor, ciclo de venta con mediana, antigüedad y estancamiento, dispersión edad contra importe y las 20 abiertas de mayor importe |
| Actividad y MEDDIC | Actividad por vendedor y por mes, abiertas sin siguiente paso, salud MEDDIC por etapa y las que están en cierre sin llegar al mínimo |

Cada barra o punto se puede pulsar para ver qué oportunidades o actividades lo suman, con enlace a su ficha. Donde no hay historia suficiente, la gráfica lo dice en lugar de mostrar cero. La cuota solo se compara con un año o un trimestre fiscal completos.

## Configuración

Configuración es de todo rol; cada pestaña decide quién la ve.

| Pestaña | Quién | Qué hay |
|---|---|---|
| Pipelines y etapas | Todos | Por pipeline, las etapas con probabilidad, días para estancada, requisitos y si bloquean o advierten. Solo lectura |
| Catálogos | Todos | Tipos de actividad y documento, motivos de pérdida, roles de comité, orígenes y familias, con cuántas veces se usa cada uno. Solo lectura |
| Política comercial | Dirección y Administración | Por país: MEDDIC para cierre, MEDDIC para compromiso, primer contacto de prospectos, impuesto, inicio del año fiscal y zona horaria. Solo lectura |
| Roles y permisos | Administración | La matriz de catorce permisos por los seis roles; se abre en lectura y «Editar permisos» permite cambiarla. Cada cambio aplica al momento y queda en la bitácora |
| Usuarios | Administración y Gerencia | Alta, edición y acceso de usuarios, y la lista de quienes entraron con Microsoft sin perfil. Gerencia administra solo a vendedores y preventas de sus países. Nadie se quita a sí mismo el acceso |

## Lo que todavía no está

| Pendiente | Situación |
|---|---|
| Autorizaciones de descuento | Fuera de este alcance por decisión del negocio |
| Vistas guardadas | Pendiente; los filtros ya viven en la dirección, que es el requisito |
| Editar pipelines, catálogos y política comercial desde la pantalla | Pendiente; hoy se consultan y se cambian en la base |
| Carga masiva de productos y costos | Pendiente |
| Ficha propia de una persona | Pendiente; el buscador lleva a la ficha de su empresa |
| Colombia y Chile en operación | Los pipelines existen; faltan datos, cuotas y equipos |
| Calendario de Microsoft para actividades de prospectos | Pendiente |

> Este manual describe el sistema al 23 de noviembre de 2026. Las decisiones que lo explican están en el repositorio, en docs/decisiones-pendientes.md.
