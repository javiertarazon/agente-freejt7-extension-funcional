# Modificaciones para VS Code Extension/Integración

Este documento lista los cambios clave heredados de la línea v3.x para operar Free JT7 como integración funcional en VS Code.

## Núcleo de integración

1. Instrucciones de Copilot:
   - Archivo: `.github/copilot-instructions.md`
   - Función: protocolo operativo, comandos canónicos y reglas de ejecución.

2. Definición de agente:
   - Archivo: `.github/agents/free-jt7.agent.md`
   - Función: agente invocable en chat con flujo de plan, ejecución y reporte.

3. Política de ejecución:
   - Archivo: `.github/free-jt7-policy.yaml`
   - Función: control de autonomía, riesgo, privilegios y checklist de salida.

4. Ruteo de modelos:
   - Archivo: `.github/free-jt7-model-routing.json`
   - Función: resolución de modelo por IDE/perfil.

5. Configuración VS Code:
   - Archivo: `.vscode/settings.json`
   - Función: activar `chat.agent.enabled`, ubicación de agentes y archivo de instrucciones.

## Runtime y automatización

1. Gestor principal:
   - Archivo: `skills_manager.py`
   - Función: instalación, activación de skills, operación autónoma y utilidades admin.

2. Instalación rápida por proyecto:
   - Scripts: `setup-project.ps1`, `add-free-jt7-agent.ps1`
   - Función: bootstrap de integración en proyectos de usuario.

## Estado de v4.0

- Documentación consolidada: completada.
- Importación de runtime/código desde v3.1: pendiente (siguiente sprint técnico).

