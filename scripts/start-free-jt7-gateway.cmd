@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"

set "OPENCLAW_CONFIG_PATH=%PROJECT_ROOT%\.openclaw\openclaw.json"
set "OPENCLAW_STATE_DIR=%PROJECT_ROOT%\.openclaw\state"
if not exist "%OPENCLAW_STATE_DIR%" mkdir "%OPENCLAW_STATE_DIR%" >nul 2>&1

set "OPENCLAW_ENTRY=%PROJECT_ROOT%\OPEN CLAW\openclaw.mjs"
if not exist "%OPENCLAW_ENTRY%" (
  echo [free-jt7-gateway] ERROR: no existe "%OPENCLAW_ENTRY%"
  exit /b 1
)

for /f "delims=" %%N in ('where node 2^>nul') do (
  set "NODE_EXE=%%N"
  goto :node_found
)

echo [free-jt7-gateway] ERROR: Node.js no encontrado en PATH.
exit /b 1

:node_found
start "" /min "%NODE_EXE%" "%OPENCLAW_ENTRY%" gateway --port 18789
endlocal
