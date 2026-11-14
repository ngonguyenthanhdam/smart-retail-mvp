$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'windows-runtime.ps1')
try {
    Use-ProjectNode $projectRoot
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'backend/.env'))) {
        throw 'Run Setup-SmartRetail.bat first to create a private configuration and database.'
    }
    Start-ProjectDatabase $projectRoot
    Push-Location -LiteralPath (Join-Path $projectRoot 'backend')
    try {
        & npm.cmd run demo:restore
        if ($LASTEXITCODE -ne 0) { throw 'Demo restore refused or failed. See the message above.' }
    }
    finally { Pop-Location }
    Write-Host 'DEMO RESTORE COMPLETE. Start-SmartRetail.bat starts the services.'
}
catch {
    Write-Host $_.Exception.Message
    exit 1
}
