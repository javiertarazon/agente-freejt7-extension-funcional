# Estado actual
*Actualizado: 2026-05-02 04:18 UTC*
- Slice cerrado: `20260502-h1-01-owned-control-plane-authority`. El control-plane app-owned del perfil `own-ide` ya declara autoridad explicita de `product` y `shell`; el bootstrap la siembra, el panel/runtime la exponen y la verificacion focalizada del bootstrap quedo en verde.
- Incidente activo prioritario: `20260502-own-ide-clean-reinstall-live-verification-git-sync`. Intake cerrado con entregable = reinstalacion limpia de own-ide + validacion real de interfaz/agente + comprobacion del paquete standalone; limpieza = purga total del perfil/runtime aislado autorizada; Git = verificar y sincronizar con remoto si hay cambios reales pendientes.
- Publicacion Git cerrada: la iteracion actual quedo publicada en `origin/release/v4.2.12-own-ide-native-product` y la PR #3 (`release: own-ide native-product and core-v2 hardening`) ya esta abierta contra `release/v4.2.12-clean-install`; se excluyeron del scope los artefactos generados pesados (`dist-deb/**/runtime/**`, binarios `.deb/.rpm` y outputs temporales del prompt probe).
- Incidente activo: `20260501-own-ide-native-product-ownership`. Primer slice completado: own-ide ya siembra un control-plane propio de perfil (`freejt7-owned-ide.json`) y el runtime/panel leen con prioridad ese estado app-owned para provider/model/runtime/owner-mode en standalone. El empaquetado deb/rpm ya incluye el helper compartido y existe plan maestro en `own-ide-native-product-plan.md`.
- Incidente cerrado: `20260501-own-ide-live-agent-first-prompt-verification`. La VSIX activa se recompilo/reinstalo en `own-ide` y la prueba real con el prompt typo `qiuero una skill...` ya no muestra fallback tecnico visible; la ruta sigue en `freejt7-agent-core-v2` y el probe prioriza `skill-creator` + `make-skill-template`.
- Incidente cerrado: `20260501-own-ide-agent-first-runtime-hardening`. own-ide ya sanea `runtimeBackend` a `freejt7-v2` en standalone, el planner usa `freejt7-agent-core-v2` como default para provider externo y deja `openclaw-agent` solo para prompts con MCP nativo, y `routeTaskWithGoal()` dejó de usar `_callProvider()` directo.
- Incidente cerrado: `20260501-corev2-skill-intent-context-fix`. `chat-context`, `freejt7-agent-core-v2` y `freejt7-agent-runtime` ya endurecen el routing de creacion de skills, evitan reinyectar rutas viejas no pedidas y mantienen separado el resumen tecnico del visible; la skill Zorin GUI quedo creada en `.github/skills/zorin-gui-software-install/SKILL.md`.
- Último run exitoso cerrado: `20260430-rpm-buildid-justification-tree-validation` (2026-04-30).
- Run relacionado previo: `20260430-auditoria-standalone-packaging-claim`.
- Resultado base vigente: existe `freejt7-agent-core-v2` paralelo y `own-ide` sigue apuntando a `freejt7.panel.runtimeBackend=freejt7-v2`.
- Core-v2 ahora ejecuta tools locales, skills, MCP local y `subagent_run` con recursion acotada, trazas hijas y agregacion de evidencia/cambios al padre.
- La remediacion Fase 1-2 ya quedo cerrada: intake real obligatorio en el panel, guard de cancelacion antes de `enqueue`, continuidad descontaminada y contexto local reducido a señales verificables.
- Existe una regresion nueva para el guard de evidence gating del core-v2: `tests/freejt7_agent_core_v2_evidence_gate_smoke.js`.
- La matriz exacta de cambios y la transicion de UI hacia own-ide quedaron documentadas en `docs/22-REMEDIACION-FASE1-2-MATRIZ-Y-TRANSICION-OWN-IDE.md`.
- `own-ide` ya verifica el bundle real instalado, no solo la versión listada: el bootstrap purga la instalación previa y, si VSCodium bloquea reinstalar la misma VSIX, extrae la VSIX manualmente al `extensions-dir`.
- Veredicto arquitectónico vigente: Free JT7 ya es agent-first integral sobre `own-ide`, pero sigue siendo una VSIX sobre VSCodium/VS Code, no un producto independiente en sentido fuerte tipo Manus/Codex.
- Auditoría standalone vigente: el claim de “app propia” sigue siendo el de launcher + VSIX sobre VSCodium, pero `own-ide` ya usa runtime pinneado con `sha256`, el RPM se genera como `x86_64` y existe validación headless del panel instalado en el perfil real.
- Justificación RPM vigente: los warnings `Missing build-id` confirmados en `package:rpm` provienen solo de módulos nativos precompilados del runtime VSCodium embebido; el spec generado ya los trata como payload vendor no bloqueante.
- Regla operativa vigente: en validaciones de árbol/working tree excluir `dist-deb/**` y `dist-rpm/**` salvo auditoría explícita de packaging para no inflar contexto con artefactos generados.
- Iteración operativa vigente: `own-ide` fue desmontado y reinstalado sobre perfil/runtime limpio; la evidencia de ejecución y estado real de providers quedó consolidada en `docs/23-REINSTALACION-LIMPIA-OWN-IDE-Y-VERIFICACION-PROVIDERS.md`.
- Rama remota vigente para esta iteración: `origin/release/v4.2.12-own-ide-native-product`.
- Incidente `20260501-panel-intake-corev2-chat-fix` cerrado: el panel mantiene el intake dentro del chat y el fallo restante de core-v2 estaba en la policy MCP nativa, que bloqueaba rutas absolutas externas explícitas con `ok=false` aunque la acción ya viniera resuelta.

## Verificación más reciente
- `node tests/freejt7_app_bootstrap_smoke.js && node tests/freejt7_own_ide_bootstrap_smoke.js` -> OK
- `get_errors` en `scripts/freejt7-owned-control-plane.js`, `scripts/freejt7-app-bootstrap.js`, `src-js/core/control-panel.js`, `src-js/core/extension.runtime.js`, `tests/freejt7_app_bootstrap_smoke.js` -> OK
- `npm run build:bundle && node tests/chat_context_smoke.js && npm run test:freejt7-agent-core-v2-smoke && node tests/freejt7_agent_runtime_smoke.js && node tests/control_panel_state_regression_smoke.js && npm run test:control-panel-enqueue-cancel-smoke && node tests/extension_runtime_skill_priority_smoke.js && npm run test:freejt7-app-bootstrap-smoke` -> OK
- `npm run package:deb && npm run test:deb-package-smoke` -> OK (`dist-deb/freejt7-desktop_4.2.11-1_amd64.deb`)
- `npm run package:rpm && npm run test:rpm-package-smoke` -> OK (`dist-rpm/freejt7-desktop_4.2.11-1_x86_64.rpm`; warnings `Missing build-id` solo en payload vendor `runtime/vscodium/.../node_modules/**`)
- `npm run test:freejt7-app-bootstrap-smoke` -> OK (crea `freejt7-owned-ide.json`)
- `get_errors` en runtime/panel/bootstrap/control-plane -> OK
- `npm run build:bundle` -> OK
- `npm run test:freejt7-own-ide-bootstrap-smoke` -> OK
- `node tests/control_panel_enqueue_cancel_smoke.js` -> OK
- `node tests/freejt7_own_ide_bootstrap_smoke.js` -> OK
- `node tests/own_ide_panel_headless_e2e_smoke.js` -> OK
- `npm run package:deb` -> OK (`dist-deb/freejt7-desktop_4.2.11-1_amd64.deb`)
- `npm run package:rpm` -> OK (`dist-rpm/freejt7-desktop_4.2.11-1_x86_64.rpm`)
- `npm run package:rpm | grep -iE "build-id|warning:"` -> warnings solo sobre `runtime/vscodium/current/resources/app/node_modules/**`; build OK
- `npm run test:freejt7-app-bootstrap-smoke` -> OK
- `npm run test:freejt7-own-ide-bootstrap-smoke` -> OK
- `npm run test:deb-package-smoke` -> OK
- `npm run test:rpm-package-smoke` -> OK
- `dpkg-deb -I/-c dist-deb/freejt7-desktop_4.2.11-1_amd64.deb` -> OK; evidencia de launcher+VSIX y ownership del builder
- `rpm2cpio dist-rpm/freejt7-desktop_4.2.11-1_noarch.rpm | cpio -t` -> OK; evidencia de launcher+VSIX
- `sha256sum` VSIX raíz vs VSIX embebida en `.deb`/`.rpm` -> distinto; artefactos `dist-*` no alineados con la VSIX actual
- `node tests/freejt7_agent_core_v2_smoke.js` -> OK
- `node tests/control_panel_enqueue_cancel_smoke.js` -> OK
- `node tests/freejt7_agent_core_v2_evidence_gate_smoke.js` -> OK
- `node tests/freejt7_agent_runtime_smoke.js` -> OK
- `node tests/panel_execution_mode_smoke.js` -> OK
- `node tests/provider_direct_mode_smoke.js` -> OK
- `node tests/control_panel_state_regression_smoke.js` -> OK
- `node tests/freejt7_own_ide_bootstrap_smoke.js` -> OK
- `npm run app:own-ide:dry-run` -> OK
- `npm run app:own-ide:setup` -> OK (fallback manual de VSIX activado)
- `node tests/own_ide_installed_extension_smoke.js` -> OK
- Prueba live core-v2 -> OK (`copilot-agent/runs/core-v2-live/validation.txt`, traza `copilot-agent/core-v2-runs.jsonl`)
- `python skills_manager.py policy-validate` -> OK
- `python skills_manager.py doctor --strict` -> OK
- `python skills_manager.py rollout-mode` -> autonomous/full
- `python skills_manager.py host-mode status` -> OK
- `python skills_manager.py ide-detect --json` -> OK
- Probe live de providers -> `hf=OK`, `zai=OK`, `ddeksee=OK`, `openrouter=HTTP429`, `clod=HTTP429 Team quota exceeded`, `nvidia=no-key`
- `rm -rf ~/.freejt7-app/profiles/own-ide ~/.freejt7-app/runtime/vscodium` -> OK
- `npm run package:local` -> OK
- `npm run app:own-ide:setup` -> OK
- `node tests/freejt7_own_ide_bootstrap_smoke.js` -> OK
- `node tests/installed_extension_smoke.js` -> OK
- `node tests/own_ide_panel_headless_e2e_smoke.js` -> OK
- `node temp_install_test/own_ide_prompt_probe.js` -> OK (`visibleTechnicalFallback=false`, `executionRoute=freejt7-agent-core-v2`, `prioritizedSkills=skill-creator, make-skill-template, ...`)

## Actualizacion 2026-05-02
- Se ejecuto H1-01 del backlog: `scripts/freejt7-owned-control-plane.js` ahora define bloques explicitos `product` y `shell` para ownership agent-first; `scripts/freejt7-app-bootstrap.js` los siembra en cada perfil app-owned; `src-js/core/control-panel.js` y `src-js/core/extension.runtime.js` exponen el resumen de autoridad resultante.
- Se formalizo la arquitectura vNext en `docs/24-ARQUITECTURA-FORMAL-FREEJT7-VNEXT.md`.
- El Hito 1 quedo traducido a backlog ejecutable por modulos reales en `docs/25-HITO1-BACKLOG-EJECUTABLE-POR-MODULOS.md`.
- El corte limpio quedo clasificado en `docs/26-PROPUESTA-CORTE-LIMPIO-MAPA-ARCHIVOS.md` con tres decisiones operativas: conservar el nucleo (`core-v2`, session/policy/audit, control-plane y provider registry), congelar la compatibilidad host (`package.json`, `extension.js`, `extension.runtime.js`, runtimes subordinados) y reemplazar primero `src-js/core/control-panel.js` como shell monolitica.
- Resultado neto: el repo ya tiene un paquete aprobable para arrancar la migracion agent-first sin seguir describiendola solo en chat.

## Bloqueos activos
- [ ] Seguir endureciendo el claim de app propia más allá del launcher + VSIX si se busca paridad fuerte con IDEs totalmente propios.
- [ ] Resolver cuota/rate-limit de `openrouter` y `clod` si se quiere cierre de verificación live al 100% sobre todos los providers autenticados.

## Siguiente acción recomendada
Avanzar a `H1-02` de `docs/25-HITO1-BACKLOG-EJECUTABLE-POR-MODULOS.md` para reducir al host a adaptador, usando como base el control-plane ya endurecido en H1-01; en paralelo sigue abierto el incidente `20260502-own-ide-clean-reinstall-live-verification-git-sync` como frente operativo independiente.
