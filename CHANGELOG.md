# Changelog

## [4.1.0] - 2026-03-12

- Corregida la instalacion desde la extension VS Code: ahora usa `scripts/add-free-jt7-agent.ps1` (antes apuntaba a una ruta obsoleta en raiz).
- Antigravity: habilitadas claves de autonomia y autoaprobacion tanto en workspace (`.antigravity/settings.json`) como en user settings (`%APPDATA%/Antigravity/User/settings.json`).
- Antigravity runtime manifest reforzado con activacion `always`, permisos extendidos (`process`, `network`) y bloque explicito de autonomia.
- Flujo de aprendizaje continuo automatizado: agregado `tools/agent_autolearn/collect_from_runs.py` para recolectar aciertos/errores desde `copilot-agent/runs`.
- `nightly_train.ps1` actualizado para ejecutar recoleccion previa al entrenamiento por lotes.
- Reorganizacion de scripts operativos en `scripts/` y eliminacion de duplicados legacy.
- Expuestos en `package.json` todos los comandos OpenClaw ya implementados en `extension.js` para que aparezcan en paleta y sean invocables por el usuario.
- Trazabilidad operativa ampliada en `copilot-agent/RUNBOOK.md` y documentacion de arquitectura en `docs/AUTONOMY_AND_TRAINING_ARCHITECTURE.md`.
- Empaquetado optimizado: excluidos directorios pesados/no runtime del VSIX para reducir tamano y ruido de distribucion.

## [4.0] - 2026-03-05

- Creacion del repositorio dedicado `agente-freejt7-extension-funcional`.
- Migracion del runtime Free JT7 desde la linea v3.1 (`skills_manager.py`, scripts y metadata de `.github`).
- Ajuste de instaladores para usar el nuevo remoto de v4.0.
- Configuracion de VS Code con rutas relativas para integracion portable.
- Implementacion de extension VS Code instalable (`package.json`, `extension.js`, `.vscodeignore`).
- Empaquetado validado: `agente-freejt7-extension-funcional-4.0.0.vsix`.
- Documentacion de trayectoria de origen y errores historicos resueltos.
