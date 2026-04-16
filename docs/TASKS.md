# Roadmap de Ejecucion Autonoma

## Reglas de uso
- Este archivo es la fuente de verdad de progreso.
- Toda tarea compleja se divide en micro-tareas.
- Cada item debe cambiar de `[ ]` a `[x]` al completarse.
- Si una tarea falla, agregar sub-item de remediacion y reintento.

## Plantilla rapida
- [ ] Objetivo principal
  - [ ] Subtarea A
  - [ ] Subtarea B
  - [ ] Verificacion

## Ciclo Quant Autonomo
- [ ] Fase 1: Setup y datos
  - [ ] Validar entorno Python y dependencias
  - [ ] Descargar datos reales OHLCV
- [ ] Fase 2: Backtest base
  - [ ] Ejecutar estrategia base
  - [ ] Calcular metricas (PF, DD, Sharpe)
- [ ] Fase 3: Iteracion
  - [ ] Registrar resultado en `docs/STRATEGY_LOG.md`
  - [ ] Si falla criterio, aplicar mejora y reintentar
- [ ] Fase 4: Cierre
  - [ ] Seleccionar mejor configuracion
  - [ ] Documentar entregable final

## MCP Free JT7 (2026-03-13)
- [x] Fase 1: Scaffold servidor MCP local
  - [x] Crear carpeta `servidor mpc free jt7`
  - [x] Crear herramientas base (web, scraping, sistema, desktop, media)
  - [x] Definir politica de aprobaciones y bloqueos
- [x] Fase 2: Validacion local
  - [x] Ejecutar smoke test de carga de modulos
  - [x] Verificar arranque de servidor por stdio
- [x] Fase 3: Cierre pre-integracion
  - [x] Documentar uso y limites
  - [x] Dejar listo para integracion en extension

## Disciplina Operativa (2026-03-13)
- [x] Reconciliar tareas abiertas heredadas
- [x] Cerrar duplicados con evidencia en `copilot-agent/tasks.yaml`
- [x] Actualizar `copilot-agent/RESUME.md` y `copilot-agent/audit-log.jsonl`
- [x] Registrar regla preventiva para no reabrir trabajo ya verificado

## MT5 Desktop Automation & Login (2026-03-13)
- [x] Robustecer arranque de terminal MT5 desde `tools/mt5_bridge.py` (start + reintentos)
- [x] Corregir paso de parámetros y transporte seguro de datos en `servidor mpc free jt7/src/tools/mt5.js`
- [x] Verificación ligera (py_compile + import de mt5.js)
- [x] Resolver timeout de `mt5.initialize()` (login desktop con `jt7_mt5_desktop_login` y shortcut de menÃº)

## Integración MCP en VS Code (2026-03-14)
- [x] Verificar soporte MCP y prerequisitos (`code --version`, extensiones clave, dependencias del servidor)
- [x] Crear `.vscode/mcp.json` para el servidor local `free-jt7-local`
- [x] Validar arranque ligero del servidor MCP local
- [x] Confirmar la integración final en VS Code y documentar resultado

## Reparacion wallpaper Windows (2026-03-14)
- [x] Confirmar archivo fuente, registro y cache activa
- [x] Forzar aplicacion del fondo en la sesion interactiva
- [x] Verificar persistencia tras refresco de Explorer

## Diagnostico boot Windows (2026-03-14)
- [ ] Objetivo principal: analizar perdida de boot de arranque
  - [x] Recolectar estado de discos/particiones y BCD
  - [x] Identificar particion EFI y estado de arranque
  - [x] Montar EFI y verificar presencia de archivos de arranque
  - [ ] Proponer remediacion segura segun hallazgos
  - [ ] Verificacion ligera

## Routing planner/executor por costo (2026-03-17)
- [ ] Separar resolucion de modelo para planeacion/asignacion vs ejecucion
  - [ ] Definir roles `planning`, `assignment` y `execution` en el routing
  - [ ] Persistir resolucion por rol en runs y runtime OpenClaw
  - [ ] Extender credenciales para xAI/Anthropic/Google segun fallback de ejecucion
  - [ ] Documentar configuracion recomendada: GPT-5.4 para planner y Grok/Gemini/Haiku para ejecucion
  - [ ] Verificacion CLI de resolucion por rol

## Router real Copilot SDK (2026-03-17)
- [x] Instalar prerequisite local del GitHub Copilot CLI
- [x] Integrar dependencia `@github/copilot-sdk` en la extension
- [x] Crear `copilot_router.js` con planner, ejecutores y sintesis
- [x] Registrar evidencia de runs en `copilot-agent/runs/`
- [x] Exponer comando `Free JT7: Routed Copilot Task`
- [ ] Validar corrida real end-to-end con autenticacion de Copilot disponible

## Router real Copilot SDK (2026-03-17)
- [ ] Implementar router automatico por tarea dentro de GitHub Copilot
  - [ ] Integrar `@github/copilot-sdk` en el runtime de la extension
  - [ ] Crear planner con modelo caro y ejecutores por subtarea con modelos baratos
  - [ ] Exponer tools locales seguras para lectura, edicion y verificacion en workspace
  - [ ] Registrar runs y eventos en `copilot-agent/runs/`
  - [ ] Conectar el router a `free-jt7` y a un comando de VS Code
  - [ ] Validar ejecucion minima real con Copilot CLI autenticado

## Auditoria agente free jt7 (2026-03-18)
- [x] Revisar arquitectura, comandos y puntos de entrada
  - [x] Inspeccionar `package.json`, `extension.js`, `copilot_router.js` y `skills_manager.py`
  - [x] Validar documentacion operativa y consistencia con implementacion
  - [x] Ejecutar verificaciones ligeras disponibles
  - [x] Documentar hallazgos, riesgos y acciones sugeridas
  - [x] Corregir colision de escrituras concurrentes en `skills_manager.py`
  - [x] Revalidar instalacion paralela en workspaces temporales
  - [x] Recuperar runtime del router Copilot (dependencias + compatibilidad ESM)
  - [x] Validar skills, autonomia y servidor MCP local
  - [x] Endurecer dependencias del root hasta `npm audit` = 0 vulnerabilidades
  - [x] Dejar el router Copilot listo para token/env y mensaje claro de autenticacion faltante
  - [x] Eliminar el warning residual del router aumentando la espera de `session.idle`
  - [x] Reducir el peso del VSIX excluyendo artefactos no Windows y basura de `node_modules`
  - [x] Instalar y validar el `.vsix` 4.2.2 ya empaquetado en VS Code real
  - [x] Documentar siguiente palanca de optimizacion: bundling del runtime JS y desacople del binario Copilot
  - [x] Bundlear `extension.js` y `copilot_router.js` en `dist/extension.cjs` con `esbuild`
  - [x] Validar la extension instalada desde VSIX usando el bundle generado

## task-run cross-platform Linux (2026-04-16)
- [x] Identificar causa raiz del bloqueo de `runtime-audit` en Linux
  - [x] Confirmar normalizacion indebida a PowerShell para `pwd`
  - [x] Confirmar ejecucion hardcoded con `_execute_powershell()` en `cmd_task_step`
- [x] Corregir shell por plataforma en `skills_manager.py`
  - [x] Mantener traduccion PowerShell solo para Windows
  - [x] Ejecutar con `bash` o `sh` y reintentos POSIX en Linux
- [x] Revalidar auditoria completa
  - [x] Ejecutar `policy-validate`, `doctor --strict`, `rollout-mode`, `host-mode status`, `ide-detect --json`
  - [x] Ejecutar `task-run --goal "runtime-audit" --commands "pwd" "node --version"`
  - [x] Confirmar run verde con checklist completo

## Pruebas de Regresion task-run Cross-Platform (2026-04-16)
- [x] Crear suite de tests automatizados para evitar regresiones del bug Linux/PowerShell
  - [x] Confirmar 0 infraestructura de tests preexistente (sin directorio `tests/`, sin archivos de test)
  - [x] Instalar pytest 9.0.3 en .venv (pip 26.0.1 via curl bootstrap desde bootstrap.pypa.io)
  - [x] Crear `tests/__init__.py` (paquete Python vacío)
  - [x] Crear `tests/test_task_run_cross_platform.py` — 47 test cases, 4 clases
    - [x] `TestPlatformFamily` (7 tests): linux, windows, darwin, unknown→linux, empty→linux
    - [x] `TestNormalizeShellCommand` (17 tests): passthrough POSIX, traducción Windows, auto-detect
    - [x] `TestTaskStepAttempts` (12 tests): redirect POSIX vs PowerShell redirect+cmd fallback
    - [x] `TestExecuteTaskShell` (10 tests): bash/sh en Linux/Darwin, PS en Windows, timeout→rc=124
  - [x] Verificacion: `.venv/bin/pytest tests/ -v` → **47/47 passed in 0.97s**
  - [x] Suite vinculada al fix verificado en run `20260416T002223Z-5d848cba`

