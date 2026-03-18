# Changelog

## [4.2.3] - 2026-03-18

- Rama correlativa de release creada para dejar la extension final operativa y lista para instalar desde VSIX.
- Version sincronizada en `package.json`, `package-lock.json`, `VERSION` y `README.md` para evitar deriva entre runtime, empaquetado y documentacion.
- Reempaquetado y revalidado el bundle `dist/extension.cjs` junto con la extension VS Code para confirmar instalacion limpia sobre la linea 4.2.x.

## [4.2.2] - 2026-03-18

- Corregido el flujo de instalacion desde la extension y wrappers PowerShell (`setup-project.ps1`, `add-free-jt7-agent.ps1`) con resolucion robusta de `skills_manager.py` y fallback de Python valido.
- Endurecido `skills_manager.py` para evitar colisiones de escritura en instalaciones concurrentes usando temporales unicos y reintentos cortos.
- Recuperado el router Copilot real en `copilot_router.js`: version valida de `@github/copilot-sdk`, compatibilidad ESM automatizada por `postinstall`, soporte de `copilot.cmd` en Windows y auth por `copilot login` o variables `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN`.
- Ajustado el router para ampliar la espera de `session.idle` y reducir falsos residuos por timeout en corridas largas.
- Auditoria funcional completada: skills activas, modo autonomo, router Copilot autenticado y servidor MCP local validados con evidencia real.
- Endurecimiento del arbol npm del root: `xml2js` actualizado, `undici` fijado por `overrides`, eliminada la dependencia legacy `vscode` y `npm audit` en `0` vulnerabilidades.
- Empaquetado final 4.2.2 rehecho con `.vscodeignore` mas estricto para bajar ruido y peso del VSIX.
- Bundling del runtime JS principal con `esbuild`: `extension.js` y `copilot_router.js` quedan como shims minimos y el runtime compartido se empaqueta en `dist/extension.cjs` con `vscode` como dependencia externa.

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
