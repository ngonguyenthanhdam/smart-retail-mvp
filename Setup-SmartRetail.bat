@echo off
setlocal
if not exist "%~dp0setup.ps1" (
    echo [ERROR] setup.ps1 was not found. Extract or clone the entire repository first.
    pause
    exit /b 1
)
set "setupPowerShell=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "setupPowerShell=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%setupPowerShell%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set "setupExit=%ERRORLEVEL%"
echo.
if not "%setupExit%"=="0" echo [ERROR] Setup did not finish. Read the error above, fix it, and run this file again.
pause
exit /b %setupExit%
