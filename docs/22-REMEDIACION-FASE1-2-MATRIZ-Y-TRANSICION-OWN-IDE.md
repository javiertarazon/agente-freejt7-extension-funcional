# Remediacion Fase 1-2: matriz exacta y transicion own-ide

## Objetivo

Cerrar el gap principal detectado en la auditoria: Free JT7 podia aparentar autonomia real aunque el control-plane estuviera fabricando intake, cerrando tareas sin evidencia suficiente y contaminando la continuidad con resumentes poco fiables.

Este documento deja dos entregables juntos:

1. Matriz archivo por archivo con cambio, motivo, riesgo y smoke.
2. Diseno de transicion de UI hacia un own-ide agent-first reutilizando solo piezas validas del repo externo `javiertarazon/Ide-gemini-agente-free-`.

## Matriz de cambios

| Archivo | Cambio aplicado/propuesto | Motivo tecnico | Riesgo | Smoke test |
| --- | --- | --- | --- | --- |
| `src-js/core/extension.runtime.js` | `preparePanelTask()` exige intake real y deja de aceptar intake asumido como entrada efectiva del flujo del panel. `buildAuditedRouterGoal()` solo se arma con intake verificable. | Cortar la fabricacion de contexto en el punto donde nace la tarea. Si el intake es falso, todo lo demas queda contaminado aunque el planner sea correcto. | Medio: puede cancelar tareas del panel que antes pasaban con supuestos. | Smoke manual: abrir panel, lanzar tarea sin intake y cancelar prompts. Debe emitirse cancelacion y no debe existir tarea nueva en cola. |
| `src-js/core/control-panel.js` | Guard explicito: si `prepareTask()` devuelve `null`, el panel publica `task.enqueue.cancelled` y no llama `engine.enqueueTask()`. | Evitar el bypass residual donde el panel podia seguir encolando la tarea original aunque la preparacion auditada hubiese abortado. | Bajo: afecta solo al path de cancelacion. | Smoke manual: mismo flujo anterior; comprobar evento `task.enqueue.cancelled` y ausencia de tarea en `taskIndex`. |
| `src-js/core/freejt7-agent-core-v2.js` | Gating de completion: una meta operacional no puede cerrarse en `completed` sin tools/evidencia. Si el planner intenta cerrar demasiado pronto, el core fuerza una accion determinista y replanifica. Se expone `__testing.hasCompletionEvidence` para regresion dirigida. | El mensaje falso de “operativo/listo” salia del backend real; habia que endurecer el lugar que decide `completed`, no solo el frontend. | Medio: cambia el contrato del planner y puede convertir falsos positivos en fallos explicitos. | `node tests/freejt7_agent_core_v2_smoke.js` y `node tests/freejt7_agent_core_v2_evidence_gate_smoke.js` |
| `src-js/core/session-engine.js` | Sincronizacion de `agentState` y `verification` desde evidencia real de tareas, no desde resumentes superficiales heredados. Descontaminacion del resumen de continuidad y del `continuationHint`. | La continuidad estaba reutilizando texto de cierre y hints pobres como si fueran estado fiable del agente. | Medio: puede alterar como reaparecen conversaciones antiguas, pero mejora consistencia causal. | `node tests/session_engine_controls_smoke.js` y `node tests/session_engine_context_smoke.js` |
| `src-js/core/freejt7-agent-runtime.js` | `buildContinuationPrompt()` deja de tratar `lastAssistantSummary` y `continuationHint` como verdad fuerte. Prioriza estado derivado y verificacion real. | El runtime de continuidad no debe amplificar resumentes contaminados ni convertirlos en prompt autoritativo. | Medio: puede cambiar el tono/contexto de reanudacion, pero baja alucinacion operacional. | `node tests/freejt7_agent_runtime_smoke.js` |
| `src-js/core/chat-context.js` | Reduccion del auto-context y de los capability claims internos del prompt local. Solo se mantienen señales verificables y utiles para el turno. | El system/context builder estaba metiendo ruido interno y autoafirmaciones que sesgaban al modelo hacia respuestas de “todo esta listo”. | Bajo-medio: puede bajar detalle accesorio del prompt, pero mejora veracidad del control-plane. | `node tests/chat_context_smoke.js` |
| `tests/freejt7_agent_core_v2_evidence_gate_smoke.js` | Nuevo smoke. Verifica dos cosas: que una meta operacional sin pasos/cambios no cuente como evidencia, y que el core no acepte `completed` inmediato en la primera iteracion. | Hacia falta una regresion puntual para el guard nuevo del core-v2. | Bajo: solo test. | `node tests/freejt7_agent_core_v2_evidence_gate_smoke.js` |

## Lectura del riesgo residual

- El gap de mayor severidad ya no esta en el cierre del planner ni en el intake fabricado del panel.
- El riesgo que queda abierto es de verificabilidad UX en el panel: hoy el cancel-path del intake queda cubierto por codigo y smoke manual documentado, pero no por una regresion automatizada aislada del webview.
- Ese gap es aceptable en Fase 2 porque no cambia el control-plane central; solo deja una deuda de test sobre el adaptador UI.

## Transicion UI hacia own-ide

### Principio rector

Free JT7 no debe migrar hacia un browser-shell que simule ser IDE. Debe avanzar hacia un own-ide agent-first donde la UI sea la cara del runtime real ya endurecido.

La regla de arquitectura es:

- runtime/control-plane propio de Free JT7
- UI inspirada en ergonomia workbench del repo externo
- cero reutilizacion de piezas que simulen estado, terminal o autonomia

### Que si se puede reaprovechar del repo externo

| Pieza reaprovechable | Uso recomendado en Free JT7 |
| --- | --- |
| Layout workbench con paneles laterales | Base visual para un shell own-ide mas claro: conversaciones, plan, evidencia, inspeccion de archivos y estado operativo. |
| Jerarquia visual tipo tabs/inspector | Separar `Chat`, `Plan`, `Evidencia`, `Ruta`, `Riesgo` y `Runtime` sin sobrecargar el panel actual. |
| Event stream / activity feed | Mostrar pasos reales del `SessionEngine` y del `core-v2` en vez de texto resumido opaco. |
| Pantallas de configuracion enfocadas | Rehacer settings de provider/runtime/policy/auth/fallbacks como formularios de control-plane, no como bloques dispersos. |
| Componentes de status y badges | Exponer route efectiva, backend activo, fallback, aprobaciones pendientes y SLO del panel. |

### Que no se debe copiar

| Pieza del repo externo | Motivo para no copiarla |
| --- | --- |
| Terminal simulada o pseudo-shell | Reintroduce autonomia aparente sin causalidad real. |
| Estado de workspace sintetico | Vuelve a mezclar UI con ficcion operacional. |
| Browser-first runtime como autoridad | Free JT7 ya tiene control-plane propio; la UI debe observarlo y operarlo, no reemplazarlo. |
| Resumentes optimistas como centro de la experiencia | Son precisamente la fuente del fallo auditado. |

### Arquitectura objetivo de UI

#### Capa 1: shell own-ide

- Workbench agent-first con tres zonas estables:
  - izquierda: sesiones, tareas, subagentes, cola y filtros de riesgo
  - centro: chat + plan actual + evidencia viva
  - derecha: inspector de runtime, route, archivos cambiados, verification y health

#### Capa 2: view-models del control-plane

- La UI no debe leer strings libres como fuente de verdad.
- Debe renderizar objetos estructurados ya existentes o faciles de exponer:
  - `SessionEngine.getState()`
  - `taskIndex`
  - `routeMeta`
  - `result.final.verification`
  - `coreV2.steps`
  - `operationalStatus`

#### Capa 3: timeline de evidencia

- Cada tarea debe tener timeline con:
  - intake real
  - plan
  - actions ejecutadas
  - evidence
  - changedFiles
  - residual risk
  - cierre o causa de fallo

Eso sustituye la UX actual basada en summary final como centro absoluto.

## Backlog recomendado para la transicion

### Fase UI-1

- Extraer un `panel-view-model` que transforme `engine.getState()` en bloques renderizables.
- Sustituir el resumen unico por vistas `Plan`, `Evidencia`, `Cambios`, `Ruta`.
- Mostrar `task.enqueue.cancelled` como estado visible en la conversacion/timeline.

### Fase UI-2

- Crear timeline por tarea con pasos del `core-v2` y verificaciones.
- Separar claramente `respuesta del agente` de `evidencia operacional`.
- Añadir badges persistentes de backend, fallback, policy y approval.

### Fase UI-3

- Promover el panel a shell own-ide completo reutilizando layout/ergonomia del repo externo.
- Mantener toda autoridad de ejecucion en `SessionEngine`, `ProviderRouter`, `extension.runtime` y `freejt7-agent-core-v2`.

## Smoke pack minimo para cierre de esta iteracion

- `node tests/freejt7_agent_core_v2_smoke.js`
- `node tests/freejt7_agent_core_v2_evidence_gate_smoke.js`
- `node tests/session_engine_controls_smoke.js`
- `node tests/session_engine_context_smoke.js`
- `node tests/freejt7_agent_runtime_smoke.js`
- `node tests/chat_context_smoke.js`

## Criterio de aceptacion de la siguiente iteracion

La siguiente iteracion de UI puede declararse correcta solo si:

1. El panel muestra evidencia estructurada de tareas reales, no solo summaries.
2. La cancelacion del intake se ve de forma explicita en la UI.
3. La route efectiva y los fallback quedan visibles sin inspeccionar logs.
4. Ninguna vista usa claims de capacidad o continuidad como fuente de verdad si no vienen respaldados por estado/verificacion.