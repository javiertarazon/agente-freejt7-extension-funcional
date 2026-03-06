# Agente Free JT7 Extension Funcional

Versión objetivo: `4.0`

Este repositorio concentra la línea de evolución del agente Free JT7 orientado a operación como extensión/integración funcional en VS Code (Copilot Chat + agentes personalizados + runtime de skills).

## Origen

- Repositorio base: `https://github.com/javiertarazon/agente-copilot.git`
- Rama de transición previa: `feature/agente-free-extension-v3.1`
- Último commit de base documentado: `1e4e6a3`

Detalle completo en:

- `docs/00-TRAYECTORIA-ORIGEN.md`
- `docs/01-MODIFICACIONES-VSCODE-EXTENSION.md`
- `docs/02-ERRORES-RESUELTOS.md`

## Alcance v4.0

- Consolidar documentación técnica y de operación.
- Dejar trazabilidad explícita de cambios que habilitan uso como extensión en VS Code.
- Mantener inventario de errores resueltos y su evidencia histórica.

## Siguiente paso recomendado

Importar al menos estos activos desde el repositorio origen (v3.1) para ejecución completa:

- `skills_manager.py`
- `.github/copilot-instructions.md`
- `.github/agents/free-jt7.agent.md`
- `.github/free-jt7-policy.yaml`
- `.github/free-jt7-model-routing.json`
- scripts de instalación (`setup-project.ps1`, `add-free-jt7-agent.ps1`)

