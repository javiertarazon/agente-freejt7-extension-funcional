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

## Historial de bloqueos complejos
- Pendiente: agregar entradas cuando haya bloqueos con 3+ intentos.
