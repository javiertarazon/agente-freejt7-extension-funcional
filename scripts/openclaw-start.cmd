@echo off
REM helper script to launch OpenClaw gateway from workspace (binary or mjs)
SETLOCAL
set WORKSPACE=%~dp0..\

rem prefer packaged CLI in workspace
set BIN=
if exist "%WORKSPACE%OPEN CLAW\node_modules\.bin\openclaw" (
  set BIN="%WORKSPACE%OPEN CLAW\node_modules\.bin\openclaw"
)

rem if we don't have a binary, try the entry script
if not defined BIN (
  set "OPENCLAW_ENTRY=%WORKSPACE%OPEN CLAW\openclaw.mjs"
  if exist "%OPENCLAW_ENTRY%" (
    for /f "delims=" %%N in ('where node 2^>nul') do (
      set "NODE_EXE=%%N"
      goto :node_found
    )
    echo [free-jt7-gateway] ERROR: Node.js no encontrado en PATH.
    exit /b 1
  ) else (
    rem nothing to run
  )
)

if defined BIN (
  %BIN% gateway --port 18789 %*
  goto :eof
)

:node_found
start "" /min "%NODE_EXE%" "%OPENCLAW_ENTRY%" gateway --port 18789 %*
endlocal
