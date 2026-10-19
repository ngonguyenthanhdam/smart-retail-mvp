@echo off
setlocal
if not exist "%~dp0setup-ai.ps1" (
    echo [ERROR] setup-ai.ps1 was not found. Download the complete repository.
    pause
    exit /b 1
)
set "setupPowerShell=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "setupPowerShell=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%setupPowerShell%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-ai.ps1" %*
set "setupExit=%ERRORLEVEL%"
echo.
if not "%setupExit%"=="0" echo [ERROR] AI setup did not finish. Resolve the error and run this file again.
pause
exit /b %setupExit%
