# simple tests for wrapper scripts and CLI helper
$ErrorActionPreference = 'Stop'

Write-Host '[test] running openclaw-start.cmd --version'
try {
    & .\openclaw-start.cmd --version
} catch {
    Write-Host "[test] openclaw-start.cmd failed: $_"
}

# test runOpenClaw via node
Write-Host '[test] running runOpenClaw helper from extension.js'
$node = 'node'
# ensure working directory is workspace root where extension.js resides
$cwd = Get-Location
Push-Location $PSScriptRoot\..\
$code = @"
const {runOpenClaw}=require('./extension.js');
(async()=>{
  await runOpenClaw(['--version'],{
    append:console.log,appendLine:console.log
  });
})();
"@

try {
    & $node -e $code
} catch {
    Write-Host "[test] node helper failed: $_"
}
Pop-Location

Write-Host '[test] done'