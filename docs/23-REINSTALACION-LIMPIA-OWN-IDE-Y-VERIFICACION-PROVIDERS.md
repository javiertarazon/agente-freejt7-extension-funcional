# Reinstalacion limpia own-ide y verificacion previa de providers

Fecha: 2026-05-01

## Objetivo
- Ejecutar una desinstalacion limpia del entorno `own-ide` de Free JT7.
- Verificar antes de reinstalar el estado real de providers/modelos con credencial detectable.
- Reinstalar limpio el IDE propio y validar que el bootstrap, la extension instalada y el panel queden operativos.
- Publicar la iteracion en una rama correlativa remota sin arrastrar artefactos `dist-*`.

## Alcance aplicado
- Verificacion live solo sobre providers con credencial detectable.
- Respuestas y trazabilidad minimizadas para ahorrar contexto.
- Exclusiones operativas: no incluir `dist-deb/**` ni `dist-rpm/**` en el commit de publicacion.

## Ejecucion realizada
1. Se confirmo que `scripts/freejt7-own-ide-bootstrap.js` no implementa un `uninstall` formal; la limpieza real depende de purgar el `appHome`/perfil aislado.
2. Se abrio trazabilidad para la tarea en `docs/TASKS.md`, `copilot-agent/tasks.yaml` y `copilot-agent/audit-log.jsonl`.
3. Se ejecuto auditoria runtime minima:
   - `policy-validate` -> OK
   - `doctor --strict` -> OK
   - `rollout-mode` -> autonomous/full
   - `host-mode status` -> OK
   - `ide-detect --json` -> VS Code/Codex/Claude Code detectados
4. Se verificaron providers/modelos por ruta real:
   - `hf` -> OK
   - `zai` -> OK
   - `ddeksee` -> OK
   - `openrouter` -> credencial detectada, llamada bloqueada por `HTTP 429`
   - `clod` -> credencial detectada, llamada bloqueada por `HTTP 429 Team quota exceeded`
   - `nvidia` -> sin API key detectable
5. Se purgaron los directorios de instalacion aislada:
   - `~/.freejt7-app/profiles/own-ide`
   - `~/.freejt7-app/runtime/vscodium`
6. Se regenero la VSIX e instalacion limpia con:
   - `npm run package:local`
   - `npm run app:own-ide:setup`
7. Se validaron los smokes post-instalacion:
   - `node tests/freejt7_own_ide_bootstrap_smoke.js` -> OK
   - `node tests/installed_extension_smoke.js` -> OK
   - `node tests/own_ide_panel_headless_e2e_smoke.js` -> OK

## Resultado tecnico
- La reinstalacion limpia de `own-ide` quedo operativa y verificada.
- El runtime VSCodium pinneado se descargo e instalo de nuevo correctamente.
- La extension se reinstalo sobre perfil limpio sin arrastrar estado previo.
- El panel instalado paso la smoke headless sobre la instalacion real.
- El estado de providers previo a la reinstalacion quedo discriminado con evidencia utilizable:
  - operativos: `hf`, `zai`, `ddeksee`
  - autenticados pero limitados: `openrouter`, `clod`
  - no verificable por ausencia de key: `nvidia`

## Criterio de publicacion Git
- Crear rama correlativa desde `release/v4.2.11-panel-pro`.
- Publicar solo trazabilidad/documentacion de esta iteracion.
- Excluir artefactos y salidas generadas de `dist-*` y estados efimeros del panel.