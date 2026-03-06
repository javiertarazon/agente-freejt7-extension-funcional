# Free JT7 Runbook

## Checklist operativo

1. Validar policy:
   - `python skills_manager.py policy-validate`
2. Confirmar modo rollout:
   - `python skills_manager.py rollout-mode`
3. Diagnostico estricto:
   - `python skills_manager.py doctor --strict`
4. Resolver skills para la tarea:
   - `python skills_manager.py skill-resolve --query "<objetivo>" --top 3`
5. Ejecutar run:
   - `python skills_manager.py task-run --goal "<objetivo>" --commands "..."`
6. Revisar checklist:
   - `python skills_manager.py task-list --limit 20`
   - `python skills_manager.py task-checklist --run-id <run_id>`
7. Revisar evidencia:
   - `copilot-agent/runs/<run_id>.json`
   - `copilot-agent/runs/<run_id>.events.jsonl`

## Modo canary

- `shadow`: simula steps sin ejecutar comandos.
- `assist`: ejecuta con guardrails y reporta sugerencias.
- `autonomous`: ejecuta pipeline completo con quality gate.
