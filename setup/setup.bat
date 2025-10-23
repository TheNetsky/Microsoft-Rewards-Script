@echo off
setlocal
REM Wrapper to run setup via npm (Windows)
REM Navigates to project root and runs npm run setup

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

if not exist "%PROJECT_ROOT%\package.json" (
  echo [ERROR] package.json not found in project root.
  pause
  exit /b 1
)

echo Navigating to project root...
cd /d "%PROJECT_ROOT%"

echo Running setup script via npm...
call npm run setup
set EXITCODE=%ERRORLEVEL%
echo.
echo Setup finished with exit code %EXITCODE%.
echo Press Enter to close.
pause >NUL
exit /b %EXITCODE%