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
    try {
        $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS = "0"
        cargo tauri build --no-bundle
    } finally {
        if ($null -eq $previousExperimentalLabs) {
            Remove-Item Env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS -ErrorAction SilentlyContinue
        } else {
            $env:WWCOMBO_INCLUDE_EXPERIMENTAL_ANALYSIS_LABS = $previousExperimentalLabs
        }
        Pop-Location
    }
}
if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) { throw "Release executable is missing: $releaseExe" }

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
$releaseNotes = "RELEASE-NOTES-v$Version.0.md"
if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $releaseNotes))) {
    $releaseNotes = "RELEASE-NOTES-v$Version.md"
}
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

$buildInfo = @(
    "Package: $packageName",
    "Built: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "Version: $Version",
    "Type: Windows x64 core portable build",
    "Contains: wwcombo.exe, documentation, and an empty wwcombo dlc folder.",
    "Excluded: FFmpeg, Live2D source assets, the unfinished Real-time Vision lab, scripts, community website source, test runtimes, node_modules, and project source."
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
