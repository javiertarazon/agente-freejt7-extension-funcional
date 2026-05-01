# Auditoría Técnica: Fallos de Autonomía en el Agente Free JT7

**Autor:** Manus AI
**Fecha:** 28 de abril de 2026
**Objetivo:** Identificar por qué el agente Free JT7 se comporta como un chat básico y no como un agente autónomo (tipo Trae, Codex o Manus).

---

## 1. Hallazgos Críticos: Causas de la Baja Autonomía

Tras un análisis profundo del código fuente, se han identificado tres causas estructurales que impiden que Free JT7 tome el control proactivo del IDE.

### 1.1. La Bifurcación "Chat Directo" vs "Agente"
El problema principal reside en el `ProviderRouter.js` y `control-panel.js`. El sistema permite un modo de ejecución llamado **`direct`**.
- **Falla:** Si el panel está en modo `direct`, el router salta completamente el runtime del agente y llama al LLM como un chat simple.
- **Mala Práctica:** El panel de control expone este modo al usuario y, en muchas configuraciones, es el modo por defecto o el modo de "fallback" automático ante cualquier error.
- **Consecuencia:** El usuario recibe una respuesta de texto del modelo (ej. OpenRouter/Claude) sin que el agente tenga capacidad de usar herramientas o ver el workspace.

### 1.2. Heurísticas de Decisión Frágiles (`canResolveLocalGoal`)
En `local-agent-runtime.js`, el sistema utiliza expresiones regulares (regex) básicas para decidir si una tarea merece ser tratada por el agente o no.
- **Falla:** La función `canResolveLocalGoal` bloquea explícitamente palabras clave como "continua", "hola" o "gracias".
- **Impacto:** Si el usuario dice "continúa con la tarea", el sistema decide que **no es una meta resoluble localmente** y degrada la solicitud a una respuesta conversacional de texto, rompiendo el bucle de autonomía.
- **Comparación:** Agentes como Trae o Manus analizan la intención semántica, no solo palabras clave aisladas, para mantener el control del flujo.

### 1.3. Política de Fallback Agresiva hacia el "Mundo Texto"
El archivo `extension.runtime.js` y sus tests de humo revelan una política de "degradación elegante" que, en la práctica, sabotea la autonomía.
- **Falla:** Ante cualquier error del gateway (OpenClaw) o falta de configuración, el sistema está programado para intentar un `provider-direct-fallback`.
- **Mala Práctica:** En lugar de informar del error técnico o intentar reparar el entorno (auto-curación), el agente se "rinde" y se convierte en un chat de texto. El usuario percibe esto como que el agente "no funciona" o es "básico".

---

## 2. Análisis de la Interfaz de Usuario (Panel de Control)

El Panel de Control (`control-panel.js`) está diseñado más como un **configurador de modelos** que como una **superficie de agente**.

| Elemento de UI | Problema Identificado | Impacto en Autonomía |
| :--- | :--- | :--- |
| **Selector de Modo** | Permite elegir entre `agent` y `direct`. | Confunde al usuario y permite saltarse la lógica del agente. |
| **Botón "Probar Proveedor"** | Fomenta la validación de la conexión de chat, no de la capacidad de acción. | Desvía la atención de la salud de las herramientas (tools/MCP). |
| **Falta de Feedback de Loop** | El panel no muestra claramente los pasos de pensamiento (Chain of Thought) antes de actuar. | El usuario siente que está en un chat síncrono tradicional. |

---

## 3. Comparativa con Estándares (Trae / Codex / Manus)

| Característica | Free JT7 (Actual) | Estándar "Agent-First" |
| :--- | :--- | :--- |
| **Iniciativa** | Reactiva (espera prompt). | Proactiva (propone cambios al ver el contexto). |
| **Uso de Herramientas** | Condicional y frágil (basado en regex). | Nativo y constante (Tool-use por defecto). |
| **Manejo de Errores** | Degradación a texto (Chat). | Reintento con herramientas de diagnóstico. |
| **Control del IDE** | Webview aislado. | Integración profunda en el sistema de archivos y comandos. |

---

## 4. Recomendaciones de Corrección

Para que Free JT7 funcione como un agente autónomo real, se sugieren los siguientes cambios inmediatos:

1. **Eliminar el Modo Directo en la UI Principal:** El modo `direct` debería ser una herramienta de diagnóstico oculta, no una opción de uso diario. El sistema debe forzar siempre el modo `agent`.
2. **Reemplazar Regex por Clasificación de Intención:** El runtime no debe decidir si actúa basándose en si la palabra "archivo" está presente. Debe enviar siempre la solicitud al loop del agente para que este decida qué herramientas necesita.
3. **Implementar Auto-Curación del Gateway:** Si OpenClaw falla, el agente debería intentar reiniciarlo o diagnosticar el puerto, en lugar de caer silenciosamente a un chat de texto.
4. **Unificar el Sistema de Intake:** El "Intake obligatorio" actual interrumpe el flujo. Debe integrarse de forma fluida en el chat para que el agente extraiga los requisitos de forma autónoma.
5. **Visibilidad del Loop de Pensamiento:** Modificar el Webview para mostrar las "Micro-tareas" en tiempo real mientras el agente las ejecuta, permitiendo al usuario ver la autonomía en acción.

---

## 5. Conclusión de la Auditoría

El repositorio tiene una base técnica sólida (un runtime complejo, gestión de sesiones y soporte MCP), pero está **auto-limitado por políticas de diseño conservadoras**. El sistema prefiere dar una respuesta de texto rápida (chat básico) antes que arriesgarse a un fallo del agente. Para alcanzar el nivel de Trae o Manus, Free JT7 debe "quemar las naves" del modo chat y comprometerse al 100% con el bucle de ejecución autónomo.
