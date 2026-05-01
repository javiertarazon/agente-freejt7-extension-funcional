# Plan de Acción: Free JT7 - Autonomía Total

**Autor:** Manus AI
**Fecha:** 28 de abril de 2026
**Objetivo:** Transformar Free JT7 en un agente autónomo real con control proactivo del IDE, una interfaz de usuario simplificada estilo Trae, y un sistema robusto de auto-reparación, integrando de forma nativa y obligatoria Skills, MCP y Tools en su bucle de decisión, eliminando la dependencia crítica de OpenClaw y el modo de chat directo.

---

## 1. Resumen Ejecutivo

Este plan de acción aborda las brechas identificadas en la auditoría técnica, enfocándose en la eliminación de las "malas prácticas" que degradan a Free JT7 a un chat básico. La estrategia es forzar todas las interacciones a través del bucle de ejecución del agente, mejorar su capacidad de toma de decisiones para el uso de herramientas, **integrando de forma nativa y obligatoria los Skills, MCP y Tools como capacidades fundamentales del agente**, implementar mecanismos de auto-reparación y simplificar la interfaz de usuario para reflejar una experiencia "agent-first" proactiva. El resultado será un Free JT7 que no solo propone, sino que también ejecuta cambios en el IDE con la aprobación del usuario, similar a agentes de alto rendimiento como Codex, Kiro o Manus.

## 2. Fases del Plan de Acción

### Fase 1: Refactorización del Flujo de Control (Eliminación del Modo Directo)

**Objetivo:** Asegurar que todas las interacciones del usuario pasen obligatoriamente por el bucle de ejecución del agente, eliminando la posibilidad de caer en un modo de "chat directo" que omite la lógica de herramientas y planificación.

**Tareas Específicas:**

1.  **Modificar `control-panel.js`:**
    *   Eliminar la opción `executionMode: 'direct'` de la interfaz de usuario del panel. El selector de modo de ejecución debe ser removido o configurado para forzar siempre `agent`.
    *   Asegurar que la función `normalizePanelExecutionModeValue` siempre devuelva `'agent'`, independientemente de la configuración persistida o de entrada, a menos que `standaloneMode` sea `false` y se requiera una compatibilidad específica (que se reevaluará en la siguiente fase).
2.  **Ajustar `provider-router.js`:**
    *   Modificar la lógica en `getRoutePlan` para que **nunca** devuelva `primaryRoute: 'provider-direct'` como ruta principal. Todas las solicitudes deben ser delegadas al `agentRuntime` para su planificación.
    *   Revisar la sección `_executeDirectRoute` y su invocación para asegurar que no se utilice en el flujo principal de tareas del agente.
3.  **Revisar `extension.runtime.js`:**
    *   Eliminar o reconfigurar cualquier lógica que actualmente fuerce el `provider-direct-fallback` como primera opción ante errores. El fallback debe ser a un sistema de auto-reparación o a un agente local robusto (ver Fase 3).
4.  **Actualización de Pruebas:**
    *   Modificar los tests `panel_execution_mode_smoke.js` y `provider_direct_mode_smoke.js` para que reflejen el nuevo comportamiento de forzar el modo agente y no permitan la activación del modo directo.

### Fase 2: Mejora del Bucle de Ejecución y Toma de Decisiones (Agent Loop Proactivo con Skills, MCP y Tools)

**Objetivo:** Empoderar al agente Free JT7 para que tome decisiones proactivas sobre el uso de herramientas, genere planes de acción detallados y aplique cambios en el código con una aprobación mínima del usuario, **siempre priorizando y orquestando los Skills, MCP y Tools disponibles**.

**Tareas Específicas:**

1.  **Reemplazar Heurísticas de `canResolveLocalGoal`:**
    *   En `local-agent-runtime.js`, eliminar la función `canResolveLocalGoal` o refactorizarla para que no descarte tareas basándose en palabras clave. La decisión de usar herramientas locales debe ser tomada por el LLM del agente, **considerando siempre los Skills y Tools disponibles**.
2.  **Integración de LLM para Tool-Use Inteligente y Orquestación de Capacidades:**
    *   Modificar `freejt7-agent-runtime.js` para que el LLM del agente sea el principal decisor sobre qué herramientas utilizar (ej. `read_file`, `write_file`, `exec`, `mcp`, `subagent`). Esto implica que el prompt del sistema (`buildFreeJt7SystemPrompt` en `chat-context.js`) debe ser enriquecido con descripciones detalladas de **todos los Skills, MCP servers y Tools disponibles** y sus capacidades.
    *   El LLM debe ser capaz de generar un `capabilityPlan` que incluya la secuencia de **Skills, MCP y Tools** a utilizar para lograr el `goal` del usuario, priorizando la ejecución de acciones sobre la conversación.
3.  **Implementación de Aprobación en un Clic (Plan Detallado con Capacidades):**
    *   Desarrollar un componente en `control-panel.js` que muestre el `plannedActions` y `dispatchTrace` generado por el agente antes de la ejecución de acciones de alto impacto (ej. `write_file`, `exec`). Este plan debe detallar explícitamente los **Skills, MCP y Tools** que el agente propone utilizar.
    *   Permitir al usuario revisar el plan y aprobarlo con un solo clic para proceder con la ejecución. Esto equilibra la autonomía con la seguridad.
4.  **Generación de Planes Detallados y Trazabilidad de Capacidades:**
    *   Mejorar la capacidad del agente para generar `plannedActions` y `dispatchTrace` en `freejt7-agent-runtime.js` que sean semánticamente ricos y legibles por el usuario, sirviendo como la base para la aprobación en un clic. La trazabilidad debe incluir el uso específico de **Skills, MCP y Tools**.
    *   Asegurar que la trazabilidad de estas acciones se registre adecuadamente en el `AuditBus` y sea visible en el inspector del panel.

### Fase 3: Robustez y Auto-Reparación (Sistema Propio sin OpenClaw Crítico)

**Objetivo:** Reducir la dependencia crítica de OpenClaw y construir un sistema de ejecución local más resiliente, capaz de auto-diagnosticar y auto-reparar fallos, garantizando la continuidad del agente. **Este sistema local debe ser capaz de gestionar y ejecutar Tools y Skills básicos de forma independiente.**

**Tareas Específicas:**

1.  **Sistema de Auto-Diagnóstico y Recuperación:**
    *   En `extension.runtime.js` y `openclaw-agent-runtime.js`, implementar lógica para detectar fallos comunes del gateway/runtime (ej. puerto ocupado, proceso de OpenClaw caído, errores de autenticación). 
    *   Ante un fallo, el sistema debe intentar acciones correctivas automáticas: reiniciar el proceso de OpenClaw, verificar la configuración de puertos, o incluso reinstalar dependencias si es necesario. Esto debe ser configurable y con un límite de reintentos.
2.  **Desarrollo de Subsistema de Ejecución Local (Alternativa a OpenClaw para Tools y Skills):**
    *   Investigar y desarrollar un subsistema de ejecución de herramientas local, preferiblemente un módulo Node.js o Python ligero, que pueda replicar las funcionalidades críticas de OpenClaw (ejecución de comandos seguros, acceso a archivos, interacciones básicas con el sistema) sin la necesidad de un proceso externo complejo.
    *   Este subsistema se integrará en `local-agent-runtime.js` y servirá como un fallback robusto cuando OpenClaw no esté disponible o falle persistentemente. El objetivo es que Free JT7 pueda operar con un conjunto básico de **Tools y Skills** incluso sin OpenClaw.
3.  **Manejo de Fallbacks Inteligente:**
    *   Revisar la lógica de fallback en `provider-router.js` y `extension.runtime.js` para priorizar el subsistema de ejecución local (que incluye **Tools y Skills** básicos) antes de cualquier "degradación a chat de texto". El agente debe intentar resolver la tarea con herramientas locales antes de recurrir a una respuesta puramente conversacional.

### Fase 4: Interfaz "Agent-First" Estilo Trae

**Objetivo:** Rediseñar la interfaz de usuario del panel de control para que sea minimalista, centrada en la interacción con el agente y la visualización de su progreso, eliminando la complejidad de la configuración de modelos de la vista principal.

**Tareas Específicas:**

1.  **Simplificación del Panel de Control (`control-panel.js`):**
    *   Eliminar los selectores de proveedor, modelo, `runtimeBackend` y `policyProfile` de la vista principal del panel. Estos ajustes deben moverse a la configuración de la extensión (VS Code Settings).
    *   La interfaz principal debe consistir en una barra de entrada de texto (prompt) y un área de conversación/actividad donde el agente muestre su progreso, planes y resultados, **incluyendo la visualización del uso de Skills, MCP y Tools**.
2.  **Visualización del Bucle de Pensamiento:**
    *   Implementar en el panel una visualización clara del "Chain of Thought" del agente: mostrar las micro-tareas que está ejecutando, las **Skills, MCP y Tools** que está utilizando y los resultados intermedios. Esto puede ser a través de un log estructurado o una representación visual de la pila de tareas.
3.  **Integración de Aprobación de Acciones:**
    *   El mecanismo de "aprobación en un clic" de la Fase 2 debe ser prominente en la UI, apareciendo de forma contextual cuando el agente proponga una acción que requiera confirmación, **detallando las capacidades (Skills, MCP, Tools) que se activarán**.
4.  **Configuración en Ajustes de VS Code:**
    *   Asegurar que todas las opciones de configuración de proveedores, modelos, `runtimeBackend` y `policyProfile` sean accesibles y configurables a través de los ajustes estándar de VS Code (`settings.json`), como se hace en extensiones profesionales.

### Fase 5: Optimización de la Toma de Decisiones del Agente (LLM)

**Objetivo:** Refinar la capacidad del agente Free JT7 para tomar decisiones óptimas sobre el uso de herramientas y la planificación de tareas, utilizando su LLM interno como el cerebro central, **siempre considerando y priorizando la orquestación de Skills, MCP y Tools**.

**Tareas Específicas:**

1.  **Mejora del Prompt del Sistema:**
    *   Iterar en el `buildFreeJt7SystemPrompt` para que sea más explícito sobre las expectativas del agente: ser proactivo, usar **Skills, MCP y Tools**, generar planes, y buscar la aprobación del usuario para acciones de alto impacto.
    *   Incluir en el prompt una descripción dinámica y detallada de **todos los Skills, MCP servers y Tools disponibles** en el entorno actual (ej. `read_file`, `write_file`, `exec`, `git`, `npm`, `mcp-cli`, y los nombres/descripciones de los Skills cargados).
2.  **Manejo de Contexto Avanzado:**
    *   Mejorar la forma en que el agente utiliza el `localContext` (`buildLocalContextBlock` en `chat-context.js`) para informar sus decisiones, asegurando que el LLM tenga acceso a la información más relevante del workspace, **incluyendo el estado y la disponibilidad de Skills, MCP y Tools**.
3.  **Evaluación Continua:**
    *   Establecer un proceso para evaluar la calidad de las decisiones del agente y la efectividad de sus planes, utilizando métricas de éxito y fallos para refinar el prompt y la lógica de enrutamiento, **especialmente en relación con la correcta orquestación de Skills, MCP y Tools**.

## 3. Hoja de Ruta (Timeline Estimado)

| Fase | Duración Estimada | Hitos Clave |
| :--- | :--- | :--- |
| **Fase 1:** Refactorización del Flujo de Control | 1 semana | Eliminación de la opción "Modo Directo" en UI y Router. |
| **Fase 2:** Mejora del Bucle de Ejecución | 2 semanas | Agente decide tool-use, aprobación en un clic, planes detallados, **integración nativa de Skills, MCP y Tools**.
| **Fase 3:** Robustez y Auto-Reparación | 3 semanas | Auto-diagnóstico/recuperación, subsistema local de herramientas, **gestión de Tools y Skills básicos sin OpenClaw**.
| **Fase 4:** Interfaz "Agent-First" | 2 semanas | UI estilo Trae, configuración en ajustes, visualización de CoT, **visualización del uso de Skills, MCP y Tools**.
| **Fase 5:** Optimización de Decisiones | 2 semanas | Prompt del sistema mejorado, contexto avanzado, evaluación, **orquestación óptima de Skills, MCP y Tools**.

**Duración Total Estimada:** 10 semanas

## 4. Conclusión

Este plan de acción transformará a Free JT7 de un asistente conversacional a un agente autónomo y proactivo, capaz de tomar el control del IDE y ejecutar tareas complejas con supervisión mínima. La clave será la eliminación de las rutas de escape al "chat básico" y el empoderamiento del agente para que su LLM interno sea el motor de todas las decisiones de planificación y ejecución, **siempre con la capacidad de orquestar y utilizar de forma nativa los Skills, MCP y Tools disponibles**. La interfaz de usuario se simplificará para reflejar esta nueva autonomía, proporcionando una experiencia más fluida y potente para el desarrollador.
