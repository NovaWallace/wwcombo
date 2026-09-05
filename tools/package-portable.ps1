param(
    [string]$Version = "0.65",
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
    $previousSimulatedInputDlcRequired = $env:WWCOMBO_SIMULATED_INPUT_DLC_REQUIRED
    try {
        $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS = "0"
        $env:WWCOMBO_INCLUDE_BUFF_TIMER = "1"
        $env:WWCOMBO_INCLUDE_SIMULATED_INPUT = "1"
        $env:WWCOMBO_SIMULATED_INPUT_DLC_REQUIRED = "1"
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
        if ($null -eq $previousSimulatedInputDlcRequired) {
            Remove-Item Env:WWCOMBO_SIMULATED_INPUT_DLC_REQUIRED -ErrorAction SilentlyContinue
        } else {
            $env:WWCOMBO_SIMULATED_INPUT_DLC_REQUIRED = $previousSimulatedInputDlcRequired
        }
        Pop-Location
    }
}
if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) { throw "Release executable is missing: $releaseExe" }

$distRoot = Join-Path $repositoryRoot "dist"
$requiredFrontendModules = @(
    (Join-Path $distRoot "realtime-vision.html"),
    (Join-Path $distRoot "assets")
)
foreach ($requiredModule in $requiredFrontendModules) {
    if (-not (Test-Path -LiteralPath $requiredModule)) { throw "Core build is missing required video/Buff module: $requiredModule" }
}
$requiredFrontendChunks = Get-ChildItem -LiteralPath (Join-Path $distRoot "assets") -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(VideoAxisWorkbench|RealtimeVisionLab|realtimeVisionInput|realtimeVisionWorker)-'
}
if ($requiredFrontendChunks.Count -lt 3) {
    throw "Core build is missing video/Buff frontend chunks. Found: $($requiredFrontendChunks.Name -join ', ')"
}

function Get-Sha256Hex([string]$Path) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
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
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "wwcombo dlc\simulated-input") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "wwcombo dlc\live2d") | Out-Null

$buildInfo = @(
    "Package: $packageName",
    "Built: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "Version: $Version",
    "Type: Windows x64 core portable build",
    "Contains: wwcombo.exe, video workbench UI, realtime Buff recognition UI, documentation, and an empty wwcombo dlc folder.",
    "Excluded: FFmpeg, Live2D source assets, and the native simulated-input executor. Install the separate FFmpeg, Live2D, or Simulated Demo DLC beside wwcombo.exe when needed. Scripts, community website source, test runtimes, node_modules, and project source are also excluded."
) -join "`r`n"
Set-Content -LiteralPath (Join-Path $packageRoot "BUILD-INFO.txt") -Value $buildInfo -Encoding utf8

$forbidden = Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Where-Object {
    $_.Name -ieq "ffmpeg.exe" -or $_.Extension -in @(".skel", ".atlas") -or $_.FullName -match "[\\/]scripts[\\/]"
}
if ($forbidden) { throw "Core package contains forbidden optional assets: $($forbidden.FullName -join ', ')" }

$checksumLines = Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($packageRoot.Length + 1)
    "$(Get-Sha256Hex $_.FullName)  $relative"
}
Set-Content -LiteralPath (Join-Path $packageRoot "SHA256SUMS.txt") -Value ($checksumLines -join "`r`n") -Encoding utf8

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path $packageRoot -DestinationPath $archivePath -CompressionLevel Optimal
$archive = Get-Item -LiteralPath $archivePath
Write-Output "Created $($archive.FullName) ($([math]::Round($archive.Length / 1MB, 2)) MB)"
