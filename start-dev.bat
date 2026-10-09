@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
REM Run from PowerShell with .\start-dev.bat; use --check for a dry run.
set "CHECK_ONLY="
if /i "%~1"=="--check" set "CHECK_ONLY=1"

set "ROOT=%~dp0"
set "PYTHON=C:\Users\XH\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"

call :killport 8000
call :killport 5173
call :killport 5174

set "LANIP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R "IPv4.*192\.168"') do for /f "tokens=1" %%b in ("%%a") do set "LANIP=%%b"
if not defined LANIP (
  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do for /f "tokens=1" %%b in ("%%a") do set "LANIP=%%b"
)


if not defined CHECK_ONLY if not exist "%ROOT%.env" (
  echo [start-dev] .env missing, copying from .env.example ...
  copy "%ROOT%.env.example" "%ROOT%.env" >nul
)

echo [start-dev] checking backend deps ...
"%PYTHON%" -c "import uvicorn, fastapi"
if not defined CHECK_ONLY if errorlevel 1 "%PYTHON%" -m pip install -q -e "%ROOT%backend[dev]"
if errorlevel 1 (
  echo [start-dev] backend dependency installation failed.
  exit /b 1
)


where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [start-dev] npm.cmd not found. Install Node.js and reopen the terminal.
  exit /b 1
)
if defined CHECK_ONLY (
  echo [start-dev] checks passed; no services started or stopped.
  exit /b 0
)
if not exist "%ROOT%backend\logs" mkdir "%ROOT%backend\logs"

echo [start-dev] starting backend  -^> http://0.0.0.0:8000 (also reachable via LAN IP)
start "ErrorSet-Backend" /D "%ROOT%backend" cmd /k ""%PYTHON%" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > logs\backend.log 2>&1 & echo. & echo [ErrorSet-Backend] Process exited. See logs\backend.log for details. & pause"

echo [start-dev] starting frontend -^> http://localhost:5173
start "ErrorSet-Frontend" /D "%ROOT%frontend" cmd /k "call npm.cmd run dev & echo. & echo [ErrorSet-Frontend] Process exited. & pause"

echo [start-dev] starting admin    -^> http://localhost:5174
start "ErrorSet-Admin" /D "%ROOT%admin" cmd /k "call npm.cmd run dev & echo. & echo [ErrorSet-Admin] Process exited. & pause"

echo.
echo [start-dev] all launched. Open in browser:
echo   Frontend : http://localhost:5173
echo   Admin    : http://localhost:5174
echo   API docs : http://127.0.0.1:8000/docs
if defined LANIP (
  echo   LAN ^(phone/other PC^): http://%LANIP%:5173  /  http://%LANIP%:5174  /  http://%LANIP%:8000/docs
)
echo   (Ctrl+C in each window to stop that service)
echo.
pause
goto :eof

:killport
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /r /c:":%1 .*LISTENING"') do (
  echo [start-dev] port %1 is occupied by PID %%a.
  if not defined CHECK_ONLY taskkill /f /pid %%a >nul 2>&1
)
goto :eof
