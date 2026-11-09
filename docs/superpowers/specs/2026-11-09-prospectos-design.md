# Prospectos (leads) · diseño

**Fecha:** 9 de noviembre de 2026 · **Estado:** aprobado por el negocio en sus cuatro decisiones
(rol Marketing, etapas fijas, CSV para importar y exportar, SLA en la política comercial).

Marketing capta prospectos desde varios canales, los valida y califica, y los asigna a un vendedor,
que los acepta o rechaza y, si procede, los convierte en un contacto con una oportunidad. Este
módulo es ese flujo, construido con los patrones del módulo de Oportunidades: alcance por rol en
`lib/scope`, servicios de dominio con transacción y bitácora, filtros en la URL, kanban con
arrastre nativo, barra de herramientas con filtros ocultos, paneles sobre `<dialog>`.

## 1. Modelo de datos

### Rol nuevo

`Role` gana `MARKETING`. Entra en **todos** los `switch` por rol (ocho hoy: scopes de
oportunidades, actividades, organizaciones, personas, objetivos, usuarios; `personAccess` y
`userAccess`). Marketing **no ve oportunidades ni objetivos** (alcance vacío), ve todas las cuentas
como todos (§29), ve las personas que posee o le comparten, y sus actividades propias y las de sus
prospectos. En el menú no aparecen Oportunidades ni Objetivos para quien no tiene ningún permiso de
verlas: eso lo decide la matriz, no el rol.

### Prospecto

```
model Lead {
  id                 String    @id @default(cuid())
  folio              String    @unique          // PRO-AAAA-NNNNN · LeadFolioCounter por año
  contactName        String
  email              String?
  phone              String?
  jobTitle           String?
  companyName        String
  companyIndustry    String?
  countryCode        CountryCode                 // la oficina que lo trabaja
  channelId          String                      // LeadChannel
  campaignId         String?                     // LeadCampaign
  stage              LeadStage @default(NUEVO)
  score              Int?                        // 0–100, lo pone Marketing
  notes              String?
  assignedToId       String?                     // el vendedor
  createdById        String
  stageEnteredAt     DateTime
  firstContactDueAt  DateTime                    // createdAt + SLA del país (INV-05)
  contactedAt        DateTime?                   // primera vez en Contactado o actividad hecha
  lastActivityAt     DateTime?
  nextActivityAt     DateTime?
  discardReasonId    String?                     // LeadDiscardReason, obligatorio al descartar
  organizationId     String?                     // al convertir: la cuenta reutilizada o creada
  personId           String?                     // al convertir
  opportunityId      String?   @unique           // al convertir
  createdAt / updatedAt / deletedAt
}
```

`LeadStageTransition { leadId, fromStage?, toStage, atDate, byUserId }`: historial, como
`StageTransition`. `LeadFolioCounter { year @id, lastNumber }`: contador propio para no tocar el de
oportunidades. `Activity` gana `leadId String?` con índice: la misma actividad, colgada de un
prospecto; al convertir recibe además `opportunityId` y conserva `leadId`.

Catálogos (desactivables, nunca borrados, MD-05): `LeadChannel` (Web, LinkedIn, Redes sociales,
Evento, Referido), `LeadCampaign` (nombre, canal opcional, activa), `LeadDiscardReason` (Sin
presupuesto, Sin interés, No es el perfil, Datos inválidos, Duplicado, Competencia, Otro).

`CommercialPolicy.leadFirstContactSlaHours Int @default(24)`: horas corridas desde el alta para el
primer contacto, por país. Aparece en Configuración › Política comercial (INV-05 verificable).

### Etapas

Valores fijos de `LeadStage`, porque cada uno tiene comportamiento propio, como el estatus de una
oportunidad. Es una excepción razonada a INV-13 y queda anotada en decisiones.

| Etapa | Quién la pone | Qué significa |
|---|---|---|
| NUEVO | alta o importación | Entró por un canal, nadie lo ha mirado |
| EN_VALIDACION | Marketing | Se comprueba que los datos sean reales y el perfil tenga sentido |
| CONTACTADO | Marketing, o una actividad hecha | Hubo primer contacto; sella `contactedAt` y apaga el SLA |
| CALIFICADO | Marketing | Cumple el perfil; listo para ventas |
| ASIGNADO | asignar | Tiene vendedor. Exige `assignedToId` |
| ACEPTADO | vendedor asignado o Gerencia | Ventas lo toma |
| RECHAZADO | vendedor asignado o Gerencia | Ventas lo devuelve; Marketing puede reasignar |
| CONVERTIDO | convertir | Terminal: cuenta, persona y oportunidad referenciadas |
| DESCARTADO | descartar | Terminal: con motivo del catálogo |

Transiciones (`lib/domain/leadStages.ts`, puro, con pruebas): entre NUEVO, EN_VALIDACION,
CONTACTADO y CALIFICADO se avanza y retrocede libremente para quien gestiona; a ASIGNADO solo con
vendedor; de ASIGNADO a ACEPTADO o RECHAZADO solo el asignado o quien gestiona; de RECHAZADO solo a
ASIGNADO (reasignar) o DESCARTADO; a CONVERTIDO solo por `convertir`, desde ACEPTADO (el asignado o
quien gestiona) o desde CALIFICADO y ASIGNADO (quien gestiona, saltando la aceptación); a
DESCARTADO desde cualquier no terminal, con motivo. CONVERTIDO y DESCARTADO no se arrastran.

## 2. Permisos (matriz, migración de datos + seed)

| Permiso | VENDEDOR | GERENTE_PAIS | DIRECCION | ADMINISTRADOR | PREVENTA | MARKETING |
|---|---|---|---|---|---|---|
| VER_PROSPECTOS | sí (los asignados) | sí | sí | sí | no | sí |
| GESTIONAR_PROSPECTOS (crear, editar, importar, validar, asignar, descartar) | no | sí | sí | sí | no | sí |
| CONVERTIR_PROSPECTO | sí (los suyos) | sí | sí | sí | no | no |

Alcance (`lib/scope/leads.ts`): VENDEDOR → `assignedToId = yo`; MARKETING y GERENTE_PAIS →
`countryCode in países`; DIRECCION y ADMINISTRADOR → todo; PREVENTA → nada. La oficina activa
recorta (§16). Los filtros van después.

`lib/domain/leadAccess.ts` (puro): `gestionaProspecto(session, lead)` = permiso GESTIONAR y país al
alcance; `decideComoVentas(session, lead)` = asignado, o gestiona; `convierteProspecto` = permiso
CONVERTIR y (asignado o gestiona).

## 3. Servicios (`lib/domain/lead.ts`, transacción + bitácora)

- `crearProspecto`: folio, SLA del país (por parámetro, INV-05), etapa NUEVO, transición inicial.
- `editarProspecto`: datos y puntaje; no toca etapa.
- `cambiarEtapaDeProspecto`: aplica la tabla de transiciones; sella `stageEnteredAt`, la
  transición, y `contactedAt` al llegar a CONTACTADO por primera vez. Sin bitácora de auditoría:
  la transición es su propio registro.
- `asignarProspectos(ids[], vendedor)`: masivo; el vendedor debe estar activo en el país del
  prospecto; pasa a ASIGNADO (o lo deja si ya estaba más adelante) y deja `ASIGNAR_PROSPECTO` por
  prospecto en `AuditLog`.
- `descartarProspecto`: motivo obligatorio del catálogo; `DESCARTAR_PROSPECTO`.
- `convertirProspecto`: ver §4. `CONVERTIR_PROSPECTO`.
- `registrarActividadDeProspecto` y `editarActividadDeProspecto`: la actividad de siempre con
  `leadId`; recalculan `lastActivityAt` y `nextActivityAt` del prospecto; una hecha sella
  `contactedAt` y, si está en NUEVO o EN_VALIDACION, lo pasa a CONTACTADO. Sin calendario en esta
  entrega (el adaptador de Graph recibe una oportunidad; se anota como pendiente).
- `importarProspectos(filas)`: ver §5. `IMPORTAR_PROSPECTOS` con el conteo.

`lib/domain/leadSla.ts` (puro): `estadoDeSla(lead, ahora)` → `cumplido` (hay `contactedAt`),
`en_tiempo`, `por_vencer` (queda menos del 25 % del plazo), `vencido`. Calculado, nunca guardado
(INV-11). `lib/domain/leadMetrics.ts` (puro): los cinco indicadores a partir de la lista acotada.

## 4. Conversión

Desde el detalle o la fila, «Convertir a oportunidad» abre un panel con: nombre de la oportunidad
(sugerido «Empresa · cargo o canal»), pipeline (los del país del prospecto), etapa de entrada,
importe estimado, cierre estimado, tipo de negocio y propietario (por omisión el asignado). El
servicio:

1. Busca la cuenta por nombre sin distinguir mayúsculas entre las no borradas; si no existe la crea
   con sede en el país del prospecto y propietario el vendedor.
2. Busca la persona por correo dentro de esa cuenta (o por nombre si no hay correo); si no existe
   la crea con propietario el vendedor.
3. Abre la oportunidad con `crearOportunidad` (mismo folio, misma compuerta, misma bitácora),
   con la persona como principal y el origen que corresponda al canal si existe en el catálogo.
4. En una transacción: re-apunta las actividades del prospecto a la oportunidad (conservan
   `leadId`), marca el prospecto CONVERTIDO con las tres referencias, sella la transición y deja
   `CONVERTIR_PROSPECTO` con qué se reutilizó y qué se creó.

Si el paso 4 fallara, la oportunidad ya existiría sin el prospecto marcado: es un fallo de base, no
de regla, y queda anotado como riesgo conocido; el prospecto seguiría convertible y el segundo
intento encontraría cuenta y persona ya existentes.

## 5. Importar y exportar CSV

- **Exportar:** `GET /prospectos/exportar?…` con los mismos filtros de la pantalla; un Route
  Handler que aplica el alcance y escribe CSV (UTF-8 con BOM, separador coma, cabeceras en
  español). Sin costo ni utilidad: nada que proteger por INV-02.
- **Importar:** panel en dos pasos. Primero el archivo se lee en el servidor
  (`previsualizarImportacion`, parser propio sin librería, RFC 4180 con comillas) y se devuelve
  fila por fila qué está bien y qué no: canal o campaña que no existe, país fuera del alcance,
  correo mal formado, correo que ya tiene un prospecto abierto (duplicado). Segundo, «Importar N
  válidos» crea solo esos, en una transacción, con folio cada uno y una entrada de bitácora con el
  conteo. Columnas: contacto, correo, teléfono, cargo, empresa, giro, país, canal, campaña,
  puntaje, notas. Se ofrece una plantilla descargable con esas cabeceras.

## 6. Pantalla `/prospectos`

Mismos componentes: `BarraSuperior`, `BarraDeHerramientas` (Lista · Kanban, botón de filtros
cerrado al entrar, «Nuevo prospecto», «Importar», «Exportar»), cinco `StatTile` (abiertos, sin
asignar, sin seguimiento, SLA vencido, tasa de conversión), pastillas `Desplegable`.

- **Filtros en la URL:** `etapa` (varios; por omisión las no terminales), `canal`, `campana`,
  `vendedor`, `desde`/`hasta` sobre la fecha de ingreso, `mios`, `q` (buscador: contacto, empresa,
  correo, teléfono).
- **Lista:** tabla con casilla por fila y «Asignar» masivo cuando hay selección; columnas contacto,
  empresa, canal, campaña, etapa (pastilla de color por etapa), puntaje, vendedor, ingreso, días,
  próxima actividad, SLA; menú «…» por fila con ver, asignar, registrar actividad, convertir y
  descartar. Lo que la sesión no puede hacer no se ofrece.
- **Kanban:** columnas por etapa no terminal, con la tarjeta del pipeline adaptada (`TarjetaProspecto`:
  contacto, empresa, puntaje, días, alerta de SLA) y el mismo arrastre nativo; soltar en Asignado sin
  vendedor lo dice y ofrece asignar.
- **Detalle:** panel lateral abierto desde la URL (`p=<id>`), con datos, origen (canal, campaña,
  quién lo captó), etapa y puntaje, pestañas Actividades (con `ComposerDeActividad` sobre el
  prospecto), Información y Notas, y las acciones Asignar, Agendar actividad, Convertir y Descartar.
- **Vacíos y carga:** dos vacíos como el pipeline (sin nada al alcance vs. filtros que dejaron fuera
  todo) y `loading.tsx` con los esqueletos existentes.
- Menú: rubro «Prospectos» en Comercial, con contador de abiertos sin asignar o con SLA vencido.

## 7. Pruebas

Unitarias: transiciones, SLA, acceso, métricas, parser CSV, folio. Integración: alcance por rol
(marketing, vendedor, gerente), alta con SLA del país, asignación masiva, descarte con y sin motivo,
conversión que reutiliza cuenta y persona y re-apunta actividades, importación con previsualización.
Maqueta en navegador: tabla con selección, kanban con arrastre, paneles.

## 8. Entrega

1. Modelo, rol, permisos, catálogos, alcance, dominio sin conversión, pantalla completa salvo
   convertir e importar, pruebas.
2. Conversión.
3. CSV, indicadores de SLA y conversión, documentación final.
