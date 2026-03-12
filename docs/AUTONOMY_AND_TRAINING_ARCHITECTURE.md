# Arquitectura de Autonomia y Entrenamiento de Agentes de Codigo

## Objetivo
Unificar dos capas de mejora:
- Capa 1 (operativa): memoria persistente en Markdown para no repetir errores y mantener trazabilidad.
- Capa 2 (modelo): entrenamiento por lotes (no en vivo) para absorber conocimiento sin degradar el modelo.

## Politica de almacenamiento
- Modo activo: **single-folder**.
- Todo el estado del agente vive dentro del mismo proyecto (`.agent-learning/`, `docs/`, `tools/agent_autolearn/`).
- No se usan rutas externas para datasets, checkpoints o logs en esta configuracion.

## Analisis tecnico (incluido desde tu referencia)
- Entrenar el modelo tras cada error en vivo es mala practica para modelos pequenos por riesgo de "catastrophic forgetting".
- Enfoque recomendado: separar ejecucion y entrenamiento.
- Durante el trabajo diario se recolectan exitos validados.
- En ventanas de tiempo (nocturno o por umbral) se entrena LoRA por lotes.

## Bucle recomendado
1. Planificar en `docs/TASKS.md`.
2. Ejecutar y validar soluciones (tests, lint, backtest, scripts).
3. Si falla: corregir y registrar leccion en `docs/MEMORY.md`.
4. Siempre: guardar ejemplo en `.agent-learning/dataset.jsonl` tras cada run, exitosa o no. El campo `score` distingue aciertos (1.0) de fallos (0.0).  El recolector lo hace automáticamente.
5. Cuando hay suficientes ejemplos nuevos: ejecutar `tools/agent_autolearn/auto_trainer.py`.
6. Registrar resultados de estrategia en `docs/STRATEGY_LOG.md`.

## Implementacion en este repo
- Memoria persistente:
  - `docs/TASKS.md`
  - `docs/MEMORY.md`
  - `docs/STRATEGY_LOG.md`
- Auto-entrenamiento:
  - `tools/agent_autolearn/collector.py`
  - `tools/agent_autolearn/validate_and_collect.py`
  - `tools/agent_autolearn/auto_trainer.py`
  - `tools/agent_autolearn/lora_train_unsloth.py`
  - `tools/agent_autolearn/nightly_train.ps1`

## Politica operativa
- Politica abierta para `free-jt7` y Codex/OpenClaw habilitada en:
  - `.github/free-jt7-policy.yaml`
  - `.github/agents/free-jt7.agent.md`
  - `.github/agents/openclaw.agent.md`
  - `.github/copilot-instructions.md`
  - `.codex-agent/agent-config.yaml`

## Criterio de calidad minimo para trading
- Profit Factor > 1.5
- Max Drawdown < 10%
- Sharpe > 1.0
- Siempre con datos reales descargados por script (no datos inventados)

## Limites y seguridad tecnica
- No entrenar por cada fallo individual.
- Priorizar lotes de ejemplos exitosos y deduplicados.
- Mantener historial y estado para rollback operativo.
- Si no hay progreso en N intentos, generar reporte de bloqueo en `docs/MEMORY.md`.
