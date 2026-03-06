# Instala Agente Free JT7 en un proyecto existente
#
# Uso:
#   .\add-free-jt7-agent.ps1 [-Path <ruta>] [-Ide <auto|all|vscode|cursor|kiro|antigravity|codex|claude-code|gemini-cli>] [-UpdateUserSettings] [-Force]
#
# Si no se especifica Path, se toma el directorio de trabajo actual.
# El script invoca el gestor de skills (skills_manager.py) y crea
# los enlaces/copias necesarios para que el workspace use el agente.

param(
    [string]$Path = ".",
    [ValidateSet("auto", "all", "vscode", "cursor", "kiro", "antigravity", "codex", "claude-code", "gemini-cli")]
    [string]$Ide = "all",
    [switch]$UpdateUserSettings,
    [switch]$Force
)

# Resolver rutas (crear destino si no existe)
if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}
$targetDir = (Resolve-Path -Path $Path -ErrorAction Stop).Path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$manager = Join-Path $scriptDir "skills_manager.py"

if (-not (Test-Path $manager)) {
    Write-Error "No se puede encontrar skills_manager.py en $scriptDir"
    exit 1
}

if (-not $PSBoundParameters.ContainsKey("UpdateUserSettings")) {
    $UpdateUserSettings = $true
}

Write-Host "[add-free-jt7-agent] instalando en: $targetDir"

# Construir comando
$python = "python"
# si existe venv local, preferirla
$venvPy = Join-Path $scriptDir ".venv\Scripts\python.exe"
if (Test-Path $venvPy) { $python = $venvPy }

$argsList = @($manager, "install", $targetDir, "--ide", $Ide)
if ($UpdateUserSettings) { $argsList += "--update-user-settings" }
if ($Force) { $argsList += "--force" }

Write-Host "ejecutando: $python $($argsList -join ' ')"
& $python @argsList

if ($LASTEXITCODE -eq 0) {
    Write-Host "[add-free-jt7-agent] OK agente ligado correctamente."
} else {
    Write-Error "[add-free-jt7-agent] ERROR durante la instalacion (codigo $LASTEXITCODE)."
}


