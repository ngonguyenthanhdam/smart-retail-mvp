# Optional one-time local chatbot setup for Windows 10 22H2 / Windows 11 x64.
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = $PSScriptRoot
$settings = Get-Content -LiteralPath (Join-Path $ProjectRoot 'scripts/ai-tools.json') -Raw | ConvertFrom-Json
. (Join-Path $ProjectRoot 'scripts/ollama-runtime.ps1')
$lock = $null
try {
    if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess -or [Environment]::OSVersion.Version.Build -lt 19045) {
        throw 'Ollama requires Windows 10 22H2 or Windows 11, using 64-bit PowerShell.'
    }
    if ($CheckOnly) {
        if (-not (Test-ProjectOllama)) { throw 'Ollama is not running. Run Setup-AI.bat or Start-SmartRetail.bat.' }
        $models = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
        if (-not @($models.models | Where-Object { $_.name -eq $settings.model }).Count) { throw 'Qwen3 4B is not installed. Run Setup-AI.bat.' }
        Write-Host '[OK] Ollama and qwen3:4b-instruct-2507-q4_K_M are available. No files or models were changed.'
        exit 0
    }
    $localRoot = Join-Path $ProjectRoot '.local'
    New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
    $lock = [IO.File]::Open((Join-Path $localRoot 'setup-ai.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    if (-not (Test-ProjectOllama)) {
        $directory = Join-Path $ProjectRoot $settings.directory
        $executable = Join-Path $directory 'ollama.exe'
        $pending = Join-Path $localRoot 'install-ollama.pending'
        if (-not (Test-Path -LiteralPath $executable) -or (Test-Path -LiteralPath $pending)) {
            $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($ProjectRoot))
            if ($drive.AvailableFreeSpace -lt 10GB) { throw 'Keep at least 10 GB free for the Ollama archive, binaries and Qwen3 4B.' }
            $cache = Join-Path $localRoot 'downloads'
            New-Item -ItemType Directory -Path $cache -Force | Out-Null
            $archive = Join-Path $cache "ollama-$($settings.version)-windows-amd64.zip"
            if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $settings.sha256) {
                $partial = "$archive.partial"
                Write-Host '[DOWNLOAD] Verified Ollama Windows archive (~1.5 GB). An interrupted download can be resumed.'
                if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
                    & curl.exe --fail --location --retry 3 --connect-timeout 30 --max-time 7200 --continue-at - --output $partial $settings.url
                    if ($LASTEXITCODE -ne 0) { throw 'Ollama download failed. Rerun Setup-AI.bat to resume.' }
                } else { Invoke-WebRequest -Uri $settings.url -OutFile $partial -UseBasicParsing -TimeoutSec 7200 }
                if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $settings.sha256) {
                    Remove-Item -LiteralPath $partial
                    throw 'Ollama checksum mismatch. The file was rejected; run setup again.'
                }
                Move-Item -LiteralPath $partial -Destination $archive -Force
            }
            Set-Content -LiteralPath $pending -Value $settings.version -Encoding ASCII
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $destinationRoot = [IO.Path]::GetFullPath($directory).TrimEnd('\') + '\'
            if (-not $destinationRoot.StartsWith(([IO.Path]::GetFullPath($localRoot).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe installation path.' }
            Write-Host '[EXTRACT] Ollama into the project .local directory.'
            $zip = [IO.Compression.ZipFile]::OpenRead($archive)
            try {
                foreach ($entry in $zip.Entries) {
                    $target = [IO.Path]::GetFullPath((Join-Path $directory $entry.FullName))
                    if (-not $target.StartsWith($destinationRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive entry.' }
                    if (-not $entry.Name) { continue }
                    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
                }
            } finally { $zip.Dispose() }
            if (-not (Test-Path -LiteralPath $executable)) { throw 'Ollama executable missing from archive.' }
            Remove-Item -LiteralPath $pending
        }
        if (-not (Start-ProjectOllama $ProjectRoot)) { throw 'Ollama could not be started.' }
    }
    $tags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
    if (-not @($tags.models | Where-Object { $_.name -eq $settings.model }).Count) {
        Write-Host '[MODEL] Downloading qwen3:4b-instruct-2507-q4_K_M (~2.5 GB). This can take several minutes; rerun after an interrupted connection.'
        $body = @{ model = $settings.model; stream = $false } | ConvertTo-Json
        $result = Invoke-RestMethod 'http://127.0.0.1:11434/api/pull' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 7200
        if ($result.status -ne 'success') { throw 'Ollama did not confirm model download.' }
    }
    Write-Host '[OK] Ollama + qwen3:4b-instruct-2507-q4_K_M installed. Start the project normally and open AI Center.'
    Write-Host '[INFO] Existing database, forecasting model and business data were not modified.'
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally { if ($null -ne $lock) { $lock.Dispose() } }
