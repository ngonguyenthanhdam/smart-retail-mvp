# Shared by first-time setup and daily startup. Windows PowerShell 5.1.
function Read-ProjectEnvironment([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                    ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            } else { $value = ($value -split '\s+#', 2)[0].Trim() }
            $values[$Matches[1]] = $value
        }
    }
    return $values
}

function Use-ProjectNode([string]$Root) {
    $manifest = Get-Content -LiteralPath (Join-Path $Root 'scripts/windows-tools.json') -Raw | ConvertFrom-Json
    $node = Join-Path (Join-Path $Root $manifest.node.directory) $manifest.node.executable
    if (Test-Path -LiteralPath $node -PathType Leaf) {
        $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Node.js/npm are missing. Run Setup-SmartRetail.bat once.'
    }
    $versionText = & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v22\.(\d+)\.' -or [int]$Matches[1] -lt 13) {
        throw 'This project requires Node.js 22.13+ within 22.x. Run Setup-SmartRetail.bat.'
    }
}

function Get-ProjectDatabasePort([string]$Root) {
    $configuration = Read-ProjectEnvironment (Join-Path $Root 'backend/.env')
    try { $uri = [uri]$configuration.DATABASE_URL } catch { throw 'Invalid DATABASE_URL in backend/.env.' }
    if ($null -eq $uri -or $uri.Scheme -notin @('postgres', 'postgresql') -or
        $uri.Host -notin @('localhost', '127.0.0.1', '[::1]')) {
        throw 'The Windows launcher requires a project-local PostgreSQL DATABASE_URL.'
    }
    if ($uri.Port -eq -1) { return 5432 }
    if ($uri.Port -lt 1 -or $uri.Port -gt 65535) { throw 'Invalid PostgreSQL port in backend/.env.' }
    return $uri.Port
}

function Test-ProjectPort([int]$Port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return @($listeners | Where-Object { $_.Port -eq $Port }).Count -gt 0
}

function Start-ProjectDatabase([string]$Root) {
    $pgBin = Join-Path $Root '.local/postgresql/pgsql/bin'
    $pgCtl = Join-Path $pgBin 'pg_ctl.exe'
    $pgData = Join-Path $Root '.local/postgresql/data'
    $port = Get-ProjectDatabasePort $Root
    & $pgCtl -D $pgData status | Out-Host
    $status = $LASTEXITCODE
    if ($status -eq 0) {
        Write-Host '[OK] Project PostgreSQL is already running.'
    } elseif ($status -eq 3) {
        if (Test-ProjectPort $port) { throw "Port $port is occupied by another PostgreSQL/process. It was left untouched." }
        Write-Host "[START] Project PostgreSQL on port $port"
        $pgLog = Join-Path $Root '.local/postgresql/runtime.log'
        $arguments = '-D "{0}" -l "{1}" -w -t 60 start' -f $pgData, $pgLog
        $process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(60000) -or $process.ExitCode -ne 0) {
            throw 'PostgreSQL startup failed. Check .local/postgresql/runtime.log; no existing process was stopped.'
        }
    } else { throw "Cannot check project PostgreSQL (pg_ctl exit $status)." }
    $postmaster = @(Get-Content -LiteralPath (Join-Path $pgData 'postmaster.pid'))
    if ($postmaster.Count -lt 4 -or $postmaster[3].Trim() -ne [string]$port) {
        throw 'Project PostgreSQL port differs from backend/.env. No configuration was changed.'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        & (Join-Path $pgBin 'pg_isready.exe') -h localhost -p $port -t 3 | Out-Host
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Project PostgreSQL is not ready. Check .local/postgresql/runtime.log.'
}

function Invoke-ProjectCommand([string]$Executable, [string[]]$Arguments, [string]$Directory, [string]$Label) {
    Write-Host "[RUN] $Label"
    Push-Location -LiteralPath $Directory
    try {
        & $Executable @Arguments | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE). Fix the error above and rerun Setup-SmartRetail.bat." }
    } finally { Pop-Location }
}
