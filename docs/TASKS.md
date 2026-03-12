# Roadmap de Ejecucion Autonoma

## Reglas de uso
- Este archivo es la fuente de verdad de progreso.
- Toda tarea compleja se divide en micro-tareas.
- Cada item debe cambiar de `[ ]` a `[x]` al completarse.
- Si una tarea falla, agregar sub-item de remediacion y reintento.

## Plantilla rapida
- [ ] Objetivo principal
  - [ ] Subtarea A
  - [ ] Subtarea B
  - [ ] Verificacion

## Ciclo Quant Autonomo
- [ ] Fase 1: Setup y datos
  - [ ] Validar entorno Python y dependencias
  - [ ] Descargar datos reales OHLCV
- [ ] Fase 2: Backtest base
  - [ ] Ejecutar estrategia base
  - [ ] Calcular metricas (PF, DD, Sharpe)
- [ ] Fase 3: Iteracion
  - [ ] Registrar resultado en `docs/STRATEGY_LOG.md`
  - [ ] Si falla criterio, aplicar mejora y reintentar
- [ ] Fase 4: Cierre
  - [ ] Seleccionar mejor configuracion
  - [ ] Documentar entregable final
