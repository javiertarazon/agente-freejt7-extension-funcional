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

## Remediacion selector de agentes (2026-04-20)
- [x] Recuperar visibilidad de `free-jt7`, `openclaw` y `skill-creator` en el selector de GitHub Copilot Chat
  - [x] Confirmar la causa raiz inicial en `.agent.md` y settings del selector
  - [x] Normalizar frontmatter y tools de los agentes custom
  - [x] Propagar flags del selector a settings instalados/reparados
  - [x] Añadir smoke test del contrato minimo de agentes
  - [x] Verificacion final con build, pruebas ligeras y reinstalacion del VSIX

## Remediacion agentFiles globales (2026-04-20)
- [x] Confirmar con logs que la extension instalada si activaba fuera del repo y aislar el bloqueo real en `chat.agentFilesLocations`
- [x] Corregir `skills_manager.py` para no escribir rutas absolutas invalidas en user settings globales
- [x] Ajustar el drift-heal del runtime y limpiar configuraciones locales heredadas (`.vscode/settings.json` y `free-jt7-multiroot.code-workspace`)
- [x] Reempaquetar/reinstalar el VSIX y verificar activacion en carpeta externa sin warnings `Skipping invalid path`

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

## Proveedor y modelos gratis en la extension (2026-04-16)
- [x] Verificar las 6 areas marcadas en la tabla de tareas
  - [x] Auditar implementacion real en `package.json`, `src-js/extension.runtime.js`, `src-js/free-models-catalog.js` y `src-js/api-provider-adapter.js`
  - [x] Corregir la seleccion QuickPick para usar `label/value` reales del catalogo
  - [x] Arreglar `refreshFreeModels` para recargar el catalogo en runtime sin quedar con referencias viejas
  - [x] Revalidar comandos, build y ausencia de errores relevantes

## Indicador visual de proveedor/modelo (2026-04-16)
- [x] Restaurar y reforzar la visibilidad del proveedor/modelo activo en VS Code
  - [x] Identificar la causa raiz en el runtime empaquetado (`src-js/**` excluido del VSIX)
  - [x] Agregar fallback interno para el catalogo cuando el archivo fuente no existe en el paquete
  - [x] Mover el status bar item a la izquierda y hacerlo mas explicito (`Free JT7: proveedor | modelo`)
  - [x] Sincronizar el indicador con cambios de `freejt7.apiProvider` y `freejt7.apiProviderModel`
  - [x] Revalidar sintaxis, build y presencia del texto final en `dist/extension.cjs`

## Configuracion global VS Code desde la extension (2026-04-16)
- [x] Exponer un flujo global real dentro de VS Code
  - [x] Confirmar que `skills_manager.py` ya soportaba `--update-user-settings` con rutas absolutas de usuario
  - [x] Agregar comando `Free JT7: Aplicar configuracion global en VS Code`
  - [x] Hacer que `@freejt7 /install` degrade a configuracion global cuando no hay workspace
  - [x] Agregar atajo explicito `@freejt7 /global`
  - [x] Revalidar bundle, VSIX, instalacion y escritura de `~/.config/Code/User/settings.json`

## Presupuesto de contexto para proveedores externos (2026-04-16)
- [x] Identificar la causa raiz del 400 por `maximum context length`
  - [x] Confirmar que `request.prompt` se reenviaba casi en bruto al adaptador externo
  - [x] Confirmar que `src-js/api-provider-adapter.js` no tenia recorte ni manejo HTTP >= 400
- [x] Corregir el adaptador de proveedores
  - [x] Normalizar API keys y remover comillas residuales
  - [x] Compactar prompts por proveedor con presupuesto defensivo
  - [x] Fijar `max_tokens` de salida para OpenRouter, HF y ZAI
  - [x] Traducir errores remotos de contexto a mensajes accionables
- [x] Verificacion
  - [x] `node -e "require('./src-js/api-provider-adapter.js')"`
  - [x] `npm run build:bundle`

## Analisis comparativo Claurst vs Free JT7 (2026-04-17)
- [x] Auditar Claurst local como referencia de arquitectura avanzada
  - [x] Revisar `spec/` y el workspace Rust de `src-rust/`
  - [x] Confirmar capacidades reales en memoria, cron, plugins, bridge y command/tool system
- [x] Contrastar con el runtime actual de Free JT7
  - [x] Revisar `src-js/`, `skills_manager.py`, `tools/agent_autolearn/` y el servidor MCP local
  - [x] Distinguir fortalezas actuales vs brechas estructurales
- [x] Sintetizar una matriz de adopcion
  - [x] Priorizar que patrones conviene incorporar primero
  - [x] Separar lo recomendable de lo que no conviene copiar ahora
- [x] Persistir el analisis para roadmap futuro
  - [x] Crear `docs/08-ANALISIS-CLAURST-VS-FREEJT7.md`

## Diagnostico error priority node (2026-04-18)
- [x] Objetivo principal: ubicar el origen del error `No lowest priority node found`
  - [x] Confirmar el punto exacto donde aparece en artefactos construidos o dependencias
  - [x] Verificar si la ruta pasa por el runtime propio (`dist/`, `extension.js`, `bundle-entry.js`, `copilot_router.js`)
  - [x] Determinar si hace falta fix local o encapsulacion defensiva
  - [x] Validacion final con evidencia reproducible

## Hardening de cumplimiento operativo del agente (2026-04-18)
- [x] Objetivo principal: forzar checklist, trazabilidad, intake obligatorio y uso de skills/orquestacion
  - [x] Corregir instrucciones y referencias rotas (`.codex-agent` vs `copilot-agent`, skills inexistentes)
  - [x] Exigir aclaraciones previas y desglose antes del plan en tareas no triviales
  - [x] Resolver skills relevantes y reflejarlas en el flujo del router
  - [x] Integrar el router con `task-start` y `task-close` para cerrar trazabilidad real
  - [x] Validacion final con evidencia y resumen de cumplimiento

## Sincronizacion del catalogo de modelos gratis (2026-04-18)
- [x] Objetivo principal: hacer que el catálogo visible de OpenRouter, HuggingFace y ZAI refleje los modelos gratis que realmente funcionan
  - [x] Confirmar la causa raiz del desfase entre QuickPick, fallback empaquetado y adaptador de proveedores
  - [x] Unificar la fuente de verdad del catálogo con cambios mínimos
  - [x] Corregir el refresco del catálogo y el fallback del runtime empaquetado
  - [x] Verificacion final con build y pruebas ligeras del catálogo

## Regeneracion e instalacion del VSIX (2026-04-18)
- [x] Objetivo principal: regenerar e instalar la extensión empaquetada para probar el QuickPick real
  - [x] Ejecutar empaquetado local del VSIX con el bundle actualizado
  - [x] Reinstalar la extensión con `code --install-extension --force`
  - [x] Verificar el artefacto VSIX generado e instalado

## Auditoria integral final de Free JT7 (2026-04-18)
- [x] Objetivo principal: auditar Free JT7 para detectar errores, duplicidades, codigo muerto y brechas multi-IDE/globales
  - [x] Ejecutar chequeos de runtime, policy, host mode, ide detect y un run auditado
  - [x] Auditar codigo y estructura para solapamientos, duplicidad de funciones y codigo muerto evidente
  - [x] Revisar instalacion global, empaquetado VSIX y experiencia de clonacion + setup
  - [x] Sintetizar hallazgos priorizados, gaps y riesgos residuales con evidencia

## Plan de remediacion corto tras auditoria final (2026-04-19)
- [x] Objetivo principal: ejecutar los fixes de mayor impacto con cambios minimos y compatibles
  - [x] Actualizar README a la version, comandos y alcance operativo reales de la release actual
  - [x] Exponer desde la extension un flujo global multi-IDE real, no limitado a VS Code
  - [x] Consolidar instaladores PowerShell para reducir duplicidad y solapamiento operativo
  - [x] Verificacion final con build del bundle y validacion ligera de comandos/documentacion

## Segunda pasada correctiva de wrappers y matriz comparativa (2026-04-19)
- [x] Objetivo principal: reducir duplicidad de wrappers operativos y dejar lista la comparativa real contra OpenClaw, Codex y Claude Code
  - [x] Confirmar la fuente de verdad de resolucion/arranque de OpenClaw y detectar wrappers que reimplementan la misma logica
  - [x] Simplificar la capa de wrappers OpenClaw con cambios minimos y compatibles
  - [x] Actualizar la documentacion operativa afectada por la simplificacion de wrappers
  - [x] Diseñar una matriz de metricas, pesos, escenarios y evidencia para la comparativa real entre agentes
  - [x] Verificacion final con build y validacion ligera de la documentacion nueva/ajustada

## Integracion restante del analisis Claurst vs Free JT7 (2026-04-19)
- [x] Objetivo principal: integrar las mejoras todavia pendientes del analisis sin romper compatibilidad
  - [x] Delimitar el delta real entre el documento y el runtime actual para no reimplementar subsistemas ya existentes
  - [x] Reforzar el bridge remoto con estado persistente, sesiones y aprobaciones/eventos auditables
  - [x] Introducir fachadas canonicas de capas `runtime/` y `providers/` y reencaminar imports sin romper compatibilidad
  - [x] Corregir huecos de integracion detectados durante la pasada, especialmente en scheduler/runtime
  - [x] Actualizar la documentacion del analisis para reflejar el estado actual tras la integracion
  - [x] Verificacion final con build y chequeos de errores relevantes

## Auditoria comparativa avanzada Free JT7 vs Claurst/Codex (2026-04-19)
- [x] Objetivo principal: auditar el runtime actual y proponer mejoras avanzadas e integraciones seguras sin romper compatibilidad

## Activacion global real y proveedor externo efectivo (2026-04-19)
- [x] Objetivo principal: garantizar que Free JT7 quede activo en cualquier carpeta abierta en VS Code y que el runtime use OpenRouter gratis por defecto en lugar de Copilot
  - [x] Confirmar la causa raiz de la activacion limitada al workspace actual
  - [x] Confirmar por que el router sigue cayendo en Copilot aunque exista configuracion global externa
  - [x] Auto-reparar settings globales para que apunten a la extension instalada y no al checkout fuente
  - [x] Auto-instalar el bridge minimo del workspace al abrir carpetas nuevas en VS Code
  - [x] Cambiar el default operativo del proveedor a OpenRouter gratis y unificar UI/runtime
  - [x] Verificacion final en carpeta externa + runtime auditado
  - [x] Relevar capacidades avanzadas de Claurst no absorbidas todavia por Free JT7 y separar brechas reales de brechas ya cerradas
  - [x] Revisar el modelo operativo de Codex y detectar patrones de trabajo utiles todavia no institucionalizados en Free JT7
  - [x] Auditar Free JT7 post-fix para encontrar mejoras de eficiencia, velocidad, seguridad, estabilidad, token economy y auto-mejora
  - [x] Priorizar iniciativas por impacto, riesgo y costo de integracion, con fases compatibles hacia atras
  - [x] Sintetizar findings, riesgos residuales y roadmap de integracion con verificacion esperada

## Fase 1 review loop del router Copilot (2026-04-19)
- [x] Objetivo principal: cerrar la primera fase del roadmap integrando un review stage nativo con gates reales en el router
  - [x] Diseñar el recorte minimo compatible del review loop y su activacion por configuracion/riesgo
  - [x] Implementar `reviewStage` estructurado en `src-js/core/copilot_router.runtime.js`
  - [x] Extender configuracion y salida final del router para exponer findings y estado del gate
  - [x] Añadir smoke test ligero del review stage sin introducir un framework JS nuevo
  - [x] Verificacion final con build, smoke test y chequeo de errores relevantes

## Fase 2+3 router loop, budget y bridge (2026-04-19)
- [x] Objetivo principal: completar el loop implementacion→review→fix→re-review y consolidar budget/contexto + reanudacion remota
  - [x] Añadir auto-remediacion de findings al router con re-review y gate final compatible
  - [x] Crear una capa central de `context-budget` reutilizable entre router, memoria y proveedores
  - [x] Endurecer el bridge remoto para persistir findings, gates y punteros de reanudacion entre sesiones
  - [x] Extender smoke tests para cubrir auto-fix, budget y recuperacion de estado
  - [x] Verificacion final con build, smoke tests y chequeo de errores relevantes

## Fase 4 router hooks nativos y prueba funcional bloqueada (2026-04-19)
- [ ] Objetivo principal: cerrar hooks reales `preToolUse`/`postToolUse` en el router y ejecutar una corrida funcional que deje el gate bloqueado con resume state verificable
  - [x] Conectar hooks nativos del Copilot SDK con el plugin runtime y policies del router
  - [x] Persistir trazas relevantes de uso de tools para auditoria y reanudacion
  - [x] Añadir cobertura automatizada del cableado de hooks y de la politica de intercepcion
  - [ ] Ejecutar una corrida funcional real del router que provoque gate bloqueado y revisar el resume state final
    - [ ] Bloqueado por autenticacion ausente del Copilot CLI/SDK en este host (`COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN` no configurados y `gh` no instalado)
  - [ ] Verificacion final con tests, build y evidencia de la corrida funcional

## Fase 5 identidad canonica multi-host del bridge (2026-04-19)
- [x] Objetivo principal: endurecer la identidad de proyecto/host para evitar reuse accidental de estado stale entre hosts o rutas no canónicas
  - [x] Normalizar project root canónico y fingerprint estable dentro del remote bridge
  - [x] Exponer compatibilidad/stale state en `getSessionResume()`
  - [x] Extender aprobaciones y snapshot con identidad de proyecto/host relevante
  - [x] Añadir cobertura smoke de coexistencia multi-host y path canónico
  - [x] Verificacion final con smoke suite y build

## Checklist consolidado de auditoría + identidad CLI multi-host (2026-04-19)
- [x] Objetivo principal: dejar visible qué hallazgos/fases de la auditoría avanzada ya están ejecutados y cerrar la identidad canónica pendiente en las superficies CLI
  - [x] Añadir checklist consolidado de hallazgos y fases en `docs/11-AUDITORIA-AVANZADA-FREEJT7-CLAURST-CODEX.md`
  - [x] Endurecer `active-project.json` y la resolución CLI contra rutas stale cross-host/cross-platform
  - [x] Añadir pruebas Python para identidad activa y detección de rutas foráneas
  - [x] Verificación final con pytest selectivo y `doctor --strict`

## Fase 4 evaluada + Fase 5 capability packs externos (2026-04-19)
- [x] Objetivo principal: cerrar la auto-mejora evaluator-driven y habilitar manifests versionados para capability packs externos sin tocar el core por integración
  - [x] Añadir evaluator previo al collector con scoring, tags y criterios de aceptación reutilizables
  - [x] Generar regression packs desde runs/dataset validados y conectarlos al pipeline de AutoLearn
  - [x] Diseñar e implementar `integration manifest` versionado y discovery seguro para capability packs
  - [x] Añadir un capability pack externo de ejemplo y validarlo sin cambios en el core de runtime
  - [x] Verificación final con pruebas Python, smoke del runtime de plugins y build

## Lock definitivo de concurrencia del router core (2026-04-19)
- [x] Objetivo principal: bajar el guard de concurrencia al núcleo del router para cubrir extensión y entradas directas CLI/core
  - [x] Registrar la protección en `src-js/core/copilot_router.runtime.js` sin romper compatibilidad
  - [x] Añadir smoke test JS mínimo para doble invocación concurrente del core
  - [x] Revalidar build y smoke test de concurrencia
  - [x] Actualizar trazabilidad final y memoria preventiva si aplica

## Release final: auditoría, empaquetado e instalación/publicación (2026-04-19)
- [ ] Objetivo principal: cerrar la release empaquetable/publicable del estado actual del runtime con evidencia fresca y metadatos coherentes
  - [x] Auditar runtime, toolchain de empaquetado y estado git antes de tocar la release
  - [x] Registrar y ajustar la versión/changelog para que describan el árbol real a publicar
  - [x] Renumerar la release a `4.2.9` para evitar la colisión con el tag local `v4.2.8`
  - [x] Regenerar el VSIX desde el estado actual del workspace
  - [x] Reinstalar el VSIX `4.2.9` y verificar instalación/artefacto en VS Code
  - [ ] Evaluar publicación git local/remota sobre el working tree actual y cerrar trazabilidad final
  - [ ] Resolver bloqueo de publicación restante: árbol muy mezclado aun después de mover la release a `4.2.9`

## Commit limpio y tag local de release 4.2.9 (2026-04-19)
- [x] Objetivo principal: separar la release real del ruido operativo y dejarla lista para publicar sin empujar nada todavía
  - [x] Auditar la rama y el working tree mezclado para distinguir release vs cambios ajenos
  - [x] Confirmar que `v4.2.8` ya existe y que `v4.2.9` sigue libre
  - [x] Seleccionar el subconjunto exacto de archivos que sí entran en el commit limpio
  - [x] Crear el commit local limpio de la release `4.2.9`
  - [x] Crear y validar el tag local `v4.2.9`
  - [x] Dejar documentado qué archivos quedaron fuera del release para no mezclar publicación con trazabilidad local

## Extension global autosuficiente vs workspace bootstrapado (2026-04-20)
- [x] Objetivo principal: hacer que el VSIX funcione como extensión normal en cualquier carpeta abierta, sin depender de convertirla en repo Free JT7
  - [x] Confirmar la causa raíz técnica en runtime, instalador y empaquetado
  - [x] Separar el modo global instalado del modo workspace gestionado dentro del runtime
  - [x] Evitar que la autocuración global escriba bootstrap dentro de la carpeta de la extensión instalada
  - [x] Mover estado operativo por defecto a storage global cuando el workspace no sea gestionado por Free JT7
  - [x] Verificar build, pruebas y empaquetado del VSIX tras el desacople

## Autocuración global ante drift real de settings (2026-04-20)
- [x] Objetivo principal: impedir que la extensión instalada dé por buena una sincronización vieja cuando `settings.json` ya volvió a apuntar al checkout fuente
  - [x] Confirmar con evidencia si el reparador manual desde la extensión instalada corrige los settings globales
  - [x] Hacer que el runtime valide el contenido real de settings antes de saltarse la reparación automática
  - [x] Verificar build y una prueba reproducible de reparación contra la copia instalada en ~/.vscode/extensions
  - [x] Registrar la regla preventiva en memoria operativa

## Evaluación de factibilidad de integración de ZIP externo (2026-04-20)
- [x] Objetivo principal: analizar `files.zip` y determinar si conviene integrarlo en Free JT7, cómo y con qué riesgo
  - [x] Inventariar el contenido real del ZIP y clasificar su propósito técnico
  - [x] Identificar dependencias, supuestos de entorno y contratos de entrada/salida
  - [x] Mapear puntos de acople con runtime, plugins, tools, scheduler o bridges de Free JT7
  - [x] Evaluar compatibilidad, riesgos, esfuerzo y estrategia de integración recomendada
  - [x] Entregar informe final con evidencia y decisión de factibilidad

## Clonación de repositorio oficial de Remotion (2026-04-19)
- [ ] Objetivo principal: clonar `remotion-dev/remotion` en la carpeta opcional externa indicada por el usuario
  - [x] Verificar cuál es el repositorio oficial de Remotion en GitHub
  - [ ] Validar la carpeta destino y evitar colisión con una clonación previa
  - [ ] Ejecutar `git clone` en `/home/javier28/Público/REPOSOTORIOS OPCIONALES`
  - [ ] Confirmar que la copia quedó accesible y listar la ruta final

## Registro real Canva MCP + validación del design agent (2026-04-21)
- [x] Objetivo principal: completar el alta real del cliente Canva MCP y dejar el design agent listo con evidencia exacta
  - [x] Intentar el registro manual real contra `https://mcp.canva.com/register`
  - [x] Persistir `client_id` y `client_secret` en `.env.free-jt7` si Canva responde correctamente
  - [x] Ejecutar verificación del agente con `doctor` y arrancar `auth-canva`
  - [x] Corregir el flujo OAuth del agente para usar `https://mcp.canva.com/authorize` y `https://mcp.canva.com/token`
  - [x] Completar en navegador el consentimiento OAuth y generar `copilot-agent/runs/design-agent/canva_tokens.json`

## Rama feature/agente-diseno (2026-04-21)
- [x] Objetivo principal: crear y publicar la rama `feature/agente-diseno` desde el estado actual del repo
  - [x] Confirmar nombre de rama, base y modo de publicacion con el usuario
  - [x] Verificar que `origin` exista y que la rama no esté creada previamente
  - [x] Crear la rama local desde el HEAD actual preservando el working tree sin limpiar cambios
  - [x] Publicar la rama en `origin` con upstream configurado
  - [x] Confirmar rama local/remota final y dejar trazabilidad cerrada

## Release 4.2.10 con agente de diseño (2026-04-21)
- [ ] Objetivo principal: publicar en `feature/agente-diseno` una nueva versión correlativa empaquetada que incluya el agente de diseño
  - [x] Confirmar alcance de release, rama destino y validación mínima con el usuario
  - [x] Abrir trazabilidad específica para commit, push y empaquetado de la nueva versión
  - [x] Renumerar metadatos de release de `4.2.9` a `4.2.10`
  - [x] Revalidar `doctor` y `pytest tests/test_design_agent.py -q` sobre el estado final de release
  - [x] Generar el VSIX `4.2.10` y comprobar que el artefacto existe
  - [ ] Crear commit convencional de release y empujarlo a `origin/feature/agente-diseno`
  - [ ] Cerrar la trazabilidad operativa final con evidencia fresca

