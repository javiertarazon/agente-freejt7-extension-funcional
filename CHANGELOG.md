# Changelog

## [4.2.5] - 2026-04-15

- Corregido: `extensionDependencies` con `github.copilot-chat` faltaba en `package.json` pese a que el CHANGELOG 4.2.4 lo declaraba. Sin esta dependencia VS Code no garantizaba que la API `vscode.chat.createChatParticipant` estuviese disponible al activar la extension, impidiendo que `@freejt7` apareciese en Copilot Chat.

## [4.2.4] - 2026-04-15

- Agregado diagnostico explicito en el runtime de VS Code para detectar si GitHub Copilot Chat y la API `vscode.chat` estan disponibles; `Free JT7: Validar runtime` ahora reporta por que `@freejt7` no aparece en Copilot Chat.
- Declarada dependencia de extension sobre `github.copilot-chat` para reducir instalaciones incompletas en VS Code.
- Corregido `skills_manager.py` para generar `gateway.mode=local` en `.openclaw/openclaw.json`, compatible con OpenClaw 2026.4.14+.
- Validado stack Linux por capas: build de la extension con Node 20, runtime de OpenClaw con Node 22.14+, servidor MCP local y wrapper `~/.local/bin/openclaw`.
- Reorganizada la documentacion para separar extension base, stack operativo base (`Copilot + MCP + OpenClaw`) e integraciones opcionales como MT5.

## [4.2.3] - 2026-04-09

- Adaptada la extension para Linux y entornos VS Code modernos: `Free JT7: Instalar en workspace actual` ya no depende de PowerShell y usa `skills_manager.py install` con Python multiplataforma.
- Integrado `@freejt7` como participante nativo de Copilot Chat con comandos `/route`, `/doctor`, `/install` y `/docs`.
- Ajustada la resolucion del router para priorizar el Copilot CLI empaquetado dentro de la extension y usar el CLI global solo como fallback.
- Validado el flujo Linux extremo a extremo: compilacion del bundle JS, autenticacion real de Copilot CLI, prueba directa del CLI y ejecucion correcta de `copilot_router.js`.
- Normalizado el versionado del repositorio: `VERSION`, `package.json` y `package-lock.json` quedan alineados en `4.2.3`.

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
