# Optional project-local Ollama. No machine-wide environment or service changes.
function Test-ProjectOllama {
    try {
        $version = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 3
        return $version.version -match '^\d+\.\d+\.'
    } catch { return $false }
}

function Start-ProjectOllama([string]$Root) {
    if (Test-ProjectOllama) { Write-Host '[OK] Existing local Ollama is available.'; return $true }
    $settings = Get-Content -LiteralPath (Join-Path $Root 'scripts/ai-tools.json') -Raw | ConvertFrom-Json
    $binary = Join-Path (Join-Path $Root $settings.directory) 'ollama.exe'
    if (-not (Test-Path -LiteralPath $binary) -or (Test-Path -LiteralPath (Join-Path $Root '.local/install-ollama.pending'))) {
        Write-Host '[OPTIONAL] AI chat is offline. Run Setup-AI.bat once to install Ollama.'
        return $false
    }
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    if (@($listeners | Where-Object { $_.Port -eq 11434 }).Count) { throw 'Port 11434 belongs to an unrecognized service; it was left untouched.' }
    $saved = @{}
    $variables = @{
        OLLAMA_HOST = '127.0.0.1:11434'; OLLAMA_MODELS = (Join-Path $Root '.local/ollama-models')
        OLLAMA_NUM_PARALLEL = '1'; OLLAMA_MAX_LOADED_MODELS = '1'; OLLAMA_CONTEXT_LENGTH = '4096'
        OLLAMA_KEEP_ALIVE = '5m'; OLLAMA_NO_CLOUD = '1'
    }
    foreach ($key in $variables.Keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, $variables[$key], 'Process') }
    try {
        $logs = Join-Path $Root '.local/ollama-logs'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
        Start-Process -FilePath $binary -ArgumentList 'serve' -WorkingDirectory (Split-Path -Parent $binary) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$stamp.out.log") -RedirectStandardError (Join-Path $logs "$stamp.err.log") | Out-Null
    } finally { foreach ($key in $variables.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') } }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-ProjectOllama) { Write-Host '[OK] Project Ollama is ready on 127.0.0.1:11434.'; return $true }
        Start-Sleep -Milliseconds 500
    }
    throw 'Ollama did not start. Check .local/ollama-logs. Core retail features remain available.'
}
