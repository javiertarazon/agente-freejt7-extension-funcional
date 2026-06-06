# 26. Propuesta de Corte Limpio y Mapa de Archivos

Estado: aprobado (incluye integracion Hermes)
Fecha: 2026-05-02
Actualizacion: 2026-05-02 - Archivos de Hermes agregados al mapa de corte limpio
Objetivo: indicar exactamente que archivos del repo actual se conservan, cuales se congelan y cuales se reemplazan primero durante la migracion hacia Free JT7 vNext.

## 1. Regla de corte limpio

La regla operativa del corte limpio es:

- conservar lo que ya calcula, verifica o gobierna correctamente
- congelar lo que solo debe sobrevivir como compatibilidad temporal
- reemplazar primero lo que hoy define la experiencia de “extension”

## 2. Archivos que se conservan y evolucionan

| Archivo | Decision | Razon | Rol en vNext |
| --- | --- | --- | --- |
| `src-js/core/freejt7-agent-core-v2.js` | conservar y evolucionar | ya contiene planner, tools, verifier y trazabilidad | kernel operativo del agente |
| `src-js/core/freejt7-agent-runtime.js` | conservar y reencuadrar | ya es el punto natural de runtime del producto | fachada del runtime principal |
| `src-js/core/session-engine.js` | conservar y endurecer | ya modela sesiones y continuidad | session kernel |
| `src-js/core/policy-engine.js` | conservar y endurecer | ya existe una politica operativa real | policy plane |
| `src-js/core/audit-bus.js` | conservar | ya aporta trazabilidad util | audit plane |
| `src-js/core/provider-registry.js` | conservar | ya es la mejor semilla del catalogo unificado | provider/model plane |
| `src-js/core/provider-config.js` | conservar | ya concentra configuracion de provider/model | provider/model plane |
| `src-js/core/provider-router.js` | conservar y reducir | sirve como dispatcher, no como owner del producto | routing de providers subordinado al runtime |
| `src-js/core/api-provider-adapter.js` | conservar temporalmente como owner | es el adapter real ya operativo del repo | adapter principal hasta consolidacion final |
| `scripts/freejt7-owned-control-plane.js` | conservar y endurecer | ya expresa ownership de app/perfil | control-plane del producto |
| `scripts/freejt7-app-bootstrap.js` | conservar y evolucionar | ya prepara la app propia | bootstrap de producto |
| `scripts/freejt7-own-ide-bootstrap.js` | conservar y evolucionar | ya gobierna el perfil own-ide | bootstrap del IDE propio |
| `src-js/memory/context-hierarchy.js` | conservar | ya aporta estructura de contexto reutilizable | memory plane |
| `src-js/memory/context-integration.js` | conservar | ya integra memoria/contexto | memory plane |
| `src-js/memory/lazy-loader.js` | conservar | util para memoria/carga diferida | memory plane |

## 3. Archivos que se congelan como compatibilidad secundaria

| Archivo | Decision | Razon | Condicion de salida futura |
| --- | --- | --- | --- |
| `package.json` | congelar como manifiesto host | sigue siendo necesario para el host actual, pero no debe definir la arquitectura del producto | retiro o reduccion cuando la shell propia mande |
| `extension.js` | congelar como bootstrap fino | solo debe cargar el runtime empaquetado | queda como entrypoint host-only |
| `src-js/core/extension.runtime.js` | congelar y adelgazar | hoy concentra demasiado ownership del producto | pasa a ser adapter del host |
| `src-js/core/copilot_router.runtime.js` | congelar | compatibilidad legado Copilot | mantener solo como integracion secundaria |
| `src-js/core/openclaw-agent-runtime.js` | congelar como backend subordinado | debe sobrevivir mientras exista esa integracion | queda bajo orchestration del runtime principal |
| `src-js/core/local-agent-runtime.js` | congelar como fallback subordinado | sigue siendo util como ruta local limitada | queda detras del runtime principal |
| `src-js/core/freejt7-owned-runtime.js` | congelar o absorber | hoy es una capa transicional | absorber comportamiento util y retirar redundancia |

## 4. Archivos que se reemplazan primero

| Archivo | Decision | Causa raiz | Sustitucion esperada |
| --- | --- | --- | --- |
| `src-js/core/control-panel.js` | reemplazar primero | concentra shell, wiring de runtime, settings, catalogo y UX en un solo modulo y sigue definiendo la sensacion de extension | shell agent-first nueva + adapter legacy fino |

`src-js/core/control-panel.js` es el primer reemplazo porque hoy es la pieza que mas claramente mantiene a Free JT7 en modo panel/webview sobre host, incluso cuando el runtime ya mejoro.

## 5. Duplicados que deben consolidarse durante el corte

| Par actual | Owner recomendado | Archivo que queda congelado como shim |
| --- | --- | --- |
| `src-js/runtime/remote-bridge.js` y `src-js/bridge/remote-bridge.js` | `src-js/runtime/remote-bridge.js` | `src-js/bridge/remote-bridge.js` |
| `src-js/runtime/agent-scheduler.js` y `src-js/scheduler/agent-scheduler.js` | `src-js/runtime/agent-scheduler.js` | `src-js/scheduler/agent-scheduler.js` |
| `src-js/runtime/plugin-runtime.js` y `src-js/plugins/plugin-runtime.js` | `src-js/runtime/plugin-runtime.js` | `src-js/plugins/plugin-runtime.js` |
| `src-js/memory/memory-orchestrator.js` y `src-js/runtime/memory-orchestrator.js` | `src-js/memory/memory-orchestrator.js` | `src-js/runtime/memory-orchestrator.js` |
| `src-js/core/api-provider-adapter.js` y `src-js/providers/api-provider-adapter.js` | `src-js/core/api-provider-adapter.js` en Hito 1 | `src-js/providers/api-provider-adapter.js` |

## 6. Archivos que deben crearse primero

Estos archivos no existen todavia, pero el corte limpio los necesita pronto:

| Nuevo modulo sugerido | Motivo |
| --- | --- |
| `src-js/app-shell/` | separar shell visible del panel legado |
| `src-js/app-shell/freejt7-shell-runtime.js` | coordinar shell agent-first con el runtime principal |
| `src-js/app-shell/freejt7-shell-state.js` | extraer estado visible de la shell fuera del monolito actual |
| `src-js/core/runtime-host-adapter.js` | reducir `extension.runtime.js` a adapter explicito |

## 6.1 Archivos de Hermes Agent a crear (integracion explicita)

**Fecha de decision**: 2026-05-02  
**Fuente**: `~/Público/REPOSOTORIOS OPCIONALES/hermes-agent/`  
**Licencia**: MIT (compatible)

| Nuevo archivo Free JT7 | Fuente Hermes | Hito | Motivo |
| --- | --- | --- | --- |
| `.github/skills/hermes/` (directorio) | `hermes-agent/skills/` (27 categorias) | H1-01-H | Skills probadas: software-development, productivity, research, mlops, github, media, creative |
| `src-js/core/credential-pool.js` | `hermes-agent/agent/credential_pool.py` | H1-06-H | Multi-credential failover con estrategias, cooldown 429/402, persistencia |
| `src-js/core/context-compressor.js` | `hermes-agent/agent/context_compressor.py` | H1-04-H | Compresion profesional con handoff framing, head/tail protection |
| `src-js/core/skill-resolver.js` | `hermes-agent/agent/skill_utils.py` | H1-04-H | Frontmatter parsing, platform matching, disabled skills |
| `src-js/core/error-classifier.js` | `hermes-agent/agent/error_classifier.py` | H1-04 | FailoverReason enum, classify_api_error |

### Detalle de skills de Hermes a importar

```
.github/skills/hermes/
├── software-development/    # git, testing, debugging, refactoring
├── productivity/            # automation, scheduling, notes
├── research/                # web search, analysis, summarization
├── mlops/                   # ML operations, training, deployment
├── github/                  # issues, prs, actions, repos
├── media/                   # images, video, audio processing
├── creative/                # writing, design, content
├── data-science/            # analysis, visualization, pandas
├── devops/                  # docker, k8s, ci/cd
├── autonomous-ai-agents/    # agent orchestration, delegation
└── ... (27 categorias total)
```

## 7. Orden exacto del corte

### Paso 1. Proteger el nucleo

- No tocar destructivamente `freejt7-agent-core-v2.js`, `session-engine.js`, `policy-engine.js`, `audit-bus.js`, `provider-registry.js`.
- Usarlos como ancla del nuevo ownership.

### Paso 2. Reemplazar shell

- Extraer la shell visible fuera de `src-js/core/control-panel.js`.
- Mantener temporalmente `control-panel.js` solo como adapter hacia la shell nueva mientras siga existiendo el host.

### Paso 3. Reducir el host

- Adelgazar `package.json`, `extension.js` y `extension.runtime.js` al minimo necesario para arrancar la experiencia Free JT7.

### Paso 4. Consolidar duplicados

- Resolver bridge, scheduler, plugin runtime, memory orchestration y provider adapter.

### Paso 5. Cerrar compatibilidad secundaria

- Dejar Copilot/OpenClaw/local como integraciones subordinadas y ya no como definicion principal del producto.

## 8. Decisiones concretas de conservar, congelar y reemplazar

### Conservar

- `src-js/core/freejt7-agent-core-v2.js`
- `src-js/core/freejt7-agent-runtime.js`
- `src-js/core/session-engine.js`
- `src-js/core/policy-engine.js`
- `src-js/core/audit-bus.js`
- `src-js/core/provider-registry.js`
- `src-js/core/provider-config.js`
- `src-js/core/provider-router.js`
- `src-js/core/api-provider-adapter.js`
- `scripts/freejt7-owned-control-plane.js`
- `scripts/freejt7-app-bootstrap.js`
- `scripts/freejt7-own-ide-bootstrap.js`
- `src-js/memory/context-hierarchy.js`
- `src-js/memory/context-integration.js`
- `src-js/memory/lazy-loader.js`

### Congelar

- `package.json`
- `extension.js`
- `src-js/core/extension.runtime.js`
- `src-js/core/copilot_router.runtime.js`
- `src-js/core/openclaw-agent-runtime.js`
- `src-js/core/local-agent-runtime.js`
- `src-js/core/freejt7-owned-runtime.js`
- `src-js/bridge/remote-bridge.js`
- `src-js/scheduler/agent-scheduler.js`
- `src-js/plugins/plugin-runtime.js`
- `src-js/runtime/memory-orchestrator.js`
- `src-js/providers/api-provider-adapter.js`

### Reemplazar primero

- `src-js/core/control-panel.js`

### Crear desde Hermes (integracion explicita)

- `.github/skills/hermes/` ← `hermes-agent/skills/`
- `src-js/core/credential-pool.js` ← `hermes-agent/agent/credential_pool.py`
- `src-js/core/context-compressor.js` ← `hermes-agent/agent/context_compressor.py`
- `src-js/core/skill-resolver.js` ← `hermes-agent/agent/skill_utils.py`
- `src-js/core/error-classifier.js` ← `hermes-agent/agent/error_classifier.py`

## 9. Criterio de exito del corte limpio

El corte limpio del Hito 1 se considera logrado cuando:

1. `control-panel.js` deja de ser el owner de la shell visible.
2. `extension.runtime.js` deja de ser el owner del producto y queda como adapter.
3. `freejt7-agent-core-v2.js` y su runtime inmediato gobiernan el flujo principal.
4. Los duplicados criticos quedan consolidados o congelados con owner explicito.
5. Free JT7 puede explicarse tecnicamente como producto agent-first alojado temporalmente en un host, no como extension enriquecida.
6. **Skills de Hermes integradas** en `.github/skills/hermes/` con resolucion funcional.
7. **Credential pool de Hermes adaptado** a JS con failover multi-provider verificable.
