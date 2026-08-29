param(
    [string]$Version = "0.63",
    [string]$Date = (Get-Date -Format "yyyyMMdd"),
    [string]$OutputDirectory = "release-packages",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$packageName = "wwcombo-v$Version-Windows-x64-portable-$Date"
$packageRoot = Join-Path $outputRoot $packageName
$archivePath = Join-Path $outputRoot "$packageName.zip"
$releaseExe = Join-Path $repositoryRoot "src-tauri\target\release\wwcombo.exe"

if (-not $SkipBuild) {
    Push-Location $repositoryRoot
    $previousExperimentalLabs = $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS
    $previousBuffTimer = $env:WWCOMBO_INCLUDE_BUFF_TIMER
    $previousSimulatedInput = $env:WWCOMBO_INCLUDE_SIMULATED_INPUT
    try {
        $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS = "0"
        $env:WWCOMBO_INCLUDE_BUFF_TIMER = "0"
        $env:WWCOMBO_INCLUDE_SIMULATED_INPUT = "0"
        cargo tauri build --no-bundle --features release-core
    } finally {
        if ($null -eq $previousExperimentalLabs) {
            Remove-Item Env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS -ErrorAction SilentlyContinue
        } else {
            $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS = $previousExperimentalLabs
        }
        if ($null -eq $previousBuffTimer) {
            Remove-Item Env:WWCOMBO_INCLUDE_BUFF_TIMER -ErrorAction SilentlyContinue
        } else {
            $env:WWCOMBO_INCLUDE_BUFF_TIMER = $previousBuffTimer
        }
        if ($null -eq $previousSimulatedInput) {
            Remove-Item Env:WWCOMBO_INCLUDE_SIMULATED_INPUT -ErrorAction SilentlyContinue
        } else {
            $env:WWCOMBO_INCLUDE_SIMULATED_INPUT = $previousSimulatedInput
        }
        Pop-Location
    }
}
if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) { throw "Release executable is missing: $releaseExe" }

$distRoot = Join-Path $repositoryRoot "dist"
$forbiddenFrontendModules = @()
$realtimeVisionEntry = Join-Path $distRoot "realtime-vision.html"
if (Test-Path -LiteralPath $realtimeVisionEntry -PathType Leaf) { $forbiddenFrontendModules += $realtimeVisionEntry }
$forbiddenFrontendModules += @(Get-ChildItem -LiteralPath (Join-Path $distRoot "assets") -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(RealtimeVisionLab|realtimeVisionInput|simulatedInput)-'
} | ForEach-Object FullName)
if ($forbiddenFrontendModules.Count -gt 0) {
    throw "Core build still contains excluded frontend modules: $($forbiddenFrontendModules -join ', ')"
}
$forbiddenFrontendText = Get-ChildItem -LiteralPath (Join-Path $distRoot "assets") -File -Filter "*.js" -ErrorAction SilentlyContinue | Select-String -SimpleMatch -Pattern @(
    "Key-triggered Buff Timer",
    "Automatic simulation is armed and will run with the practice start key."
)
if ($forbiddenFrontendText) {
    throw "Core build still exposes excluded experimental controls: $(($forbiddenFrontendText.Path | Sort-Object -Unique) -join ', ')"
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
if (Test-Path -LiteralPath $packageRoot) {
    $resolved = (Resolve-Path -LiteralPath $packageRoot).Path
    if (-not $resolved.StartsWith($outputRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe package directory: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $packageRoot "wwcombo.exe")
$documents = @(
    @{ Source = "README.md"; Destination = "README_ZH.txt" },
    @{ Source = "README_EN.txt"; Destination = "README_EN.txt" },
    @{ Source = "README_JA.md"; Destination = "README_JA.txt" },
    @{ Source = "README_KO.md"; Destination = "README_KO.txt" },
    @{ Source = "LICENSE"; Destination = "LICENSE" },
    @{ Source = "RUN-AS-ADMIN.txt"; Destination = "RUN-AS-ADMIN.txt" },
    @{ Source = "RUN-AS-ADMIN-ZH.txt"; Destination = "RUN-AS-ADMIN-ZH.txt" },
    @{ Source = "WWCOMBO-DLC-README.txt"; Destination = "wwcombo dlc\README.txt" }
)
$releaseNotes = "RELEASE-NOTES-v$Version.md"
if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $releaseNotes))) { $releaseNotes = "RELEASE-NOTES-v$Version.0.md" }
if (Test-Path -LiteralPath (Join-Path $repositoryRoot $releaseNotes)) {
    $documents += @{ Source = $releaseNotes; Destination = $releaseNotes }
}
foreach ($document in $documents) {
    $source = Join-Path $repositoryRoot $document.Source
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Package document is missing: $source" }
    $destination = Join-Path $packageRoot $document.Destination
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
}
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "wwcombo dlc\ffmpeg") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "wwcombo dlc\live2d") | Out-Null

$buildInfo = @(
    "Package: $packageName",
    "Built: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "Version: $Version",
    "Type: Windows x64 core portable build",
    "Contains: wwcombo.exe, documentation, and an empty wwcombo dlc folder.",
    "Excluded: FFmpeg, Live2D source assets, Buff recognition/timer UI, automatic simulated-input execution, scripts, community website source, test runtimes, node_modules, and project source."
) -join "`r`n"
Set-Content -LiteralPath (Join-Path $packageRoot "BUILD-INFO.txt") -Value $buildInfo -Encoding utf8

$forbidden = Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Where-Object {
    $_.Name -ieq "ffmpeg.exe" -or $_.Extension -in @(".skel", ".atlas") -or $_.FullName -match "[\\/]scripts[\\/]"
}
if ($forbidden) { throw "Core package contains forbidden optional assets: $($forbidden.FullName -join ', ')" }

$checksumLines = Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($packageRoot.Length + 1)
    "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
}
Set-Content -LiteralPath (Join-Path $packageRoot "SHA256SUMS.txt") -Value ($checksumLines -join "`r`n") -Encoding utf8

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path $packageRoot -DestinationPath $archivePath -CompressionLevel Optimal
$archive = Get-Item -LiteralPath $archivePath
Write-Output "Created $($archive.FullName) ($([math]::Round($archive.Length / 1MB, 2)) MB)"
