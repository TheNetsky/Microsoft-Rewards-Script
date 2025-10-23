@echo off
setlocal
REM Lightweight wrapper to run setup.mjs without prereq detection (Windows)
REM Assumes Node is already installed and available in PATH.

set SCRIPT_DIR=%~dp0
set SETUP_FILE=%SCRIPT_DIR%setup.mjs

if not exist "%SETUP_FILE%" (
  echo [ERROR] setup.mjs not found next to this batch file.
  pause
  exit /b 1
)

echo Running setup script...
node "%SETUP_FILE%"
set EXITCODE=%ERRORLEVEL%
echo.
echo Setup finished with exit code %EXITCODE%.
echo Press Enter to close.
pause >NUL
exit /b %EXITCODE%