# 25. Hito 1 Backlog Ejecutable por Modulos

Estado: aprobado y en ejecucion (incluye integracion Hermes)
Fecha: 2026-05-02
Actualizacion: 2026-05-02 - Tareas de integracion Hermes agregadas (H1-01-H, H1-04-H, H1-06-H)
Objetivo del Hito 1: cortar el ownership de Free JT7 respecto del modelo de extension/panel y mover la experiencia principal a una shell agent-first sostenida por control-plane y runtime propios.

## 1. Criterio de salida del Hito 1

El Hito 1 termina solo si se cumplen estas cinco condiciones:

1. La shell principal deja de depender estructuralmente de `src-js/core/control-panel.js` como monolito.
2. El runtime principal pasa a estar gobernado por `src-js/core/freejt7-agent-core-v2.js` y sus contratos inmediatos.
3. El control-plane del perfil app-owned se vuelve la fuente de verdad operativa.
4. La compatibilidad con extension/chat participant queda encapsulada como capa secundaria.
5. Los duplicados de bridge, scheduler, plugin, memory y provider adapter quedan consolidados o formalmente congelados como shim.

## 2. Secuencia ejecutable

| ID | Resultado | Archivos actuales a tocar | Accion concreta | Verificacion primaria |
| --- | --- | --- | --- | --- |
| H1-01 | Reafirmar ownership del perfil | `scripts/freejt7-owned-control-plane.js`, `scripts/freejt7-app-bootstrap.js`, `scripts/freejt7-own-ide-bootstrap.js` | Endurecer el control-plane del perfil como fuente unica del modo de producto, runtime, provider/model y flags de shell vNext | `tests/freejt7_app_bootstrap_smoke.js`, `tests/freejt7_own_ide_bootstrap_smoke.js` |
| **H1-01-H** | **Integrar skills de Hermes** | `.github/skills/hermes/` (nuevo) | **Copiar skills de Hermes Agent (27 categorias) con atribucion**. Incluir: software-development, productivity, research, mlops, creative, github, media | **Smoke de skill resolution sobre skills importadas** |
| H1-02 | Reducir al host a adaptador | `package.json`, `extension.js`, `src-js/core/extension.runtime.js`, `src-js/core/copilot_router.runtime.js` | Mover responsabilidades de producto fuera del host y dejar estos archivos como bootstrap y compatibilidad secundaria | `tests/own_ide_installed_extension_smoke.js`, `tests/own_ide_panel_headless_e2e_smoke.js` |
| H1-03 | Cortar el monolito de shell | `src-js/core/control-panel.js` | Dividir la shell visible en superficie agent-first y adaptador legacy, extrayendo wiring de runtime, catalogo y settings fuera del archivo monolitico | `tests/control_panel_ui_smoke.js`, `tests/control_panel_script_syntax_smoke.js`, `tests/panel_execution_mode_smoke.js` |
| H1-04 | Centralizar el runtime principal | `src-js/core/freejt7-agent-runtime.js`, `src-js/core/freejt7-agent-core-v2.js`, `src-js/core/session-engine.js`, `src-js/core/policy-engine.js`, `src-js/core/audit-bus.js` | Reforzar `core-v2` como owner del flujo y hacer que session/policy/audit converjan sobre ese contrato. **Referenciar run_agent.py de Hermes para loop de tools** | `tests/freejt7_agent_runtime_smoke.js`, `tests/freejt7_agent_core_v2_smoke.js`, `tests/freejt7_agent_core_v2_evidence_gate_smoke.js` |
| **H1-04-H** | **Integrar memory y context de Hermes** | `src-js/core/context-compressor.js` (nuevo), `src-js/memory/` | **Adaptar context_compressor.py y memory_manager.py de Hermes**. Compresion profesional con handoff framing + MemoryProvider abstracto | **Smoke de context compression sobre sesion larga** |
| H1-05 | Encapsular compatibilidad OpenClaw y local | `src-js/core/openclaw-agent-runtime.js`, `src-js/core/local-agent-runtime.js`, `src-js/core/freejt7-owned-runtime.js` | Convertir estos runtimes en backends subordinados del runtime principal en vez de rutas paralelas de primer nivel | `tests/local_agent_runtime_smoke.js` |
| H1-06 | Unificar el plano de providers/modelos | `src-js/core/provider-registry.js`, `src-js/core/provider-config.js`, `src-js/core/provider-router.js`, `src-js/core/api-provider-adapter.js`, `src-js/providers/api-provider-adapter.js` | Elegir una sola fuente de verdad del catalogo y congelar el adapter duplicado | `tests/provider_registry_config_smoke.js`, `tests/provider_model_catalog_smoke.js`, `tests/provider_router_failover_smoke.js`, `tests/provider_direct_mode_smoke.js` |
| **H1-06-H** | **Integrar credential pool de Hermes** | `src-js/core/credential-pool.js` (nuevo) | **Adaptar credential_pool.py de Hermes**. Multi-credential failover con estrategias (round-robin, least-used), cooldown por 429/402, persistencia | **Smoke de failover multi-credential** |
| H1-07 | Consolidar bridges remotos | `src-js/runtime/remote-bridge.js`, `src-js/bridge/remote-bridge.js` | Nombrar un owner unico del bridge remoto y dejar el otro archivo solo como shim o wrapper temporal | smoke nuevo de bridge o reuso de pruebas de own-ide E2E |
| H1-08 | Consolidar scheduler | `src-js/runtime/agent-scheduler.js`, `src-js/scheduler/agent-scheduler.js` | Resolver cual modulo queda como owner del scheduling y mover consumers al owner elegido | smoke nuevo de scheduler o validacion por `own_ide_continuity_e2e_smoke.js` |
| H1-09 | Consolidar plugin runtime | `src-js/runtime/plugin-runtime.js`, `src-js/plugins/plugin-runtime.js` | Definir un owner unico del runtime de plugins y congelar el alias restante | smoke de plugin runtime o validacion integrada de arranque |
| H1-10 | Consolidar memory orchestration | `src-js/runtime/memory-orchestrator.js`, `src-js/memory/memory-orchestrator.js`, `src-js/memory/context-hierarchy.js`, `src-js/memory/context-integration.js`, `src-js/memory/lazy-loader.js` | Mover la memoria a un dominio unico y hacer que el runtime la consuma como capability real | `tests/own_ide_continuity_e2e_smoke.js` |
| H1-11 | Endurecer la verificacion del modo producto | `tests/own_ide_panel_headless_e2e_smoke.js`, `tests/own_ide_continuity_e2e_smoke.js`, `tests/control_panel_state_regression_smoke.js` | Reorientar las pruebas E2E para validar shell agent-first y ownership del control-plane | pruebas existentes + smoke nuevo si aparece shell nueva |
| H1-12 | Cerrar trazabilidad del corte | `docs/TASKS.md`, `copilot-agent/tasks.yaml`, `copilot-agent/audit-log.jsonl`, `copilot-agent/RESUME.md` | Mantener el plan ejecutable, auditar decisiones y dejar evidencia de cada slice | verificacion documental + `doctor --strict` si aplica |

### 2.1 Tareas de integracion Hermes (paralelas)

Las tareas marcadas con **-H** son integraciones de codigo reusable de Hermes Agent. Pueden ejecutarse en paralelo a las tareas principales del mismo bloque.

| Tarea Hermes | Depende de | Paralela a | Fuente |
| --- | --- | --- | --- |
| H1-01-H (skills) | - | H1-01 | `hermes-agent/skills/` → `.github/skills/hermes/` |
| H1-04-H (memory/context) | H1-04 | H1-04 | `hermes-agent/agent/memory_manager.py`, `context_compressor.py` |
| H1-06-H (credential pool) | H1-06 | H1-06 | `hermes-agent/agent/credential_pool.py` |

## 3. Orden recomendado de ejecucion

### Ola A. Ownership, shell e integracion Hermes skills

- H1-01 ✅ (completado)
- **H1-01-H** (integrar skills de Hermes - INMEDIATO)
- H1-02
- H1-03

### Ola B. Runtime, providers e integracion Hermes core

- H1-04
- **H1-04-H** (integrar memory/context de Hermes - paralelo)
- H1-05
- H1-06
- **H1-06-H** (integrar credential pool de Hermes - paralelo)

### Ola C. Consolidacion estructural

- H1-07
- H1-08
- H1-09
- H1-10

### Ola D. Verificacion y cierre

- H1-11
- H1-12

## 4. Dependencias internas

| Bloque | Depende de | Motivo |
| --- | --- | --- |
| H1-03 | H1-01, H1-02 | la shell nueva no debe nacer con ownership antiguo |
| H1-04 | H1-01 | el runtime debe leer el control-plane correcto |
| H1-05 | H1-04 | OpenClaw/local deben quedar subordinados al runtime principal |
| H1-06 | H1-04 | el plano de providers necesita un owner runtime claro |
| H1-07 a H1-10 | H1-03, H1-04 | primero se define shell y runtime owner, luego se consolidan duplicados |
| H1-11 | H1-03 a H1-10 | la verificacion final debe cubrir la forma nueva del producto |

## 5. Backlog tecnico por resultado esperado

### Resultado 1. Shell agent-first visible

- Extraer de `src-js/core/control-panel.js` la responsabilidad de shell principal.
- Crear una estructura nueva de shell sin volver a meter runtime/provider/session dentro del mismo archivo.
- Mantener el archivo actual solo como adaptador temporal mientras exista el host legacy.

### Resultado 2. Runtime con owner unico

- `src-js/core/freejt7-agent-core-v2.js` queda como base del bucle principal.
- `src-js/core/freejt7-agent-runtime.js` queda como fachada del producto, no como alternativa lateral.
- `src-js/core/openclaw-agent-runtime.js` y `src-js/core/local-agent-runtime.js` pasan a ser ejecutores subordinados.

### Resultado 3. Modelo y provider plane coherente

- `src-js/core/provider-registry.js` se mantiene como fuente de verdad inicial.
- `src-js/providers/api-provider-adapter.js` deja de competir con `src-js/core/api-provider-adapter.js`.
- `provider-router` queda como dispatcher del runtime y no como owner del producto.

### Resultado 4. Duplicados consolidados

- Bridge, scheduler, plugins y memory orchestration deben tener un modulo owner unico por dominio.
- Los archivos duplicados restantes quedan congelados como shim hasta su retirada definitiva.

## 6. Riesgos del Hito 1

| Riesgo | Senal de fallo | Respuesta |
| --- | --- | --- |
| La shell nueva sigue dependiendo del panel legado | el grueso del wiring sigue viviendo en `control-panel.js` | forzar corte de responsabilidades antes de seguir |
| `core-v2` no asume el ownership real | el flujo principal sigue yendo por provider directo o por rutas legacy | mover decision y cierre de tarea al runtime principal |
| Duplicados quedan vivos demasiado tiempo | hay imports activos a ambos lados de un mismo dominio | congelar uno como shim y migrar consumers en la misma ola |

## 7. Ready-to-start checklist

- [x] Arquitectura formal vNext aprobable escrita
- [x] Modulos actuales mapeados a dominios target
- [x] Orden de ejecucion definido
- [x] Verificaciones existentes identificadas
- [x] Aprobacion para empezar H1-01
