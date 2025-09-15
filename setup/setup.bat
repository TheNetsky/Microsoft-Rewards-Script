@echo off
setlocal ENABLEDELAYEDEXPANSION
REM Wrapper to run the unified Node setup script (setup.mjs) with prerequisite checks

echo === Prerequisite Check ===
where node >NUL 2>&1
if errorlevel 1 (
  echo [WARN] Node.js not detected in PATH.
  echo   Install: Open your browser, search for "Node.js", download the LTS Windows x64 installer and run it.
) else (
  for /f "delims=" %%v in ('node -v 2^>NUL') do set NODE_VERSION=%%v
  echo Node detected: !NODE_VERSION!
)

where git >NUL 2>&1
if errorlevel 1 (
  echo [WARN] Git not detected in PATH.
  echo   Install: Search "Git" (official git-scm site), download Windows 64-bit installer, accept defaults.
) else (
  for /f "delims=" %%g in ('git --version 2^>NUL') do set GIT_VERSION=%%g
  echo Git detected: !GIT_VERSION!
)

set "CONTINUE="
if not defined NODE_VERSION if not defined GIT_VERSION (
  echo.
  echo Neither Node nor Git were positively detected. They still might be installed.
)

if not defined NODE_VERSION (
  echo.
  set /p CONTINUE=Continue anyway? (yes/no) : 
  if /I not "!CONTINUE!"=="yes" if /I not "!CONTINUE!"=="y" (
    echo Aborting. Please install prerequisites and re-run.
    pause
    exit /b 1
  )
)

set SCRIPT_DIR=%~dp0
set SETUP_FILE=%SCRIPT_DIR%setup.mjs

if not exist "%SETUP_FILE%" (
  echo [ERROR] setup.mjs not found next to this batch file.
  pause
  exit /b 1
)

echo.
echo === Running setup script ===
node "%SETUP_FILE%"
set EXITCODE=%ERRORLEVEL%
echo.
echo Setup finished with exit code %EXITCODE%.
echo (This window will stay open so you can read any messages.)
pause
exit /b %EXITCODE%