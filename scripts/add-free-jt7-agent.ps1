# Instala Agente Free JT7 en un proyecto existente
# (ubicado ahora en scripts/ para mantener todos los helpers juntos)
#
# NOTE: esta variante es funcionalmente equivalente a setup-project.ps1 y
# está considerada <Deprecated>; prefiere `scripts\setup-project.ps1` para
# nuevas instalaciones.
#
# Uso:
#   .\scripts\add-free-jt7-agent.ps1 [-Path <ruta>] [-Ide <auto|all|vscode|cursor|kiro|antigravity|codex|claude-code|gemini-cli>] [-UpdateUserSettings] [-Force]
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
$repoRoot = Split-Path -Parent $scriptDir
$manager = Join-Path $repoRoot "skills_manager.py"

if (-not (Test-Path $manager)) {
    Write-Error "No se puede encontrar skills_manager.py en $repoRoot"
    exit 1
}

if (-not $PSBoundParameters.ContainsKey("UpdateUserSettings")) {
    $UpdateUserSettings = $true
}

Write-Host "[add-free-jt7-agent] instalando en: $targetDir"

function Resolve-Python([string]$RepoRoot) {
    $candidates = @(
        (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
        "python",
        "py -3"
    )
    foreach ($candidate in $candidates) {
        try {
            if ($candidate -like "* *") {
                $parts = $candidate.Split(" ", 2)
                & $parts[0] $parts[1] -c "import sys" *> $null
            } else {
                if ((Test-Path $candidate) -or ($candidate -eq "python")) {
                    & $candidate -c "import sys" *> $null
                } else {
                    continue
                }
            }
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        } catch {
        }
    }
    return "python"
}

# Construir comando
$python = Resolve-Python $repoRoot

$argsList = @($manager, "install", $targetDir, "--ide", $Ide)
if ($UpdateUserSettings) { $argsList += "--update-user-settings" }
if ($Force) { $argsList += "--force" }

Write-Host "ejecutando: $python $($argsList -join ' ')"
if ($python -eq "py -3") {
    & py -3 @argsList
} else {
    & $python @argsList
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "[add-free-jt7-agent] OK agente ligado correctamente."
} else {
    Write-Error "[add-free-jt7-agent] ERROR durante la instalacion (codigo $LASTEXITCODE)."
}
