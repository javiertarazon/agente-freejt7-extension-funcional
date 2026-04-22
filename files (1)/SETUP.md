# ⚙️ SETUP — Instalación Completa

## 1. Requisitos Previos

| Herramienta | Versión mínima | Comando de verificación |
|-------------|---------------|-------------------------|
| Python      | 3.10+         | `python --version`      |
| Node.js     | 18+           | `node --version`        |
| npm         | 9+            | `npm --version`         |
| VS Code     | 1.85+         | —                       |
| ffmpeg      | 6+            | `ffmpeg -version`       |

### Instalar ffmpeg (requerido por Remotion)

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**Windows:**
```bash
# Con Chocolatey
choco install ffmpeg
# O descargar desde https://ffmpeg.org/download.html
```

---

## 2. Extensiones de VS Code Recomendadas

Instalar con `Ctrl+P` → pegar cada línea:

```
ext install ms-python.python
ext install ms-python.vscode-pylance
ext install bradlc.vscode-tailwindcss
ext install esbenp.prettier-vscode
ext install ms-vscode.vscode-typescript-next
ext install dbaeumer.vscode-eslint
ext install anthropic.claude-code
```

> 💡 **Claude Code** es la extensión oficial de Anthropic para VS Code.
> Instálala desde: https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code

---

## 3. Configurar el Proyecto Python

```bash
# Crear entorno virtual
python -m venv venv

# Activar (Linux/macOS)
source venv/bin/activate

# Activar (Windows)
venv\Scripts\activate

# Instalar dependencias
pip install anthropic python-dotenv rich typer
```

### Archivo `.env`

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-6
REMOTION_PROJECT_PATH=./remotion_project
OUTPUT_VIDEO_PATH=./output_videos
```

---

## 4. Configurar el Proyecto Remotion

```bash
mkdir remotion_project && cd remotion_project
npm init remotion@latest
# Seleccionar: "Hello World" template
# Luego instalar dependencias adicionales
npm install @remotion/renderer @remotion/bundler
```

### `remotion_project/package.json` (agregar scripts)

```json
{
  "scripts": {
    "build": "remotion bundle",
    "render": "remotion render",
    "studio": "remotion studio",
    "render:ci": "node ../agents/render_cli.js"
  }
}
```

---

## 5. Configurar VS Code Tasks

Crear `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "🎬 Render Video con Claude",
      "type": "shell",
      "command": "python agents/video_pipeline_agent.py --prompt '${input:videoPrompt}'",
      "group": { "kind": "build", "isDefault": true },
      "presentation": { "reveal": "always", "panel": "new" }
    },
    {
      "label": "🎨 Solo Claude Design",
      "type": "shell",
      "command": "python agents/claude_design_agent.py --prompt '${input:designPrompt}'",
      "group": "build"
    },
    {
      "label": "▶️ Remotion Studio",
      "type": "shell",
      "command": "cd remotion_project && npm run studio",
      "group": "build",
      "isBackground": true
    }
  ],
  "inputs": [
    {
      "id": "videoPrompt",
      "type": "promptString",
      "description": "Describe el video que quieres crear:",
      "default": "Video promocional de 15 segundos para una app de fitness"
    },
    {
      "id": "designPrompt",
      "type": "promptString",
      "description": "Describe el diseño visual:",
      "default": "Diseño minimalista con paleta azul y blanco"
    }
  ]
}
```

---

## 6. Ejecutar Todo

| Acción | Comando |
|--------|---------|
| Pipeline completo | `Ctrl+Shift+B` (VS Code Task) |
| Solo diseño | `python agents/claude_design_agent.py` |
| Solo video | `python agents/remotion_agent.py` |
| Remotion Studio UI | `cd remotion_project && npm run studio` |
| Debug agente | F5 (con `launch.json` configurado) |
