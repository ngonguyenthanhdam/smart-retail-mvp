@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore-demo.ps1"
if errorlevel 1 (
  echo Demo restore did not complete. Existing database records were not replaced.
  pause
  exit /b 1
)
pause
