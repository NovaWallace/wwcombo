param(
    [string]$Version = "",
    [string]$Date = (Get-Date -Format "yyyyMMdd"),
    [string]$OutputDirectory = "release-packages\dlc"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not $Version) { $Version = (Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json).version }
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$packageName = "wwcombo-v$Version-All-DLC-Windows-x64-$Date"
$stageRoot = Join-Path $outputRoot "_stage-$packageName"
$archivePath = Join-Path $outputRoot "$packageName.zip"
$live2dSourceRoot = Join-Path $repositoryRoot "live2d-optional"
$ffmpegSource = Join-Path $repositoryRoot "src-tauri\resources\ffmpeg.exe"
$simulationSource = Join-Path $repositoryRoot "src-tauri\target\release\simulated-input-dlc.exe"
$sourceManifestPath = Join-Path $live2dSourceRoot "manifest.json"
$namesPath = Join-Path $PSScriptRoot "live2d-names.json"

foreach ($required in @($ffmpegSource, $simulationSource, $sourceManifestPath, $namesPath, (Join-Path $repositoryRoot "README.txt"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required DLC source is missing: $required" }
}
if ((Get-Item -LiteralPath $simulationSource).VersionInfo.ProductVersion -ne $Version) {
    throw "Simulated input DLC version does not match $Version."
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
if (Test-Path -LiteralPath $stageRoot) {
    $resolved = (Resolve-Path -LiteralPath $stageRoot).Path
    $expected = [IO.Path]::GetFullPath($stageRoot)
    $allowedPrefix = $outputRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.Equals($expected, [StringComparison]::OrdinalIgnoreCase) -or
        -not $resolved.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe staging directory: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
$dlcRoot = Join-Path $stageRoot "wwcombo dlc"
$ffmpegRoot = Join-Path $dlcRoot "ffmpeg"
$simulationRoot = Join-Path $dlcRoot "simulated-input"
$live2dRoot = Join-Path $dlcRoot "live2d"
New-Item -ItemType Directory -Force -Path $ffmpegRoot, $simulationRoot, $live2dRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $repositoryRoot "README.txt") -Destination $stageRoot
Set-Content -LiteralPath (Join-Path $dlcRoot "README.txt") -Encoding utf8 -Value "Extract this DLC archive into the directory containing wwcombo.exe. Keep wwcombo dlc beside the executable."
Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $ffmpegRoot "ffmpeg.exe")
Copy-Item -LiteralPath $simulationSource -Destination (Join-Path $simulationRoot "simulated-input-dlc.exe")
Set-Content -LiteralPath (Join-Path $ffmpegRoot "manifest.json") -Encoding utf8 -Value (([ordered]@{
    schemaVersion = 1; type = "wwcombo-ffmpeg"; platform = "windows-x64"; executable = "ffmpeg.exe"
} | ConvertTo-Json -Depth 4))
$simulationDemoName = -join ([char]27169, [char]25311, [char]28436, [char]31034)
Set-Content -LiteralPath (Join-Path $simulationRoot "manifest.json") -Encoding utf8 -Value (([ordered]@{
    schemaVersion = 1; type = "wwcombo-simulated-input"; displayName = $simulationDemoName; platform = "windows-x64"; executable = "simulated-input-dlc.exe"
} | ConvertTo-Json -Depth 4))

$sourceManifest = Get-Content -LiteralPath $sourceManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$characterNames = Get-Content -LiteralPath $namesPath -Raw -Encoding utf8 | ConvertFrom-Json
$sourcePrefix = [IO.Path]::GetFullPath($live2dSourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$seenPackages = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($character in $sourceManifest.characters) {
    $names = $characterNames.PSObject.Properties[[string]$character.id].Value
    if (-not $names) { throw "Live2D character name is missing: $($character.id)" }
    $packageFolder = [string]$names.'zh-CN'
    if (-not $seenPackages.Add($packageFolder)) { throw "Duplicate Live2D package name: $packageFolder" }
    $characterRoot = Join-Path $live2dRoot $packageFolder
    $assetRoot = Join-Path $characterRoot "assets"
    New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
    $assetNames = @{}
    foreach ($kind in @("skeleton", "atlas", "texture")) {
        $relative = [string]$character.$kind -replace '/', [IO.Path]::DirectorySeparatorChar
        $sourcePath = [IO.Path]::GetFullPath((Join-Path $live2dSourceRoot $relative))
        if (-not $sourcePath.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Missing or unsafe Live2D asset: $sourcePath"
        }
        $assetNames[$kind] = Split-Path -Leaf $sourcePath
        Copy-Item -LiteralPath $sourcePath -Destination $assetRoot
        if ($kind -eq "skeleton") {
            $noticePath = Join-Path (Split-Path -Parent $sourcePath) "NOTICE.txt"
            if (Test-Path -LiteralPath $noticePath -PathType Leaf) {
                Copy-Item -LiteralPath $noticePath -Destination $characterRoot
            }
        }
    }
    $manifest = [ordered]@{
        schemaVersion = 1
        type = "wwcombo-live2d"
        id = [string]$character.id
        characterId = [int]$character.characterId
        names = [ordered]@{ "zh-CN" = $names.'zh-CN'; "en-US" = $names.'en-US' }
        skeleton = "assets/$($assetNames.skeleton)"
        atlas = "assets/$($assetNames.atlas)"
        texture = "assets/$($assetNames.texture)"
        source = "https://ww.nanoka.cc/character/$($character.characterId)/"
    }
    Set-Content -LiteralPath (Join-Path $characterRoot "manifest.json") -Encoding utf8 -Value ($manifest | ConvertTo-Json -Depth 6)
}
if ($seenPackages.Count -ne $sourceManifest.characters.Count) {
    throw "Live2D package count mismatch: $($seenPackages.Count) / $($sourceManifest.characters.Count)"
}

$checksumLines = Get-ChildItem -LiteralPath $stageRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($stageRoot.Length + 1)
    "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
}
Set-Content -LiteralPath (Join-Path $stageRoot "SHA256SUMS.txt") -Encoding utf8 -Value ($checksumLines -join "`r`n")
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw "DLC archive was not created: $archivePath" }
$resolvedStage = (Resolve-Path -LiteralPath $stageRoot).Path
$allowedStagePrefix = $outputRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedStage.Equals([IO.Path]::GetFullPath($stageRoot), [StringComparison]::OrdinalIgnoreCase) -or
    -not $resolvedStage.StartsWith($allowedStagePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe staging directory: $resolvedStage"
}
Remove-Item -LiteralPath $resolvedStage -Recurse -Force
Write-Output "Created $archivePath ($([math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 2)) MB; $($seenPackages.Count) Live2D characters)"
