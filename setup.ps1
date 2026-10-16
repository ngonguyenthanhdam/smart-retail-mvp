# First-time Windows setup. Never resets an existing database or account.
[CmdletBinding()]
param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = $PSScriptRoot
$LocalDirectory = Join-Path $ProjectRoot '.local'
. (Join-Path $ProjectRoot 'scripts/windows-runtime.ps1')
$Tools = Get-Content -LiteralPath (Join-Path $ProjectRoot 'scripts/windows-tools.json') -Raw | ConvertFrom-Json
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content, $Utf8)
}

function Protect-PrivateFile([string]$Path) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function New-PrivateSecret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

function Get-VerifiedDownload([string]$Name, [string]$Url, [string]$Sha256) {
    $cache = Join-Path $LocalDirectory 'downloads'
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    $path = Join-Path $cache $Name
    if ((Test-Path -LiteralPath $path) -and (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $Sha256) {
        Write-Host "[CACHE] $Name"
        return $path
    }
    $partial = "$path.partial"
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Write-Host "[DOWNLOAD] $Name (attempt $attempt/3)"
            Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing -TimeoutSec 1200
            if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) {
                throw "Checksum mismatch for $Name. The downloaded file will not be executed."
            }
            Move-Item -LiteralPath $partial -Destination $path -Force
            return $path
        } catch {
            if ($attempt -eq 3) { throw }
            Start-Sleep -Seconds 2
        }
    }
}

function Expand-ToolArchive([string]$Archive, [string]$Destination, [string]$Name) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $destinationRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
    $localRoot = [IO.Path]::GetFullPath($LocalDirectory).TrimEnd('\') + '\'
    if (-not $destinationRoot.StartsWith($localRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Tool extraction must stay under this project .local directory.'
    }
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            # pgAdmin/StackBuilder are not needed to run the project database.
            if ($Name -eq 'postgresql' -and $entry.FullName -notmatch '^pgsql/(bin/|lib/|share/|[^/]+$)') { continue }
            $target = [IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
            if (-not $target.StartsWith($destinationRoot, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Archive entry escaped its destination directory.'
            }
            if (-not $entry.Name) { continue }
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    } finally { $zip.Dispose() }
}

function Install-PortableTool([string]$Name) {
    $tool = $Tools.$Name
    $directory = Join-Path $ProjectRoot $tool.directory
    $executable = Join-Path $directory $tool.executable
    $pending = Join-Path $LocalDirectory "install-$Name.pending"
    if ((Test-Path -LiteralPath $executable) -and -not (Test-Path -LiteralPath $pending)) {
        Write-Host "[KEEP] Existing project $Name"
        return $executable
    }
    $archive = Get-VerifiedDownload "$Name-$($tool.version).zip" $tool.url $tool.sha256
    Write-Utf8 $pending $tool.sha256
    Write-Host "[EXTRACT] $Name $($tool.version)"
    Expand-ToolArchive $archive $directory $Name
    if (-not (Test-Path -LiteralPath $executable)) { throw "The $Name archive did not contain its required executable." }
    Remove-Item -LiteralPath $pending
    return $executable
}

function Ensure-VCRuntime {
    $ready = $true
    foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
        $path = Join-Path $env:SystemRoot "System32/$dll"
        if (-not (Test-Path -LiteralPath $path)) { $ready = $false; continue }
        $info = (Get-Item -LiteralPath $path).VersionInfo
        if ($info.FileMajorPart -lt 14 -or ($info.FileMajorPart -eq 14 -and $info.FileMinorPart -lt 50)) { $ready = $false }
    }
    if ($ready) { Write-Host '[OK] Microsoft Visual C++ runtime'; return }
    Write-Host '[INSTALL] Microsoft Visual C++ runtime. Windows may ask for administrator approval.'
    $installer = Join-Path $LocalDirectory 'downloads/vc_redist.x64.exe'
    New-Item -ItemType Directory -Path (Split-Path -Parent $installer) -Force | Out-Null
    Invoke-WebRequest 'https://aka.ms/vc14/vc_redist.x64.exe' -OutFile $installer -UseBasicParsing -TimeoutSec 600
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') {
        throw 'The Microsoft runtime installer signature is invalid. It was not executed.'
    }
    $process = Start-Process -FilePath $installer -ArgumentList '/install /passive /norestart' -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -eq 3010) { throw 'The Microsoft runtime requires a restart. Restart Windows, then rerun Setup-SmartRetail.bat.' }
    if ($process.ExitCode -notin @(0, 1638)) { throw "Microsoft runtime installation failed (exit $($process.ExitCode))." }
}

function Initialize-ProjectConfiguration {
    $envPath = Join-Path $ProjectRoot 'backend/.env'
    $statePath = Join-Path $LocalDirectory 'setup-state.json'
    $pgVersionPath = Join-Path $LocalDirectory 'postgresql/data/PG_VERSION'
    $state = $null
    if (Test-Path -LiteralPath $statePath) { $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
    if (-not $state) {
        if ((Test-Path -LiteralPath $envPath) -or (Test-Path -LiteralPath $pgVersionPath)) {
            if (-not ((Test-Path -LiteralPath $envPath) -and (Test-Path -LiteralPath $pgVersionPath))) {
                throw 'An existing backend/.env or database was found without its matching local database/configuration. Restore the matching files or use a fresh project folder. Nothing was overwritten.'
            }
            $state = [pscustomobject]@{ version = 1; managedDatabase = $false; port = (Get-ProjectDatabasePort $ProjectRoot); complete = $false }
        } else {
            $port = 5432
            while ($port -le 5442 -and (Test-ProjectPort $port)) { $port++ }
            if ($port -gt 5442) { throw 'No free PostgreSQL port between 5432 and 5442. Stop an unused local service and retry.' }
            $state = [pscustomobject]@{ version = 1; managedDatabase = $true; port = $port; complete = $false }
        }
        Write-Utf8 $statePath ($state | ConvertTo-Json)
    }
    if (-not (Test-Path -LiteralPath $envPath)) {
        if (-not $state.managedDatabase -or (Test-Path -LiteralPath $pgVersionPath)) {
            throw 'backend/.env is missing for an existing database. Restore it; setup will not replace its credentials.'
        }
        $password = New-PrivateSecret 24
        $adminPassword = New-PrivateSecret 18
        $values = @{
            DATABASE_URL = "postgresql://retailsense:${password}@localhost:$($state.port)/retailsense?schema=public"
            TEST_DATABASE_URL = "postgresql://retailsense:${password}@localhost:$($state.port)/retailsense_test?schema=public"
            JWT_SECRET = (New-PrivateSecret 48)
            INITIAL_ADMIN_USERNAME = 'admin'
            INITIAL_ADMIN_EMAIL = 'admin@retailsense.local'
            INITIAL_ADMIN_PASSWORD = $adminPassword
            INITIAL_ADMIN_FULL_NAME = 'Administrator'
        }
        $lines = foreach ($line in Get-Content -LiteralPath (Join-Path $ProjectRoot '.env.example')) {
            if ($line -match '^([A-Z_]+)=' -and $values.ContainsKey($Matches[1])) { "$($Matches[1])=$($values[$Matches[1]])" } else { $line }
        }
        Write-Utf8 $envPath (($lines -join "`r`n") + "`r`n")
        Protect-PrivateFile $envPath
        $loginPath = Join-Path $LocalDirectory 'first-login.txt'
        Write-Utf8 $loginPath "RetailSense local account`r`nWebsite: http://localhost:3000`r`nUsername: admin`r`nEmail: admin@retailsense.local`r`nInitial password: $adminPassword`r`n`r`nKeep this file private. The initial password is not reset by setup.`r`n"
        Protect-PrivateFile $loginPath
        Write-Host '[CREATE] Private backend configuration and .local/first-login.txt'
    } else { Write-Host '[KEEP] Existing backend/.env and account credentials' }
    $actualPort = Get-ProjectDatabasePort $ProjectRoot
    if ($state.port -ne $actualPort) { throw 'setup-state.json and backend/.env use different PostgreSQL ports. Existing settings were kept.' }
    $frontendEnv = Join-Path $ProjectRoot 'frontend/.env.local'
    if (-not (Test-Path -LiteralPath $frontendEnv)) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot 'frontend/.env.example') -Destination $frontendEnv
    }
    return $state
}

function Initialize-ProjectDatabase($State) {
    $pgRoot = Join-Path $LocalDirectory 'postgresql'
    $pgData = Join-Path $pgRoot 'data'
    $pgVersionPath = Join-Path $pgData 'PG_VERSION'
    if (-not (Test-Path -LiteralPath $pgVersionPath)) {
        if (-not $State.managedDatabase) { throw 'The existing PostgreSQL data directory is missing. Restore it before continuing.' }
        if ((Test-Path -LiteralPath $pgData) -and @(Get-ChildItem -LiteralPath $pgData -Force).Count -gt 0) {
            throw 'PostgreSQL data directory contains an incomplete initialization. It was preserved. Inspect it before retrying; setup never deletes database files.'
        }
        $passwordPath = Join-Path $pgRoot 'superuser.password'
        if (-not (Test-Path -LiteralPath $passwordPath)) {
            Write-Utf8 $passwordPath (New-PrivateSecret 32)
            Protect-PrivateFile $passwordPath
        }
        Invoke-ProjectCommand (Join-Path $pgRoot 'pgsql/bin/initdb.exe') @('-D', $pgData, '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', "--pwfile=$passwordPath") $ProjectRoot 'Initialize a new private PostgreSQL cluster'
    }
    if ((Get-Content -LiteralPath $pgVersionPath -Raw).Trim() -ne '17') { throw 'Existing database is not PostgreSQL 17. It was not upgraded or replaced.' }
    if ($State.managedDatabase) {
        # This separate include is safe to recreate after an interrupted initdb.
        Write-Utf8 (Join-Path $pgData 'retailsense.conf') "listen_addresses = 'localhost'`r`nport = $($State.port)`r`ntimezone = 'UTC'`r`n"
        $postgresConfig = Join-Path $pgData 'postgresql.conf'
        if (-not (Select-String -LiteralPath $postgresConfig -Pattern "^include_if_exists = 'retailsense.conf'$" -Quiet)) {
            [IO.File]::AppendAllText($postgresConfig, "`r`ninclude_if_exists = 'retailsense.conf'`r`n", $Utf8)
        }
    }
    Start-ProjectDatabase $ProjectRoot
}

function Install-NodeDependencies([string]$Name) {
    $directory = Join-Path $ProjectRoot $Name
    $fingerprint = (Get-FileHash -LiteralPath (Join-Path $directory 'package.json')).Hash +
        (Get-FileHash -LiteralPath (Join-Path $directory 'package-lock.json')).Hash
    $marker = Join-Path $LocalDirectory "setup-$Name.sha256"
    $sentinel = if ($Name -eq 'backend') { 'node_modules/.bin/tsc-watch.cmd' } else { 'node_modules/.bin/next.cmd' }
    if ((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $fingerprint -and
        (Test-Path -LiteralPath (Join-Path $directory $sentinel))) {
        Push-Location -LiteralPath $directory
        try { & npm.cmd ls --depth=0 *> $null; $valid = $LASTEXITCODE -eq 0 } finally { Pop-Location }
        if ($valid) { Write-Host "[KEEP] $Name dependencies match package.json and package-lock.json"; return }
    }
    Invoke-ProjectCommand 'npm.cmd' @('ci', '--include=dev', '--no-fund', '--no-audit') $directory "Install $Name dependencies"
    Write-Utf8 $marker $fingerprint
}

$locks = @()
$transcript = $false
try {
    if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or [Environment]::OSVersion.Version.Major -lt 10) {
        throw 'Use 64-bit Windows 10/11 on an Intel/AMD computer and run Setup-SmartRetail.bat.'
    }
    if ($ProjectRoot.StartsWith('\\')) { throw 'Extract the project to a local disk before running setup.' }
    foreach ($required in @('backend/package-lock.json', 'frontend/package-lock.json', 'ml-service/requirements-training.txt', '.env.example')) {
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $required))) { throw "Missing $required. Download/extract the complete repository." }
    }
    if ($CheckOnly) {
        Use-ProjectNode $ProjectRoot
        foreach ($required in @('backend/.env', 'backend/node_modules/.bin/prisma.cmd',
                'frontend/node_modules/.bin/next.cmd', 'ml-service/.venv/Scripts/python.exe', '.local/postgresql/data/PG_VERSION', '.local/mailpit/mailpit.exe')) {
            if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $required))) { throw "Missing $required. Run Setup-SmartRetail.bat." }
        }
        $null = Get-ProjectDatabasePort $ProjectRoot
        Write-Host '[OK] Installed prerequisites found. No files, services or databases were changed.'
        exit 0
    }
    New-Item -ItemType Directory -Path $LocalDirectory -Force | Out-Null
    foreach ($name in @('main', 'ML', 'Backend', 'Frontend', 'Mailpit')) {
        try {
            $locks += [IO.File]::Open((Join-Path $LocalDirectory "launcher-$name.lock"), 'OpenOrCreate', 'ReadWrite', 'None')
        } catch [IO.IOException] { throw "A launcher/setup or $name service window is open. Close its command with Ctrl+C, then retry setup." }
    }
    Start-Transcript -LiteralPath (Join-Path $LocalDirectory 'setup.log') -Append | Out-Null
    $transcript = $true
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host '[SETUP] RetailSense - tools, libraries, an empty database and one ADMIN'
    Write-Host '[INFO] Downloads require Internet access. Existing data and passwords are preserved.'
    $state = Initialize-ProjectConfiguration
    # Prevent inherited shell variables from redirecting migrations to another database.
    $configuration = Read-ProjectEnvironment (Join-Path $ProjectRoot 'backend/.env')
    $env:DATABASE_URL = $configuration.DATABASE_URL
    $env:TEST_DATABASE_URL = $configuration.TEST_DATABASE_URL
    # Next chooses development for dev and production for build. Do not carry
    # the backend's HTTP/cookie NODE_ENV into a frontend production build.
    $env:NODE_ENV = $null
    $frontendConfiguration = Read-ProjectEnvironment (Join-Path $ProjectRoot 'frontend/.env.local')
    $env:NEXT_PUBLIC_API_URL = $frontendConfiguration.NEXT_PUBLIC_API_URL
    Ensure-VCRuntime
    $null = Install-PortableTool 'node'
    Use-ProjectNode $ProjectRoot
    $python = Install-PortableTool 'python'
    $null = Install-PortableTool 'postgresql'
    $null = Install-PortableTool 'mailpit'
    Install-NodeDependencies 'backend'
    Install-NodeDependencies 'frontend'
    $mlDirectory = Join-Path $ProjectRoot 'ml-service'
    $venv = Join-Path $mlDirectory '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $venv)) {
        Invoke-ProjectCommand $python @('-m', 'venv', (Join-Path $mlDirectory '.venv')) $mlDirectory 'Create Python virtual environment'
    }
    Invoke-ProjectCommand $venv @('-c', "import sys,struct; assert sys.version_info[:2] == (3,11) and struct.calcsize('P') == 8, 'Python 3.11 x64 required'") $mlDirectory 'Verify Python version'
    Invoke-ProjectCommand $venv @('-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', '-r', 'requirements-training.txt') $mlDirectory 'Install runtime and offline-training Python dependencies'
    Invoke-ProjectCommand $venv @('-m', 'pip', 'check') $mlDirectory 'Check Python dependency compatibility'
    Invoke-ProjectCommand $venv @('-c', "from src.quantity_model import ModelRegistry; ModelRegistry().get(); from src.prediction import load_model; from pathlib import Path; load_model(Path('models')); print('Model artifacts loaded')") $mlDirectory 'Verify included forecast artifacts'
    Initialize-ProjectDatabase $state
    $databaseHelper = Join-Path $ProjectRoot 'scripts/setup-database.cjs'
    if ($state.managedDatabase) { Invoke-ProjectCommand 'node.exe' @($databaseHelper, 'provision') $ProjectRoot 'Create restricted application role and databases if absent' }
    $backendDirectory = Join-Path $ProjectRoot 'backend'
    Invoke-ProjectCommand 'npm.cmd' @('run', 'prisma:migrate') $backendDirectory 'Apply pending database migrations'
    Invoke-ProjectCommand 'npm.cmd' @('run', 'build') $backendDirectory 'Build backend and generate Prisma client'
    Invoke-ProjectCommand 'node.exe' @($databaseHelper, 'bootstrap') $ProjectRoot 'Create initial ADMIN only if none exists'
    Invoke-ProjectCommand 'npm.cmd' @('run', 'build') (Join-Path $ProjectRoot 'frontend') 'Build frontend'
    $state.complete = $true
    Write-Utf8 (Join-Path $LocalDirectory 'setup-state.json') ($state | ConvertTo-Json)
    Write-Host ''
    Write-Host '========================================'
    Write-Host 'SMART RETAIL SETUP COMPLETE'
    Write-Host '========================================'
    Write-Host 'Next: double-click Start-SmartRetail.bat to open http://localhost:3000'
    Write-Host 'First login: .local/first-login.txt (new installations only). Keep it private.'
    Write-Host 'Only roles and an ADMIN are seeded; no stores, products or sales are added.'
    Write-Host 'You do not need to run setup for daily use. Rerunning preserves existing data/passwords.'
    Write-Host 'Log: .local/setup.log'
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($transcript) { Stop-Transcript | Out-Null }
    foreach ($lock in $locks) { $lock.Dispose() }
}
