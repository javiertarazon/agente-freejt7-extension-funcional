# Agente Free JT7 Extension Funcional

Version: `4.2.4`

Repositorio funcional del runtime Free JT7 para VS Code y otros IDE compatibles:
- ejecutable por CLI (`skills_manager.py`)
- instalable en proyectos (`scripts/setup-project.ps1`, `scripts/add-free-jt7-agent.ps1`)
- empaquetable como extension VS Code (`.vsix`)

## Estado actual

- Runtime migrado desde la linea v3.1.
- Catalogo de skills disponible en `.github/skills`.
- Configuracion de agente, policy y model routing incluida.
- Extension VS Code incluida (`package.json` + `extension.js`).
- Variante Linux documentada y validada en la rama `feature/linux-v4.2.3`.

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


- Linux y Windows 10/11
- Python 3.11+ (`python` en PATH)
- Node.js 20+ para generar `.vsix` y reconstruir la extension
- Node.js 22.14+ para ejecutar OpenClaw actual si usas gateway y canales
- VS Code 1.90+

## Capas de instalacion

La instalacion operativa del proyecto queda separada en tres capas:

### 1. Extension base + router Copilot

Incluye:

- extension VS Code (`package.json`, `extension.js`, `dist/extension.cjs`)
- runtime JS en `src-js/`
- bootstrap del workspace mediante `skills_manager.py`
- router Copilot con participante `@freejt7`

Requisitos minimos:

- Python 3.11+
- VS Code 1.90+
- GitHub Copilot Chat instalado para que aparezca `@freejt7` en el panel de chat de VS Code
- `copilot` CLI autenticado o token valido para Copilot
- Node 20+ solo si quieres reconstruir el bundle o empaquetar el VSIX

### 2. Servicios fundamentales: MCP + OpenClaw

Esta capa forma parte del funcionamiento completo que espera Free JT7:

- `servidor mpc free jt7/` como servidor MCP local complementario
- OpenClaw como runtime del gateway y de los comandos de canales

Estado operativo esperado:

- `servidor mpc free jt7` debe pasar `npm run smoke`
- `openclaw` debe existir en PATH
- OpenClaw actual exige Node 22.14+

### 3. Integraciones opcionales: MT5

`mcp-servers/mt5/` no es requisito base de la extension. Solo hace falta si quieres automatizacion o consulta de MetaTrader 5.

## Uso CLI rapido

```bash
python3 skills_manager.py policy-validate
python3 skills_manager.py ide-detect --json
python3 skills_manager.py install "/ruta/mi-proyecto" --ide vscode --update-user-settings
```

## Router real con Copilot SDK

La extension ahora incluye un router local con Copilot SDK en `copilot_router.js`.

- Planifica con `gpt-5.4`.
- Ejecuta subtareas con modelos baratos configurables como `claude-haiku-4.5` y `gemini-3-flash`.
- Puede usar un modelo experimental para codigo rapido si configuras `freejt7.copilotRouter.experimentalCodeModel`.
- Registra evidencia en `copilot-agent/runs/` dentro del workspace.

Uso directo por CLI local:

```powershell
node copilot_router.js --goal "describe y resuelve la tarea" --workspace . --json
```

Uso desde la extension:

- comando `Free JT7: Routed Copilot Task`
- participante nativo `@freejt7` en Copilot Chat

Requisito operativo:

- tener instalado GitHub Copilot Chat para el participante `@freejt7` en VS Code.
- tener instalado y autenticado `copilot` CLI.
- si falta login, ejecuta `copilot login`, o configura `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` o `GITHUB_TOKEN`.

### Si `@freejt7` no aparece en Copilot Chat

Las causas mas comunes ya verificadas en Linux son estas:

- GitHub Copilot Chat no esta instalado en el perfil actual de VS Code.
- La sesion actual del IDE no expone `vscode.chat.createChatParticipant`.
- La extension esta instalada, pero el usuario no tiene disponible la infraestructura de chat en ese IDE/perfil.

Compruebalo con:

```bash
code --list-extensions --show-versions | grep -i copilot
```

Y dentro de la extension con:

```text
Free JT7: Validar runtime
```

## Generar extension VS Code (.vsix)

```bash
npm install
npm run package
```

Esto genera un archivo `.vsix` en la raiz del repo.

En este repositorio el build de la extension y el runtime de OpenClaw pueden convivir con versiones distintas de Node:

- Node 20 para `npm run build:bundle` y `npm run package:local`
- Node 22 para `openclaw`

### Verificar e instalar

Después de crear el paquete puedes confirmar la instalación ejecutando
`code --list-extensions` y buscando `freejt7`.

Para instalar manualmente usa el menú de extensiones de VS Code o:

```bash
code --install-extension agente-freejt7-extension-funcional-4.2.4.vsix
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

En Linux o Windows tambien puedes abrir Copilot Chat y usar:

- `@freejt7 /doctor`
- `@freejt7 /install`
- `@freejt7 /route analiza este proyecto y aplica la solucion`

## Servicios fundamentales despues de instalar la extension

### Servidor MCP local

```bash
cd "servidor mpc free jt7"
npm install
npm run smoke
```

### Gateway OpenClaw

Free JT7 espera que `openclaw` exista en PATH. Si instalas OpenClaw en un runtime separado, deja un wrapper o binario accesible como `openclaw`.

Comandos utiles desde la raiz del repo:

```bash
python3 skills_manager.py gateway-bootstrap --project . --ide vscode --profile default
python3 skills_manager.py gateway-start --dry-run
python3 skills_manager.py gateway-status
```

## Linux y multi-IDE

La guia operativa completa para Linux y los IDEs soportados por el runtime esta en:

- `docs/06-RELEASE-4.2.4.md`
- `docs/07-INSTALACION-LINUX-MULTI-IDE.md`

## Comandos de la extension

- `Free JT7: Instalar en workspace actual`
- `Free JT7: Validar runtime`
- `Free JT7: Abrir documentacion`

### Wrappers OpenClaw
Si el binario `openclaw` se encuentra en el PATH o dentro de
`OPEN CLAW/node_modules/.bin/`, la extensión habilita comandos
adicionales que ejecutan directamente el CLI:

- `Free JT7: OpenClaw Gateway Status` – muestra salida de
  `openclaw gateway status`.
- `Free JT7: Run OpenClaw CLI` – solicita argumentos libres
  para enviarlos al comando `openclaw`.

Estos comandos son parte de la capa operativa del gateway. Si `openclaw`
no existe en PATH, la extension queda instalada pero el flujo completo de
gateway y canales no queda funcional.

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

Estos comandos facilitan el uso del CLI desde VS Code, pero el servidor no se
autogestiona por completo; sigue siendo responsabilidad del usuario validar el
estado del gateway y su configuracion local.
