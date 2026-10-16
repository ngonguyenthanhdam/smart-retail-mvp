# Run with Windows PowerShell 5.1. Uses isolated, ignored fixture directories.
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $sourceRoot 'setup.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Setup syntax is invalid.' }
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
. (Join-Path $PSScriptRoot 'windows-runtime.ps1')
$Utf8 = New-Object Text.UTF8Encoding($false)
$fixtureRoot = Join-Path $sourceRoot ('.test-artifacts/setup-unit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$checks = 0
function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
    Write-Host "PASS: $Message"
}
function New-Fixture([string]$Name) {
    $script:ProjectRoot = Join-Path $fixtureRoot $Name
    $script:LocalDirectory = Join-Path $ProjectRoot '.local'
    foreach ($directory in @('.local', 'backend', 'frontend')) { New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $directory) -Force | Out-Null }
    Copy-Item -LiteralPath (Join-Path $sourceRoot '.env.example') -Destination (Join-Path $ProjectRoot '.env.example')
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'frontend/.env.example') -Destination (Join-Path $ProjectRoot 'frontend/.env.example')
}

New-Fixture "new install with space and apostrophe's"
# Hold the default database port without running any database process.
function Test-ProjectPort([int]$Port) { return $Port -eq 5432 }
$state = Initialize-ProjectConfiguration
$envPath = Join-Path $ProjectRoot 'backend/.env'
$envBefore = [IO.File]::ReadAllBytes($envPath)
$config = Read-ProjectEnvironment $envPath
Assert ($state.port -eq 5433 -and (Get-ProjectDatabasePort $ProjectRoot) -eq 5433) 'Fresh setup avoids an occupied 5432'
Assert ($config.INITIAL_ADMIN_USERNAME -eq 'admin' -and $config.INITIAL_ADMIN_PASSWORD.Length -ge 24 -and $config.JWT_SECRET.Length -ge 64) 'Fresh setup generates private ADMIN/database/JWT credentials'
$null = Initialize-ProjectConfiguration
Assert ([Convert]::ToBase64String($envBefore) -eq [Convert]::ToBase64String([IO.File]::ReadAllBytes($envPath))) 'Retry preserves existing configuration and passwords byte-for-byte'
Assert ((Get-Acl -LiteralPath $envPath).AreAccessRulesProtected) 'Private credentials do not inherit broad folder permissions'
Write-Utf8 (Join-Path $ProjectRoot 'backend/parser.env') "DATABASE_URL='postgresql://user:p%23word@localhost:5439/db'`r`nLABEL=`"text # kept`"`r`nPORT=3001 # comment`r`n"
$parsed = Read-ProjectEnvironment (Join-Path $ProjectRoot 'backend/parser.env')
Assert ($parsed.LABEL -eq 'text # kept' -and $parsed.PORT -eq '3001' -and $parsed.DATABASE_URL.EndsWith('/db')) 'Environment reader preserves quotes and encoded passwords'

New-Fixture 'existing env without database'
Write-Utf8 (Join-Path $ProjectRoot 'backend/.env') 'DATABASE_URL=postgresql://keep:secret@localhost:5432/keep'
$blocked = $false
try { $null = Initialize-ProjectConfiguration } catch { $blocked = $_.Exception.Message -like '*Nothing was overwritten*' }
Assert $blocked 'Existing configuration without its database is rejected instead of replaced'
Assert ((Get-Content -LiteralPath (Join-Path $ProjectRoot 'backend/.env') -Raw) -eq 'DATABASE_URL=postgresql://keep:secret@localhost:5432/keep') 'Rejected setup leaves existing credentials intact'

New-Fixture 'existing database without env'
New-Item -ItemType Directory -Path (Join-Path $LocalDirectory 'postgresql/data') -Force | Out-Null
Write-Utf8 (Join-Path $LocalDirectory 'postgresql/data/PG_VERSION') '17'
$blocked = $false
try { $null = Initialize-ProjectConfiguration } catch { $blocked = $_.Exception.Message -like '*Nothing was overwritten*' }
Assert ($blocked -and -not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'backend/.env'))) 'Existing database without credentials is never reinitialized'

New-Fixture 'partial database'
New-Item -ItemType Directory -Path (Join-Path $LocalDirectory 'postgresql/data') -Force | Out-Null
$partial = Join-Path $LocalDirectory 'postgresql/data/keep.bin'
Write-Utf8 $partial 'preserve'
$blocked = $false
try { Initialize-ProjectDatabase ([pscustomobject]@{ managedDatabase = $true; port = 5432 }) } catch { $blocked = $_.Exception.Message -like '*incomplete initialization*' }
Assert ($blocked -and (Get-Content -LiteralPath $partial -Raw) -eq 'preserve') 'Interrupted initdb cannot delete partial database files'

New-Fixture 'archive guards'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = Join-Path $ProjectRoot 'traversal.zip'
$stream = [IO.File]::Open($archive, 'CreateNew')
$zip = [IO.Compression.ZipArchive]::new($stream, 'Create')
try {
    $entry = $zip.CreateEntry('../../escaped.txt')
    $writer = [IO.StreamWriter]::new($entry.Open())
    try { $writer.Write('escape') } finally { $writer.Dispose() }
} finally { $zip.Dispose(); $stream.Dispose() }
$blocked = $false
try { Expand-ToolArchive $archive (Join-Path $LocalDirectory 'tool') 'fixture' } catch { $blocked = $_.Exception.Message -like '*escaped*' }
Assert ($blocked -and -not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'escaped.txt'))) 'Zip traversal is rejected before writing outside the destination'
$blocked = $false
try { Expand-ToolArchive $archive (Join-Path $ProjectRoot 'outside-local') 'fixture' } catch { $blocked = $_.Exception.Message -like '*must stay under*' }
Assert $blocked 'Tool extraction cannot target outside the project local directory'

function Invoke-WebRequest { param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec) Write-Utf8 $OutFile 'corrupt download' }
function Start-Sleep { param($Seconds) }
$blocked = $false
try { $null = Get-VerifiedDownload 'bad.zip' 'https://example.invalid/tool.zip' ('0' * 64) } catch { $blocked = $_.Exception.Message -like '*Checksum mismatch*' }
Assert ($blocked -and -not (Test-Path -LiteralPath (Join-Path $LocalDirectory 'downloads/bad.zip'))) 'Checksum failure never promotes or executes a downloaded archive'
$expected = (Get-FileHash -LiteralPath (Join-Path $LocalDirectory 'downloads/bad.zip.partial')).Hash
$verified = Get-VerifiedDownload 'good.zip' 'https://example.invalid/tool.zip' $expected
Assert ((Test-Path -LiteralPath $verified) -and -not (Test-Path -LiteralPath "$verified.partial")) 'Verified download is promoted atomically from its partial file'
function Invoke-WebRequest { throw 'A valid cached download must not use the network.' }
$cached = Get-VerifiedDownload 'good.zip' 'https://example.invalid/tool.zip' $expected
Assert ($cached -eq $verified) 'Retry reuses a verified cached archive without network access'

$lockPath = Join-Path $LocalDirectory 'launcher-main.lock'
$first = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
$blocked = $false
try { try { $second = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None'); $second.Dispose() } catch [IO.IOException] { $blocked = $true } }
finally { $first.Dispose() }
$again = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None'); $again.Dispose()
Assert $blocked 'Exclusive handles prevent concurrent setup/startup and release after exit'

# Exercise the missing-runtime branches without installing anything system-wide.
function Test-Path {
    param($LiteralPath)
    if ($LiteralPath -match '[\\/]System32[\\/].*140.*\.dll$') { return $false }
    return Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath
}
function Invoke-WebRequest { param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec) Write-Utf8 $OutFile 'installer fixture' }
function Get-AuthenticodeSignature { param($LiteralPath) return [pscustomobject]@{ Status = 'NotSigned' } }
function Start-Process { throw 'An unsigned installer must never run.' }
$blocked = $false
try { Ensure-VCRuntime } catch { $blocked = $_.Exception.Message -like '*signature is invalid*' }
Assert $blocked 'A missing runtime never executes an unsigned Microsoft installer download'
function Get-AuthenticodeSignature {
    param($LiteralPath)
    return [pscustomobject]@{ Status = 'Valid'; SignerCertificate = [pscustomobject]@{ Subject = 'CN=Microsoft Corporation, O=Microsoft Corporation, C=US' } }
}
function Start-Process { param($FilePath, $ArgumentList, $WindowStyle, [switch]$PassThru, [switch]$Wait) return [pscustomobject]@{ ExitCode = 3010 } }
$blocked = $false
try { Ensure-VCRuntime } catch { $blocked = $_.Exception.Message -like '*requires a restart*' }
Assert $blocked 'A runtime installer requesting reboot stops setup with restart instructions'
Write-Host "Passed $checks setup checks. Fixtures: $fixtureRoot"
