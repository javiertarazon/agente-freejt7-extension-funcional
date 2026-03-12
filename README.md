# Agente Free JT7 Extension Funcional

Version: `4.1`

Repositorio funcional del runtime Free JT7 para VS Code y otros IDE compatibles:
- ejecutable por CLI (`skills_manager.py`)
- instalable en proyectos (`scripts/setup-project.ps1`, `scripts/add-free-jt7-agent.ps1`)
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

### Organización de scripts
Todos los helpers de instalación y pruebas ahora residen en `scripts/`.
- `scripts\setup-project.ps1` es la herramienta principal para añadir el agente a un proyecto.
- `scripts\add-free-jt7-agent.ps1` permanece por compatibilidad y está **deprecated**.
- `scripts\test-wrappers.ps1` comprueba los wrappers CLI.

La carpeta `legacy-vscode-free-jt7-agent` y los registros en
`copilot-agent\admin-runs` han sido eliminados para reducir el desorden.


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

### Verificar e instalar

Después de crear el paquete puedes confirmar la instalación ejecutando
`code --list-extensions` y buscando `freejt7`.

Para instalar manualmente usa el menú de extensiones de VS Code o:

```powershell
code --install-extension agente-freejt7-extension-funcional-4.0.0.vsix
```

### Probar wrappers

Un nuevo script `scripts\test-wrappers.ps1` ofrece tests básicos para los
wrappers y el helper `runOpenClaw` exportado desde `extension.js`.  Ejecuta
desde la raíz del workspace:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-wrappers.ps1
```

El script imprimirá los comandos que intenta ejecutar y fallará con
`ENOENT` si no se encuentra el binario `openclaw`, lo cual es el comportamiento
esperado en un entorno de desarrollo.

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

### Wrappers OpenClaw (cuando esté disponible)
Si el binario `openclaw` se encuentra en el PATH o dentro de
`OPEN CLAW/node_modules/.bin/`, la extensión habilita dos comandos
adicionales que ejecutan directamente el CLI:

- `Free JT7: OpenClaw Gateway Status` – muestra salida de
  `openclaw gateway status`.
- `Free JT7: Run OpenClaw CLI` – solicita argumentos libres
  para enviarlos al comando `openclaw`.

Estos comandos son útiles para trabajar con el gateway desde VS Code
sin necesidad de abrir manualmente una terminal, pero **no arrancan ni
gestionan el servidor**; sólo envían órdenes al ejecutable si existe.

## Archivos clave

- `skills_manager.py`
- `setup-project.ps1`
- `add-free-jt7-agent.ps1`
- `.github/copilot-instructions.md`
- `.github/agents/free-jt7.agent.md`
- `.github/free-jt7-policy.yaml`
- `.github/free-jt7-model-routing.json`

## Comandos adicionales para OpenClaw

Además de los wrappers básicos, la extensión ahora expone comandos que ayudan
con el servidor OpenClaw:

- `Free JT7: Start OpenClaw Gateway` – ejecuta `openclaw gateway --port 18789`.
- `Free JT7: Edit OpenClaw Config` – abre `~/.openclaw/openclaw.json` en el
  editor para su edición.
- `Free JT7: Install OpenClaw Service` – corre `openclaw onboard --install-daemon` para
  crear/actualizar el servicio del gateway.
- `Free JT7: OpenClaw ACP` – lanza `openclaw acp` con argumentos interactivos,
  útil para conectar IDEs que hablen ACP.
- `Free JT7: OpenClaw Channels Login` – ejecuta `openclaw channels login` para
  emparejar un canal desde VS Code.

Estos comandos facilitan el uso del CLI desde VS Code, pero el servidor no se
autogestiona; sigue siendo responsabilidad del usuario mantenerlo en ejecución.
