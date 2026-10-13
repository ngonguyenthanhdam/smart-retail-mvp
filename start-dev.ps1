# Windows PowerShell 5.1; uses only the development tools already installed.
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    # Internal mode used by the three visible service windows.
    [ValidateSet('ML', 'Backend', 'Frontend')]
    [string]$Service
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$LauncherPath = $PSCommandPath
$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$LocalDirectory = Join-Path $ProjectRoot '.local'
$Services = @(
    @{ Name = 'ML'; Title = 'ML Service'; Directory = 'ml-service'; Port = 8000; Url = 'http://127.0.0.1:8000/health' },
    @{ Name = 'Backend'; Title = 'Backend'; Directory = 'backend'; Port = 3001; Url = 'http://127.0.0.1:3001/health' },
    @{ Name = 'Frontend'; Title = 'Frontend'; Directory = 'frontend'; Port = 3000; Url = 'http://127.0.0.1:3000' }
)

function Require-Path([string]$RelativePath, [string]$Label, [string]$PathType = 'Leaf') {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $RelativePath) -PathType $PathType)) {
        throw "$Label not found: $RelativePath. Follow README setup; the launcher does not install or seed anything."
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
        return $body.status -eq 'ok'
    } catch { return $false }
}

function Start-ServiceConsole($Entry) {
    if (Test-Listening $Entry.Port) {
        Write-Host "[SKIP] $($Entry.Title) already has a listener on port $($Entry.Port); checking health."
        return
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
    $pgCtl = Join-Path $ProjectRoot '.local\postgresql\pgsql\bin\pg_ctl.exe'
    $pgReady = Join-Path $ProjectRoot '.local\postgresql\pgsql\bin\pg_isready.exe'
    $pgData = Join-Path $ProjectRoot '.local\postgresql\data'
    & $pgCtl -D $pgData status | Out-Host
    $status = $LASTEXITCODE
    if ($status -eq 0) {
        Write-Host '[OK] PostgreSQL for this project is already running.'
    } elseif ($status -eq 3) {
        if (Test-Listening 5432) {
            throw 'Port 5432 is occupied, but this project PostgreSQL is not running. The existing process was left untouched.'
        }
        Write-Host '[START] PostgreSQL in the background'
        $pgLog = Join-Path $ProjectRoot '.local\postgresql\runtime.log'
        $arguments = '-D "{0}" -l "{1}" -w -t 60 start' -f $pgData, $pgLog
        $process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
        # Wait only for pg_ctl, not the background postgres descendants.
        if (-not $process.WaitForExit(60000)) {
            throw 'PostgreSQL startup timed out. Check .local\postgresql\runtime.log; no process was stopped.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'PostgreSQL could not start. Check .local\postgresql\runtime.log and file permissions.'
        }
    } else {
        throw "Cannot determine project PostgreSQL status (pg_ctl exit $status). Check its data directory and permissions."
    }
    $pidFile = Join-Path $pgData 'postmaster.pid'
    $postmaster = @(Get-Content -LiteralPath $pidFile)
    if ($postmaster.Count -lt 4 -or $postmaster[3].Trim() -ne '5432') {
        throw 'The project PostgreSQL must listen on port 5432. No configuration was changed.'
    }
    $readyDeadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        & $pgReady -h localhost -p 5432 -t 3 | Out-Host
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $readyDeadline)
    throw 'PostgreSQL is not accepting connections on localhost:5432. Check .local\postgresql\runtime.log.'
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
        } else {
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
    foreach ($command in @('node.exe', 'npm.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command not found on PATH. Follow README prerequisites." }
    }
    $launchLock = Open-LaunchLock 'main'
    if ($null -eq $launchLock) {
        Write-Host '[SKIP] Another launcher is still starting this project. See its window.'
        exit 0
    }
    Start-ProjectPostgres
    foreach ($entry in $Services) { Start-ServiceConsole $entry }

    Write-Host '[WAIT] Checking service health for up to about 60 seconds...'
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
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
    Write-Host 'Database : PostgreSQL localhost:5432'
    if (-not $NoBrowser) { Start-Process 'http://localhost:3000' | Out-Null }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $launchLock) { $launchLock.Dispose() }
}
