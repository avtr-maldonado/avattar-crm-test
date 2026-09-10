# Alcance funcional del CRM Avattar — v1 para revisión

Agosto 2026. Derivado del prototipo aprobado en Claude Design.

- Página navegable: https://claude.ai/code/artifact/bc6500c2-7686-41ea-91f1-849c51e6a826
- Documento Word: entregado en la conversación (29 páginas, mismo contenido).

## Decisiones de alcance tomadas

| Ámbito | Decisión |
|---|---|
| Cobertura | MX, CO y CL productivos desde la v1: multimoneda, listas por país, consolidado en USD |
| Integraciones | Entra ID (SSO) y M365 (calendario y correo). Defontana **fuera** del MVP |
| Datos históricos | Arranque en limpio, sin migrar Pipedrive |
| Método | Cerrar el «qué» antes del modelo de datos y el stack |

## Corte del MVP

104 funcionalidades en 11 módulos: 75 MVP, 2 MVP parcial, 17 Fase 2, 10 fuera de alcance.
18 casos de uso (9 en la ruta crítica). 26 reglas de negocio.

El MVP se queda con tres cuartas partes del catálogo porque esto es el reemplazo de un
sistema en uso diario, no un producto nuevo: el piso lo fija Pipedrive, no la ambición.

## Reglas de negocio que ya venían en el prototipo (confirmar o corregir)

- Probabilidad por etapa: 10 / 25 / 50 / 75 / 90 %
- Días para estancada por etapa: 14 / 21 / 30 / 21 / 10
- Autorización de descuento: > 15 % Gerencia de país, > 30 % Dirección
- Piso de margen: 20 % global, 10 % por línea
- No se gana sin que la suma de hitos iguale el neto de la cotización
- Ver margen y ver costo unitario son permisos independientes
- El tipo de cambio se congela al ganar
- Cobertura sana de pipeline: 3× a 4× sobre la brecha de cuota

## Contradicciones detectadas entre el prototipo y el MVP decidido

1. **C-01 (alto)** — El prototipo dice que el SKU nace en Defontana, pero la integración
   quedó fuera. Sin fuente automática, el costo estándar se desactualiza y el margen que
   dispara las autorizaciones deja de ser confiable. Necesita responsable de datos.
2. **C-02 (alto)** — Arrancar en limpio deja vacías las pantallas de Análisis y de ficha de
   cuenta (ganado 12 meses, tasa de cierre, ciclo de venta, comparativos). Recomendación:
   cargar un resumen histórico agregado de 24 meses, solo cerradas.
3. **C-03 (medio)** — Tres países no multiplican el desarrollo, multiplican la configuración.
   Sin responsable de configuración en CO y CL, es riesgo de datos.
4. **C-04 (medio)** — El impuesto está fijo en 16 % en el prototipo; debe ser parámetro por país.

## Secuencia de entrega sugerida

E1 núcleo comercial → E2 cotización y gobierno del margen → E3 cobro y medición →
E4 consolidación regional. E1 antes que E2, sin excepción.

## Decisiones pendientes antes de estimar

D-01 responsable del catálogo y costos · D-02 ¿se carga histórico agregado? ·
D-03 responsables de configuración en CO y CL · D-04 ¿Preventa es rol propio? ·
D-05 plazo de respuesta de una autorización · D-06 volumen real de operación ·
D-07 confirmación de los umbrales de política comercial.

## Siguiente paso

Cerrar las siete decisiones pendientes y pasar al modelo de datos y la selección de tecnologías.
