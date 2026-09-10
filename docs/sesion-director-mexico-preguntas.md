---
proyecto: CRM Avattar
sesion: Director de México
objetivo: Acotar el MVP y cerrar las 7 decisiones pendientes
duracion: 30 min (núcleo) · 60 min (con extensión)
fecha: 
tags:
  - crm
  - mvp
  - descubrimiento
---

# Sesión con el Director de México · Preguntas para acotar el MVP

Guion priorizado. El **Bloque 1 al 4 es el núcleo**: si solo hay 30 minutos, sales con lo
indispensable. Los bloques 5 al 8 son la extensión a 60 minutos. El banco de reserva al final
es para cuando él abra un tema por su cuenta.

Cada pregunta trae dos líneas de apoyo:

- *Por qué* → qué está tratando de averiguar la pregunta.
- *Cambia* → qué se mueve en el alcance según lo que responda, con la referencia al documento
  de alcance (`D-xx` decisión pendiente, `C-xx` consideración, `F-xxx` funcionalidad, `RN-xx` regla).

## Cómo conducirla

1. **No le muestres el catálogo de 104 funcionalidades al inicio.** Ancla la conversación en
   "quiero todo". Muéstralo al final, si acaso, para validar el corte que ya trae.
2. **Pregunta por lo que pasó, no por lo que le gustaría.** "Llévame por la última vez que…"
   da información; "¿te gustaría que…?" da un sí automático.
3. **No aceptes adjetivos.** Si dice "muchas", "rápido", "casi siempre", pide el número.
4. **Cuando diga "es fácil, solo hay que…"**, ahí hay una regla de negocio escondida. Detente
   y desármala.
5. **Él es tu canal hacia el Gerente General.** Hay decisiones que no son suyas. En esas,
   la pregunta útil no es "¿qué decides?" sino "¿qué necesitas de mí para llevárselo?".
   Están marcadas como **[GG]** más abajo.

---

# NÚCLEO · 30 minutos

## Bloque 1 · Objetivo real del proyecto

### 1. Si en tres meses el CRM ya está operando y algo cambió para bien, ¿qué es exactamente lo que cambió?

- [ ] Preguntada
- *Por qué:* separa el objetivo verdadero de los deseables. Casi siempre es una de cuatro cosas:
  visibilidad del pipeline, control del margen, confiabilidad del pronóstico, o disciplina del equipo.
- *Cambia:* el orden de la secuencia de entrega. Si es control del margen, E2 sube antes que E1.
  Si es visibilidad, E1 se queda primero y E2 puede esperar.

**R:** 

### 2. Hoy, ¿qué es lo que no puedes ver o no puedes controlar, y por eso estamos haciendo esto?

- [ ] Preguntada
- *Por qué:* el dolor concreto. Es distinto "no sé cuánto vamos a cerrar" de "me enteré tarde
  de un descuento que no debí aprobar".
- *Cambia:* qué módulo es el corazón del MVP. También te dice qué métrica de éxito usar
  para declarar que el proyecto sirvió.

**R:** 

---

## Bloque 2 · Cómo se vende hoy

### 3. Llévame por una oportunidad real de las últimas semanas, de principio a fin, tal como pasó. ¿En qué momentos tocaron Pipedrive y en qué momentos no?

- [ ] Preguntada
- *Por qué:* es la pregunta más rentable de toda la sesión. Los huecos donde nadie tocó el
  sistema son, literalmente, los requerimientos.
- *Cambia:* valida o rompe el ciclo de vida de la oportunidad y las cinco etapas del prototipo.
  Si el flujo real no se parece a las cinco etapas, hay que rediseñarlas antes de programar.

**R:** 

### 4. ¿Qué se hace hoy fuera de Pipedrive, y por qué se salió de ahí?

- [ ] Preguntada
- *Por qué:* Excel, correo, carpetas compartidas, WhatsApp. Lo que vive afuera es lo que el
  sistema actual no resolvió. Ese es el verdadero pendiente.
- *Cambia:* puede agregar funcionalidades que no están en el prototipo, o confirmar que
  cotización (M2) e hitos (M3) son exactamente el hueco que hay que llenar.

**R:** 

### 5. ¿Cómo se cotiza hoy? ¿Quién arma el precio, en qué herramienta, y quién ve el costo?

- [ ] Preguntada
- *Por qué:* el prototipo asume que el vendedor cotiza dentro del CRM y ve su margen sin ver
  el costo unitario. Si hoy cotiza Administración en un Excel maestro, el diseño cambia por completo.
- *Cambia:* el alcance de M2 y la regla `RN-09` (ver margen y ver costo como permisos separados).
  También quién es el usuario real del cotizador.

**R:** 

### 6. ¿Cómo se pide y se autoriza hoy un descuento fuera de política? ¿Queda evidencia de quién lo aprobó?

- [ ] Preguntada
- *Por qué:* el prototipo trae un flujo de autorización con niveles y contador de vencimiento.
  Hay que saber si eso formaliza algo que ya existe o si está inventando un proceso nuevo.
- *Cambia:* M9 completo. Si hoy se aprueba verbalmente en una junta, el módulo pasa de
  "digitalizar un proceso" a "imponer uno nuevo", y eso es un riesgo de adopción, no de desarrollo.
  Ver `C-09`.

**R:** 

---

## Bloque 3 · Política comercial

### 7. El prototipo asume piso de margen del 20 %, autorización de Gerencia arriba del 15 % de descuento y de Dirección arriba del 30 %. ¿Son los números reales, o eran un ejemplo?

- [ ] Preguntada → desbloquea **D-07**
- *Por qué:* están escritos en el software como valores por omisión. Si son inventados y se
  publican así, el sistema empieza a bloquear ventas con umbrales que nadie acordó.
- *Cambia:* nada del desarrollo, todo de la operación. Y si varían por país o por tipo de
  servicio (licenciamiento contra servicios profesionales), hay que modelar esa dimensión extra.

**R:** 

### 8. ¿Cuánto tarda hoy en resolverse una autorización de descuento, y cuánto debería tardar como máximo?

- [ ] Preguntada → desbloquea **D-05**
- *Por qué:* el prototipo ya alerta que "2 vencen hoy", así que asume un plazo, pero el plazo
  no está definido en ninguna parte.
- *Cambia:* `RN-21` y `F-905`. Sin plazo no hay escalamiento posible ni alerta que tenga sentido.
  Pregunta también qué debe pasar cuando se vence: ¿escala solo, o solo avisa?

**R:** 

### 9. ¿Qué tan dispuestos están a que el sistema le diga "no" a un vendedor? Por ejemplo: no dejar avanzar de etapa sin decisor económico identificado, o no dejar cerrar sin el calendario de cobro cuadrado.

- [ ] Preguntada
- *Por qué:* es la decisión que más afecta la adopción. El prototipo trae cuatro requisitos de
  avance y una validación de cuadre que bloquean. Excelentes para la calidad del dato,
  terribles para el ánimo del equipo en el primer mes.
- *Cambia:* `F-111`, `RN-02` y `RN-06`. Mi recomendación es arrancar en modo advertencia con
  reporte semanal y volverlos bloqueantes al cierre del primer trimestre. Ver `C-09`.

**R:** 

---

## Bloque 4 · Datos y arranque

### 10. ¿De dónde sale hoy el costo de un servicio cuando se cotiza? ¿Quién lo actualiza y cada cuándo?

- [ ] Preguntada → desbloquea **D-01**
- *Por qué:* es la pregunta más importante de toda la sesión y la que suele tener la peor
  respuesta. Todo el gobierno del margen del sistema descansa en ese número.
- *Cambia:* `C-01`. Con Defontana fuera del MVP, si nadie es dueño de ese dato, el margen
  calculado será falso y las autorizaciones se volverán un trámite decorativo. Si la respuesta
  es "cada vendedor lo estima", hay que replantear el MVP o adelantar la integración.

**R:** 

### 11. Decidimos arrancar sin migrar el histórico de Pipedrive. ¿Qué reporte del primer trimestre no vas a poder armar por eso, y te causa un problema real?

- [ ] Preguntada → desbloquea **D-02**
- *Por qué:* las pantallas de Análisis y la ficha de cuenta muestran ganado a 12 meses, tasa de
  cierre, ciclo de venta y comparativos contra el trimestre anterior. Sin historia salen vacías.
- *Cambia:* `C-02`. Si la respuesta es "sí me duele", vale cargar por archivo un resumen
  agregado de 24 meses de operaciones cerradas: monto, margen, fechas y motivo, sin migrar el
  detalle. Es barato y salva los comparativos desde el día 1.

**R:** 

### 12. ¿Quién en Colombia y en Chile va a cargar sus listas de precio, sus catálogos y sus cuotas antes del arranque? ¿Ya tienen nombre esas personas? **[GG]**

- [ ] Preguntada → desbloquea **D-03**
- *Por qué:* salir con los tres países no multiplica el desarrollo, multiplica la configuración,
  y esa parte no la hace el equipo de sistemas.
- *Cambia:* `C-03`. Si no hay nombres, la recomendación honesta es salir con México y habilitar
  Colombia y Chile después, sin migración de por medio porque el modelo ya lo contempla.

**R:** 

---

# EXTENSIÓN · hasta 60 minutos

## Bloque 5 · Adopción, que es el riesgo número uno

### 13. Cuando entró Pipedrive, ¿qué pasó? ¿Cuánto tardaron en usarlo de verdad, y qué falló?

- [ ] Preguntada
- *Por qué:* es el mejor predictor de lo que va a volver a pasar. Si Pipedrive nunca se adoptó
  del todo, el problema no era la herramienta y un CRM nuevo no lo resuelve solo.
- *Cambia:* el peso que le das a la capacitación, al acompañamiento y a los primeros
  indicadores de higiene del pipeline. Puede justificar recortar más el MVP.

**R:** 

### 14. ¿Quién va a ser el dueño interno del proyecto del lado comercial? No el patrocinador: el que va a exigir todos los lunes que esté capturado.

- [ ] Preguntada
- *Por qué:* un CRM sin alguien que lo exija se muere en tres meses, por bueno que sea.
- *Cambia:* nada del alcance funcional y todo de la probabilidad de éxito. Si no hay nombre,
  eso es un hallazgo que hay que subir antes de aprobar presupuesto.

**R:** 

### 15. ¿Cuánto tiempo diario de captura crees que el equipo va a tolerar antes de empezar a evadir el sistema?

- [ ] Preguntada
- *Por qué:* convierte la adopción en un requerimiento medible en lugar de una esperanza.
- *Cambia:* cuántos campos obligatorios puede tener el alta de oportunidad y el registro de
  actividad. Es el freno directo contra pedir "un campo más porque sería útil".

**R:** 

### 16. ¿Los vendedores usan Outlook y Teams de verdad, o la venta vive en WhatsApp y en el celular?

- [ ] Preguntada
- *Por qué:* decidimos integrar M365 para calendario y correo. Si la operación real es por
  WhatsApp, esa integración es cara y decorativa.
- *Cambia:* `F-605` y `F-606`. Podría ser más valioso invertir ese esfuerzo en que la vista
  móvil sea excelente (`F-1104`) que en sincronizar un calendario que nadie abre.

**R:** 

---

## Bloque 6 · Qué pasa alrededor del CRM

### 17. Cuando se gana una venta, ¿qué pasa después? ¿Quién le avisa a quién, y qué información se vuelve a teclear en Defontana o en otro lado?

- [ ] Preguntada
- *Por qué:* revela si la integración con Defontana es realmente Fase 2 o si la doble captura
  ya es un dolor grande. También descubre el proceso de entrega y facturación que hoy es invisible.
- *Cambia:* `F-507` podría adelantarse. Y si hay un traspaso formal a operaciones, puede
  aparecer una funcionalidad que no está en el catálogo.

**R:** 

### 18. ¿Qué documentos tienen que quedar guardados por obligación —contrato, orden de compra, NDA— y hoy dónde viven?

- [ ] Preguntada
- *Por qué:* el prototipo trae documentos con versión, y el cierre exige contrato u orden de
  compra cargados. Hay que saber si eso convive con SharePoint o lo reemplaza.
- *Cambia:* el alcance de `F-407` y si hace falta integración con el repositorio actual en vez
  de almacenamiento propio.

**R:** 

### 19. ¿Cuántas oportunidades abiertas hay hoy por país, cuántas se cierran al año, y cuántos vendedores van a usar el sistema?

- [ ] Preguntada → desbloquea **D-06**
- *Por qué:* sin estos números no se puede estimar ni dimensionar. También decide si el tablero
  kanban puede cargar todo el pipeline o necesita paginación.
- *Cambia:* infraestructura, estimación y algunas decisiones de diseño de pantalla.

**R:** 

### 20. ¿Existe alguien que hoy haga funciones de preventa técnica y necesite entrar al sistema?

- [ ] Preguntada → desbloquea **D-04**
- *Por qué:* en el prototipo aparece "Preventa · Iván Cruz" firmando una demo técnica, pero ese
  rol no existe en la matriz de permisos.
- *Cambia:* si es rol propio, hay que definir si ve costo, si se le asignan actividades y si
  puede editar la cotización.

**R:** 

---

## Bloque 7 · El corte del MVP, directo

### 21. Si tuvieras que salir en tres meses con la mitad de lo que tenemos listado, ¿qué mitad eliges?

- [ ] Preguntada
- *Por qué:* obliga a priorizar a la persona con autoridad, en lugar de que el equipo técnico
  adivine. Es el momento de mostrar el resumen por módulos, no antes.
- *Cambia:* directamente el corte del MVP. Anota qué módulo suelta primero: eso te dice qué
  valora de verdad.

**R:** 

### 22. ¿Qué es lo que definitivamente NO quieres que haga este sistema?

- [ ] Preguntada
- *Por qué:* la pregunta espejo, y suele ser la más reveladora. A veces sale algo político
  ("que no calcule comisiones"), a veces algo de cultura ("que no me vigile a los vendedores").
- *Cambia:* confirma o corrige la lista de fuera de alcance, y te evita construir algo que
  después nadie quiere usar.

**R:** 

### 23. ¿Hay una fecha real detrás de esto? Fin de la suscripción de Pipedrive, cierre de año fiscal, auditoría, alguna promesa ya hecha.

- [ ] Preguntada
- *Por qué:* una fecha dura cambia el corte más que cualquier preferencia funcional.
- *Cambia:* `C-12`, la transición. Hay que fijar desde cuándo toda oportunidad nueva nace en el
  sistema nuevo, quién cierra las que quedaron abiertas en Pipedrive, y conservar una
  exportación completa antes de perder el acceso.

**R:** 

---

## Bloque 8 · Para llevar al Gerente General **[GG]**

No son decisiones del Director de México. Plantéalas como "esto necesito que suba, ¿cómo te ayudo
a armarlo?", y sal con un acuerdo de quién lo pregunta y para cuándo.

- [ ] **La cuota corporativa se fija en USD.** ¿Quién la reparte por país y por vendedor, y con qué
      periodicidad se recalcula el tipo de cambio? → `C-05`, `F-704`
- [ ] **Dueño corporativo del costo estándar.** Si Defontana no se integra en el MVP, ¿quién responde
      por que el costo esté vigente en los tres países? → `D-01`
- [ ] **¿Se autoriza la integración con Defontana** y en qué momento del plan entra? → `F-507`
- [ ] **¿Los tres países arrancan juntos o México primero?** La respuesta depende de si Colombia y
      Chile tienen responsable de configuración. → `D-03`
- [ ] **¿Quién audita las excepciones de precio** y con qué retención se guardan? Es un requisito de
      negocio, no una bitácora técnica. → `C-10`
- [ ] **Presupuesto y fecha objetivo**, para saber contra qué se está estimando.

---

# Banco de reserva

Para cuando él abra un tema o sobre tiempo.

- ¿Qué reporte armas a mano cada semana o cada mes, y cuánto tiempo te toma? *(te dice qué parte
  de M8 vale y qué parte es decoración)*
- ¿Qué campos de Pipedrive se llenan de verdad y cuáles están vacíos o con basura? *(los vacíos
  se eliminan, no se migran)*
- ¿El vendedor debe ver el costo unitario, o solo su margen? ¿Hoy qué ve? → `RN-09`
- ¿Los tres países venden lo mismo, con las mismas etapas y la misma política comercial?
  → decide si son tres configuraciones o tres sistemas
- ¿Hay ventas por partner o canal donde el precio no lo pone Avattar? *(rompe el modelo de
  listas de precio)*
- ¿Existen renovaciones recurrentes y quién las persigue hoy? *(el prototipo ya trae un pipeline
  de Renovaciones MX con 3 etapas)*
- ¿Qué pasa cuando un cliente pide cambiar el alcance a media negociación? *(versionado de
  cotización, `F-208`)*
- ¿Alguna vez perdieron una venta por tardanza en autorizar un descuento? *(cuantifica el costo
  de no tener M9)*
- ¿Hay información comercial que un gerente de un país NO deba ver de otro país? → `RN-14`
- ¿Cuántos usuarios necesitan entrar sin ser vendedores? *(marketing, dirección, operaciones)*

---

# Con qué debes salir de la sesión

- [ ] Las siete decisiones con respuesta o con dueño y fecha: `D-01` a `D-07`
- [ ] Un nombre para el dueño interno del proyecto del lado comercial
- [ ] Los números de volumen: oportunidades abiertas por país, cerradas al año, vendedores
- [ ] Confirmación o corrección de los umbrales de política comercial
- [ ] Postura sobre requisitos de etapa: bloqueantes desde el día 1, o advertencia el primer trimestre
- [ ] Si los tres países arrancan juntos o México primero
- [ ] Fecha real, si existe
- [ ] Lista de lo que él quiere fuera del alcance

## Notas y acuerdos de la sesión

**Fecha:** 
**Asistentes:** 

**Acuerdos:**

- 

**Pendientes y responsables:**

- 

**Lo que cambia en el documento de alcance a partir de esta sesión:**

- 
