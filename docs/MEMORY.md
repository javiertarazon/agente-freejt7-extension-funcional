# Memoria de Auto-Correccion

## Proposito
Este archivo evita repetir errores en sesiones futuras. Se actualiza despues de corregir fallos reales.

## Reglas
- Registrar solo lecciones accionables.
- Incluir causa raiz y regla preventiva.
- Referenciar archivo/comando cuando aplique.

## Lecciones Aprendidas
| Fecha | Error Tecnico Detectado | Causa Raiz | Solucion y Regla Preventiva |
| :--- | :--- | :--- | :--- |
| 2026-03-11 | Inicializacion del sistema de memoria persistente | No existia `docs/` para trazabilidad operativa | Regla: crear y leer `docs/TASKS.md`, `docs/MEMORY.md` y `docs/STRATEGY_LOG.md` al iniciar tareas complejas |
| 2026-03-13 | Bucle operativo por tarea heredada en estado `en_progreso` | Ejecucion valida completada sin reconciliar una entrada duplicada en `copilot-agent/tasks.yaml` | Regla: despues de verificar una ejecucion, cerrar o cancelar explicitamente todas las tareas duplicadas relacionadas y actualizar `copilot-agent/RESUME.md` antes de continuar |
| 2026-03-13 | Login MT5 fallaba por parametros vacios o rotos | `mt5.js` usaba `params.arguments` (undefined) e interpolaba strings directo en Python | Regla: pasar `params` directo y enviar JSON por stdin al script Python para evitar valores perdidos e inyeccion |
| 2026-03-13 | `ModuleNotFoundError: tools` al ejecutar MT5 | `mt5.js` apuntaba el `sys.path` al subproyecto y no al repo raiz | Regla: resolver `repoRoot` con `path.resolve(__dirname, \"../../..\")` y usarlo en `sys.path` |
| 2026-03-13 | `mt5.initialize()` colgaba sin fin | No habia timeout en el spawn de Python | Regla: aplicar timeout en `executePythonMT5` y devolver error controlado |
| 2026-03-13 | Credenciales MT5 con comillas rompian login | `.env` trae valores entre comillas y se pasaban tal cual | Regla: normalizar strings (strip de comillas) antes de llamar a MT5 |
| 2026-03-13 | MT5 no respondia hasta login por UI | La terminal estaba abierta pero requerÃ­a login desde el menÃº | Regla: usar `jt7_mt5_desktop_login` con shortcut `%fl` si el login por API se cuelga |
| 2026-03-13 | `jt7_mt5_account_info` fallÃ³ tras login previo | Cada tool corre en proceso nuevo y pierde sesiÃ³n | Regla: auto-login por llamada leyendo `credentials_file` o creds directas antes de operaciones |
| 2026-03-13 | `jt7_mt5_account_info` ignoraba credenciales | El handler no pasaba `params` a `executePythonMT5` | Regla: siempre reenviar `params` en tools sin argumentos para habilitar auto-login |
| 2026-03-13 | `mt5_server.py` no arrancaba con SDK MCP reciente | Uso de API antigua (`callback`, `set_available_tools`) | Regla: adaptar a `@server.list_*()` y `stdio_server` con `server.run()` |
| 2026-03-14 | `AppActivate` de MT5 fallo al usar titulo fijo | La ventana de MT5 usa un titulo dinamico con cuenta/servidor, no siempre contiene "MetaTrader 5" | Regla: detectar `MainWindowTitle` por proceso `terminal64` y usar ese titulo antes de enviar SendKeys |
| 2026-03-14 | El wallpaper no se aplicaba aunque el registro cambiaba | `moto_gp.jpg` era HTML descargado con extension `.jpg`; la API del sistema solo veia un archivo invalido | Regla: validar la firma binaria o cargar la imagen con `System.Drawing` antes de usar cualquier archivo descargado como fondo |
| 2026-03-18 | `add-free-jt7-agent.ps1` no encontraba `skills_manager.py` | El script resolvia rutas relativas desde `scripts/` en vez de usar la raiz del repo | Regla: en wrappers ubicados dentro de subcarpetas, derivar `repoRoot` y resolver binarios/archivos criticos desde esa raiz |
| 2026-03-18 | Instaladores preferian una `.venv` rota y fallaban aunque habia Python funcional | Se validaba solo la existencia del ejecutable, no que pudiera arrancar | Regla: antes de preferir `.venv`, ejecutar una sonda corta (`python -c "import sys"`) y si falla, degradar a `python` o `py -3` |
| 2026-03-18 | `scripts/test-wrappers.ps1` dependia del directorio actual | El test llamaba `.\openclaw-start.cmd` desde la raiz del repo, pero el archivo vive en `scripts/` | Regla: en scripts de prueba, usar `$PSScriptRoot` para invocar archivos hermanos y no asumir el `cwd` |
| 2026-03-18 | Instalaciones paralelas chocaban al escribir `.skills_index.json` | `_atomic_write_text` reutilizaba un `.tmp` fijo y dos procesos podian reemplazar el mismo archivo temporal | Regla: para escrituras atomicas cross-process, usar archivos temporales unicos por PID/UUID y reintentos cortos ante `PermissionError` |
| 2026-03-18 | `npm install` del router Copilot fallaba por version inexistente | `package.json` fijaba `@github/copilot-sdk@^0.0.10`, pero esa rama ya no existe en npm | Regla: validar versiones publicadas con `npm view <paquete> versions --json` antes de fijar dependencias nuevas o migradas |
| 2026-03-18 | Copilot SDK rompia en Node por subpath ESM de `vscode-jsonrpc` | `@github/copilot-sdk` importaba `vscode-jsonrpc/node` y el paquete instalado no exportaba ese subpath para ESM | Regla: cuando una dependencia ESM requiera subpaths no exportados, automatizar el shim/patch en `postinstall` en vez de confiar en un `node_modules` manual |
| 2026-03-18 | El router Copilot seguia bloqueado aunque el runtime ya cargaba | No habia credenciales activas para Copilot CLI/SDK y el mensaje original era poco accionable | Regla: soportar tokens por `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN` y devolver una instruccion clara de `copilot login` cuando falte autenticacion |
| 2026-03-18 | `npm audit` del root reportaba 10 vulnerabilidades evitables | Habia una dependencia directa vulnerable (`xml2js`), una transitiva fijable (`undici`) y una devDependency antigua (`vscode`) que arrastraba `mocha/minimist` | Regla: primero retirar dependencias legacy no usadas, luego fijar `overrides` puntuales y revalidar con `npm audit --json` |
| 2026-03-18 | El router Copilot devolvia riesgo residual por `session.idle` a 60s | `sendAndWait()` usa 60000ms por defecto y algunas respuestas reales terminaban despues de emitir contenido | Regla: fijar un timeout de espera mas amplio para fases planner/executor/synthesis cuando el router use SDK real |
| 2026-03-18 | El VSIX empaquetaba binarios y artefactos no Windows del Copilot CLI | `.vscodeignore` no filtraba prebuilds/ripgrep multiplataforma ni `.pdb` de debug | Regla: si la extension solo soporta Windows, excluir artefactos `darwin/linux/arm64` y `.pdb` del empaquetado para bajar peso sin tocar runtime |
| 2026-03-18 | Bundlear solo el runtime JS mejora arranque pero casi no mueve el peso final del VSIX | El tamaño esta dominado por `node_modules/@github/copilot*`, no por `extension.js`/`copilot_router.js` | Regla: usar bundling para reducir superficie y cold-start, pero atacar binarios pesados empaquetados si el objetivo principal es bajar MB de distribucion |

## Historial de bloqueos complejos
- Pendiente: agregar entradas cuando haya bloqueos con 3+ intentos.
