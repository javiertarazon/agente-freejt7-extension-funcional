# Agente Free JT7 Extension Funcional

Version: `4.0`

Repositorio funcional del runtime Free JT7 para VS Code:
- ejecutable por CLI (`skills_manager.py`)
- instalable en proyectos (`setup-project.ps1`, `add-free-jt7-agent.ps1`)
- empaquetable como extension VS Code (`.vsix`)

## Estado actual

- Runtime migrado desde la linea v3.1.
- Catalogo de skills disponible en `.github/skills`.
- Configuracion de agente, policy y model routing incluida.
- Extension VS Code incluida (`package.json` + `extension.js`).

## Origen y trazabilidad

- Repositorio fuente: `https://github.com/javiertarazon/agente-copilot.git`
- Rama de transicion previa: `feature/agente-free-extension-v3.1`
- Commit base de referencia: `1e4e6a3`

Documentacion:
- `docs/00-TRAYECTORIA-ORIGEN.md`
- `docs/01-MODIFICACIONES-VSCODE-EXTENSION.md`
- `docs/02-ERRORES-RESUELTOS.md`

## Requisitos

- Windows 10/11
- Python 3.11+ (`python` en PATH)
- Node.js 20+ (para generar `.vsix`)
- VS Code 1.90+

## Uso CLI rapido

```powershell
python skills_manager.py policy-validate
python skills_manager.py ide-detect --json
python skills_manager.py install "C:\ruta\mi-proyecto" --ide vscode --update-user-settings
```

## Generar extension VS Code (.vsix)

```powershell
npm.cmd install
npm.cmd run package
```

Esto genera un archivo `.vsix` en la raiz del repo.

## Instalar extension en VS Code

1. VS Code -> Extensions
2. Menu `...` -> `Install from VSIX...`
3. Seleccionar el archivo `.vsix` generado
4. Ejecutar el comando:
   - `Free JT7: Instalar en workspace actual`

## Comandos de la extension

- `Free JT7: Instalar en workspace actual`
- `Free JT7: Validar runtime`
- `Free JT7: Abrir documentacion`

## Archivos clave

- `skills_manager.py`
- `setup-project.ps1`
- `add-free-jt7-agent.ps1`
- `.github/copilot-instructions.md`
- `.github/agents/free-jt7.agent.md`
- `.github/free-jt7-policy.yaml`
- `.github/free-jt7-model-routing.json`
