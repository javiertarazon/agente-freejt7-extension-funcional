# Release 4.2.4 - autonomia, subagentes y control plane reforzado

**Fecha**: 2026-03-20  
**Version**: 4.2.4  
**Rama**: `release/4.2.4`

## Resumen

Esta release eleva Free JT7 hacia una operación más autónoma y más cercana a un agente de resolución compleja end-to-end. La mejora no se limita a prompts: añade orquestación real en el router, un roster formal de subagentes por workspace, y un CLI capaz de delegar al router de forma explícita.

## Cambios principales

- `task-run` ahora delega al Copilot router cuando no recibe comandos explícitos.
- Nuevo comando `copilot-router` en `skills_manager.py`.
- Scheduler del router actualizado para ejecutar subtareas en paralelo y respetar dependencias `dependsOn`.
- Fortalecimiento de policy y routing para clases de tarea `complex`, `architecture`, `admin`, `mcp`, `review` y `recovery`.
- Plantilla `.codex-agent/agent-config.yaml` incluida en el repo y en la VSIX.
- Empaquetado corregido para que el wrapper `copilot_router.js` funcione también en la extensión instalada.

## Archivos clave

- `skills_manager.py`
- `src-js/copilot_router.runtime.js`
- `.codex-agent/agent-config.yaml`
- `.github/free-jt7-policy.yaml`
- `.github/free-jt7-model-routing.json`
- `.github/agents/free-jt7.agent.md`
- `.github/copilot-instructions.md`

## Validación realizada

- `python -m py_compile skills_manager.py`
- `python skills_manager.py policy-validate`
- `node --check src-js/copilot_router.runtime.js`
- `node --check src-js/extension.runtime.js`
- `npm.cmd run build:bundle`
- `npm.cmd run package:local`
- instalación de humo en workspace temporal con generación de `copilot-agent`, `.codex-agent` y `.vscode/mcp.json`

## Nota operativa

La invocación del router en el entorno de validación quedó limitada por cuota externa del proveedor Copilot (`402 You have no quota`), pero la delegación `task-run -> copilot-router` sí se verificó como funcional.
