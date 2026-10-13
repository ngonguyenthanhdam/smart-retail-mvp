@echo off
setlocal
if not exist "%~dp0start-dev.ps1" (
    echo [ERROR] start-dev.ps1 was not found beside this launcher.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
set "launcherExit=%ERRORLEVEL%"
if not "%launcherExit%"=="0" (
    echo.
    echo [ERROR] Startup did not complete. Read the message above and the service windows.
    pause
)
exit /b %launcherExit%
