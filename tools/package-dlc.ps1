param(
    [string]$Version = "0.63",
    [string]$OutputDirectory = "release-packages\dlc",
    [string[]]$Live2dId = @(),
    [switch]$SkipFfmpeg,
    [switch]$SkipLive2d
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$stageRoot = Join-Path $outputRoot "_stage"
$sourceManifestPath = Join-Path $repositoryRoot "live2d-optional\manifest.json"
$sourceRoot = Split-Path -Parent $sourceManifestPath
$characterNamesPath = Join-Path $PSScriptRoot "live2d-names.json"
$characterNames = Get-Content -LiteralPath $characterNamesPath -Raw -Encoding utf8 | ConvertFrom-Json

function Reset-Stage {
    if (Test-Path -LiteralPath $stageRoot) {
        $resolved = (Resolve-Path -LiteralPath $stageRoot).Path
        if (-not $resolved.StartsWith($outputRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe staging directory: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
}

function Write-Utf8File([string]$Path, [string]$Content) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    Set-Content -LiteralPath $Path -Value $Content -Encoding utf8
}

function Compress-DlcStage([string]$ArchiveName) {
    $archivePath = Join-Path $outputRoot $ArchiveName
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    Compress-Archive -Path (Join-Path $stageRoot "wwcombo dlc") -DestinationPath $archivePath -CompressionLevel Optimal
    return $archivePath
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$archives = @()

if (-not $SkipFfmpeg) {
    $ffmpegSource = Join-Path $repositoryRoot "src-tauri\resources\ffmpeg.exe"
    if (-not (Test-Path -LiteralPath $ffmpegSource -PathType Leaf)) { throw "FFmpeg source is missing: $ffmpegSource" }
    Reset-Stage
    $ffmpegRoot = Join-Path $stageRoot "wwcombo dlc\ffmpeg"
    New-Item -ItemType Directory -Force -Path $ffmpegRoot | Out-Null
    Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $ffmpegRoot "ffmpeg.exe")
    Write-Utf8File (Join-Path $ffmpegRoot "manifest.json") (([ordered]@{
        schemaVersion = 1; type = "wwcombo-ffmpeg"; platform = "windows-x64"; executable = "ffmpeg.exe"
    } | ConvertTo-Json -Depth 4))
    Write-Utf8File (Join-Path $ffmpegRoot "README.txt") @"
WWCOMBO Video Extension

Purpose: video recognition, composition, and MP4 export. Normal recording, practice, appearance, and combo editing do not require it.
Install: extract this ZIP directly beside wwcombo.exe. The final path must be:
wwcombo dlc\ffmpeg\ffmpeg.exe
"@
    $archives += Compress-DlcStage "wwcombo-v$Version-FFmpeg-DLC-Windows-x64.zip"
}

if (-not $SkipLive2d) {
    if (-not (Test-Path -LiteralPath $sourceManifestPath -PathType Leaf)) { throw "Live2D source manifest is missing: $sourceManifestPath" }
    $sourceManifest = Get-Content -LiteralPath $sourceManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    foreach ($character in $sourceManifest.characters) {
        if ($Live2dId.Count -gt 0 -and $Live2dId -notcontains [string]$character.id) { continue }
        $names = $characterNames.PSObject.Properties[[string]$character.id].Value
        if (-not $names) { throw "Missing display names for Live2D id: $($character.id)" }
        $assets = @(
            [string]$character.skeleton,
            [string]$character.atlas,
            [string]$character.texture
        )
        foreach ($asset in $assets) {
            $sourcePath = Join-Path $sourceRoot ($asset -replace "/", "\")
            if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Live2D asset is missing: $sourcePath" }
        }

        Reset-Stage
        $packageFolder = "$($character.id)-$($character.characterId)"
        $packageRoot = Join-Path $stageRoot "wwcombo dlc\live2d\$packageFolder"
        $assetRoot = Join-Path $packageRoot "assets"
        New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
        foreach ($asset in $assets) {
            Copy-Item -LiteralPath (Join-Path $sourceRoot ($asset -replace "/", "\")) -Destination $assetRoot
        }
        $noticePath = Join-Path (Split-Path -Parent (Join-Path $sourceRoot ($character.skeleton -replace "/", "\"))) "NOTICE.txt"
        if (Test-Path -LiteralPath $noticePath -PathType Leaf) { Copy-Item -LiteralPath $noticePath -Destination $packageRoot }

        $skeletonName = Split-Path -Leaf ([string]$character.skeleton)
        $atlasName = Split-Path -Leaf ([string]$character.atlas)
        $textureName = Split-Path -Leaf ([string]$character.texture)
        Write-Utf8File (Join-Path $packageRoot "manifest.json") (([ordered]@{
            schemaVersion = 1
            type = "wwcombo-live2d"
            id = [string]$character.id
            characterId = [int]$character.characterId
            names = [ordered]@{ "zh-CN" = $names.'zh-CN'; "en-US" = $names.'en-US' }
            skeleton = "assets/$skeletonName"
            atlas = "assets/$atlasName"
            texture = "assets/$textureName"
            source = "https://ww.nanoka.cc/character/$($character.characterId)/"
        } | ConvertTo-Json -Depth 6))
        Write-Utf8File (Join-Path $packageRoot "README.txt") @"
WWCOMBO Live2D: $($names.'zh-CN') / $($names.'en-US') (Character ID $($character.characterId))

Install: extract this ZIP directly beside wwcombo.exe without changing its folders.
Final manifest path: wwcombo dlc\live2d\$packageFolder\manifest.json
Then choose Refresh under Settings > wwcombo DLC and select this character under Live2D.

The animation is loaded only on the home page and released after leaving it.
These copyrighted game assets are provided for a non-commercial fan project.
"@
        $archiveName = "wwcombo-v$Version-Live2D-$($character.characterId)-$($names.'en-US').zip"
        $archives += Compress-DlcStage $archiveName
    }
}

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
$checksumLines = foreach ($archive in $archives) {
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $(Split-Path -Leaf $archive)"
}
Write-Utf8File (Join-Path $outputRoot "SHA256SUMS.txt") ($checksumLines -join "`r`n")
Write-Output "Created $($archives.Count) DLC package(s) in $outputRoot"
