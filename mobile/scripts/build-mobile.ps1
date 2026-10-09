# Build with a server URL supplied for this run. Cloud uses EAS; Local reuses the Android builder.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackendBaseUrl,
    [ValidateSet('Cloud', 'Local')]
    [string]$Mode = 'Cloud',
    [ValidateSet('android', 'ios', 'all')]
    [string]$Platform = 'android',
    [ValidateSet('preview', 'production')]
    [string]$Profile = 'preview',
    [string]$Arch = 'arm64-v8a,x86_64',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$serverUri = $null
if (-not [Uri]::TryCreate($BackendBaseUrl.Trim(), [UriKind]::Absolute, [ref]$serverUri) -or
    $serverUri.Scheme -notin @('http', 'https') -or -not $serverUri.Host -or
    $serverUri.UserInfo -or $serverUri.Query -or $serverUri.Fragment -or $serverUri.AbsolutePath -ne '/') {
    throw 'Server URL must be an HTTP(S) origin, e.g. https://api.example.com or http://192.168.1.50:8000 (without /api/v1).'
}
$serverBase = $serverUri.GetLeftPart([UriPartial]::Authority)
if ($Mode -eq 'Local' -and $Platform -ne 'android') {
    throw 'Local builds support Android only. Use Cloud for iOS or all platforms.'
}
$mobileDir = Split-Path -Parent $PSScriptRoot
Write-Host "Build: $Mode / $Platform / $Profile"
Write-Host "Server: $serverBase"
if ($DryRun) { Write-Host 'Dry run passed; no files changed and no build started.'; return }

if ($Mode -eq 'Local') {
    if ($Profile -ne 'preview') { throw 'Local builds use the existing APK builder. Use Cloud for production store builds.' }
    & (Join-Path $PSScriptRoot 'build-android.ps1') -BackendBaseUrl $serverBase -Arch $Arch
    return
}

# EAS uploads the native project when present. Keep config-generated native folders
# out of the upload so cloud prebuild applies app.json consistently.
$easPath = Join-Path $mobileDir 'eas.json'
$originalConfig = [IO.File]::ReadAllBytes($easPath)
$config = Get-Content -LiteralPath $easPath -Raw | ConvertFrom-Json
$runProfile = $config.build.$Profile | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$runProfile | Add-Member -NotePropertyName env -NotePropertyValue @{
    EXPO_PUBLIC_BACKEND_BASE = $serverBase
    EXPO_PUBLIC_USE_RN_FETCH = '1'
} -Force
$config.build | Add-Member -NotePropertyName 'custom-server' -NotePropertyValue $runProfile -Force
Push-Location $mobileDir
try {
    [IO.File]::WriteAllText($easPath, ($config | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
    & npx.cmd eas-cli@latest build --platform $Platform --profile custom-server --wait
    if ($LASTEXITCODE -ne 0) { throw "EAS build failed (exit $LASTEXITCODE)." }
} finally {
    [IO.File]::WriteAllBytes($easPath, $originalConfig)
    Pop-Location
}
