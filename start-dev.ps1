# Windows PowerShell 5.1; run Setup-SmartRetail.bat once on a new machine.
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    # Internal mode used by the three visible service windows.
    [ValidateSet('ML', 'Backend', 'Frontend', 'Mailpit')]
    [string]$Service
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$LauncherPath = $PSCommandPath
$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$LocalDirectory = Join-Path $ProjectRoot '.local'
. (Join-Path $ProjectRoot 'scripts/windows-runtime.ps1')
$Services = @(
    @{ Name = 'ML'; Title = 'ML Service'; Directory = 'ml-service'; Port = 8000; Url = 'http://127.0.0.1:8000/health' },
    @{ Name = 'Backend'; Title = 'Backend'; Directory = 'backend'; Port = 3001; Url = 'http://127.0.0.1:3001/health' },
    @{ Name = 'Frontend'; Title = 'Frontend'; Directory = 'frontend'; Port = 3000; Url = 'http://127.0.0.1:3000' }
)
if (Test-Path -LiteralPath (Join-Path $LocalDirectory 'mailpit/mailpit.exe')) {
    $Services = @(@{ Name = 'Mailpit'; Title = 'Local Mail'; Directory = '.local/mailpit'; Port = 8025; Url = 'http://127.0.0.1:8025/api/v1/info' }) + $Services
}

function Require-Path([string]$RelativePath, [string]$Label, [string]$PathType = 'Leaf') {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $RelativePath) -PathType $PathType)) {
        throw "$Label not found: $RelativePath. Run Setup-SmartRetail.bat once, then retry this launcher."
    }
}

function Test-Listening([int]$Port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return @($listeners | Where-Object { $_.Port -eq $Port }).Count -gt 0
}

function Open-LaunchLock([string]$Name) {
    # Open handles, not leftover files, indicate an active launcher/service.
    $lockPath = Join-Path $LocalDirectory "launcher-$Name.lock"
    try {
        return [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch [System.IO.IOException] {
        return $null
    }
}

function Test-ServiceHealth($Entry) {
    try {
        $response = Invoke-WebRequest -Uri $Entry.Url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ne 200) { return $false }
        if ($Entry.Name -eq 'Frontend') { return $response.Content -match '<title>[^<]*RetailSense' }
        $body = $response.Content | ConvertFrom-Json
        if ($Entry.Name -eq 'ML') { return $body.status -eq 'ok' -and $body.service -eq 'ml-service' }
        if ($Entry.Name -eq 'Mailpit') {
            if ($body.Version -notmatch '^v\d+\.' -or $null -eq $body.RuntimeStats) { return $false }
            $client = [Net.Sockets.TcpClient]::new()
            try {
                if (-not $client.ConnectAsync('127.0.0.1', 1025).Wait(1000)) { return $false }
                $stream = $client.GetStream()
                $stream.ReadTimeout = 1000
                $buffer = New-Object byte[] 1024
                $length = $stream.Read($buffer, 0, $buffer.Length)
                return [Text.Encoding]::ASCII.GetString($buffer, 0, $length) -match '^220 .*Mailpit'
            } finally { $client.Dispose() }
        }
        return $body.status -eq 'ok'
    } catch { return $false }
}

function Start-ServiceConsole($Entry) {
    if (Test-Listening $Entry.Port) {
        Write-Host "[SKIP] $($Entry.Title) already has a listener on port $($Entry.Port); checking health."
        return
    }
    if ($Entry.Name -eq 'Mailpit' -and (Test-Listening 1025)) {
        throw 'SMTP port 1025 belongs to another process. It was left untouched.'
    }
    $probe = Open-LaunchLock $Entry.Name
    if ($null -eq $probe) {
        Write-Host "[SKIP] $($Entry.Title) already has a launcher window; waiting for readiness."
        return
    }
    $probe.Dispose()
    Write-Host "[START] $($Entry.Title)"
    # -File with a quoted path handles spaces, apostrophes and Unicode directories.
    $arguments = '-NoProfile -ExecutionPolicy Bypass -NoExit -File "{0}" -Service {1}' -f $LauncherPath, $Entry.Name
    Start-Process -FilePath $PowerShellExe -ArgumentList $arguments -WorkingDirectory (Join-Path $ProjectRoot $Entry.Directory) -WindowStyle Normal | Out-Null
}

function Start-ProjectPostgres {
    Start-ProjectDatabase $ProjectRoot
}

# Service consoles retain their own lock while npm/Python runs, even before a
# port is bound. Closing a console releases the handle; no PID-based killing.
if ($Service) {
    $serviceLock = $null
    try {
        $entry = $Services | Where-Object { $_.Name -eq $Service }
        $Host.UI.RawUI.WindowTitle = "Smart Retail - $($entry.Title)"
        Set-Location -LiteralPath (Join-Path $ProjectRoot $entry.Directory)
        $serviceLock = Open-LaunchLock $Service
        if ($null -eq $serviceLock -or (Test-Listening $entry.Port)) {
            Write-Host "[SKIP] $($entry.Title) is already running or starting. You may close this window."
            return
        }
        Write-Host "[INFO] Working directory: $((Get-Location).Path)"
        if ($Service -eq 'ML') {
            & (Join-Path $ProjectRoot 'ml-service\.venv\Scripts\python.exe') -m uvicorn app:app --host 127.0.0.1 --port 8000
        } elseif ($Service -eq 'Mailpit') {
            & (Join-Path $LocalDirectory 'mailpit/mailpit.exe') --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --allowed-hosts localhost,127.0.0.1 --database (Join-Path $LocalDirectory 'mailpit/mailpit.db') --disable-version-check --smtp-disable-rdns
        } else {
            Use-ProjectNode $ProjectRoot
            if ($Service -eq 'Backend') {
                $configuration = Read-ProjectEnvironment (Join-Path $ProjectRoot 'backend/.env')
                foreach ($key in $configuration.Keys) { [Environment]::SetEnvironmentVariable($key, $configuration[$key], 'Process') }
            } else {
                $env:NODE_ENV = $null
                $env:NEXT_PUBLIC_API_URL = $null
                $frontendEnv = Join-Path $ProjectRoot 'frontend/.env.local'
                if (Test-Path -LiteralPath $frontendEnv) {
                    $env:NEXT_PUBLIC_API_URL = (Read-ProjectEnvironment $frontendEnv).NEXT_PUBLIC_API_URL
                }
            }
            & npm.cmd run dev
        }
        if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] $($entry.Title) exited with code $LASTEXITCODE. Review the logs above." -ForegroundColor Red }
    } catch {
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        if ($null -ne $serviceLock) { $serviceLock.Dispose() }
    }
    return
}

$launchLock = $null
try {
    Write-Host "[INFO] Project root: $ProjectRoot"
    Require-Path 'backend' 'Backend directory' 'Container'
    Require-Path 'frontend' 'Frontend directory' 'Container'
    Require-Path 'ml-service' 'ML directory' 'Container'
    Require-Path '.local\postgresql\pgsql\bin\pg_ctl.exe' 'PostgreSQL control executable'
    Require-Path '.local\postgresql\pgsql\bin\pg_isready.exe' 'PostgreSQL readiness executable'
    Require-Path '.local\postgresql\data\PG_VERSION' 'Initialized PostgreSQL data directory'
    Require-Path 'ml-service\.venv\Scripts\python.exe' 'Python virtual environment'
    Require-Path 'backend\package.json' 'Backend package.json'
    Require-Path 'frontend\package.json' 'Frontend package.json'
    Require-Path 'backend\.env' 'Private backend configuration'
    Require-Path 'backend\node_modules\.bin\prisma.cmd' 'Installed Prisma dependency'
    Require-Path 'backend\node_modules\.bin\tsc-watch.cmd' 'Installed backend dependencies'
    Require-Path 'frontend\node_modules\.bin\next.cmd' 'Installed frontend dependencies'
    Use-ProjectNode $ProjectRoot
    $launchLock = Open-LaunchLock 'main'
    if ($null -eq $launchLock) {
        Write-Host '[SKIP] Another launcher is still starting this project. See its window.'
        exit 0
    }
    Start-ProjectPostgres
    foreach ($entry in $Services) { Start-ServiceConsole $entry }

    Write-Host '[WAIT] Checking service health for up to about 120 seconds...'
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    $pending = @($Services)
    do {
        $pending = @($pending | Where-Object {
            if (Test-ServiceHealth $_) { Write-Host "[OK] $($_.Title) is ready."; return $false }
            return $true
        })
        if ($pending.Count -gt 0) { Start-Sleep -Milliseconds 500 }
    } while ($pending.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($pending.Count -gt 0) {
        $names = ($pending | ForEach-Object { "$($_.Title) ($($_.Url))" }) -join ', '
        throw "Not ready: $names. Check the service windows, configured ports and backend/.env. An occupied port may belong to another application. No process was stopped."
    }
    Write-Host ''
    Write-Host '========================================'
    Write-Host 'SMART RETAIL READY'
    Write-Host '========================================'
    Write-Host 'Frontend : http://localhost:3000'
    Write-Host 'Backend  : http://localhost:3001/health'
    Write-Host 'ML       : http://localhost:8000'
    Write-Host "Database : PostgreSQL localhost:$(Get-ProjectDatabasePort $ProjectRoot)"
    if ($Services.Name -contains 'Mailpit') { Write-Host 'Local mail: http://localhost:8025 (no external email delivery)' }
    if (-not $NoBrowser) { Start-Process 'http://localhost:3000' | Out-Null }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $launchLock) { $launchLock.Dispose() }
}
