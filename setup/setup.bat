@echo off
setlocal
REM Wrapper to run the unified Node setup script (setup.mjs)

where node >NUL 2>&1 || (
  echo [ERROR] Node.js not found in PATH. Install Node.js first.
  pause
  exit /b 1
)

set SCRIPT_DIR=%~dp0
set SETUP_FILE=%SCRIPT_DIR%setup.mjs

if not exist "%SETUP_FILE%" (
  echo [ERROR] setup.mjs not found next to this batch file.
  pause
  exit /b 1
)

REM Use node to execute the ES module script
node "%SETUP_FILE%"
set EXITCODE=%ERRORLEVEL%
echo.
echo Setup finished with exit code %EXITCODE%.
echo (This window will stay open so you can read any messages.)
pause
exit /b %EXITCODE%