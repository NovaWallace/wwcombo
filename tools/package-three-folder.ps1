param(
    [string]$Version = "",
    [string]$OutputDirectory = "release-packages"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
}
$out = Join-Path $root $OutputDirectory
$name = "wwcombo-v$Version-Windows-x64-three-folder"
$stage = Join-Path $out $name
$zip = Join-Path $out "$name.zip"
$exe = Join-Path $root "src-tauri\target\release\wwcombo.exe"

Push-Location $root
try {
    npm run build | Out-Host
    cargo tauri build --no-bundle --features release-core | Out-Host
} finally { Pop-Location }

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Release executable missing: $exe" }
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$core = Join-Path $stage "wwcombo"
$live2d = Join-Path $stage "live2d"
$ffmpeg = Join-Path $stage "ffmpeg"
New-Item -ItemType Directory -Force -Path $core, $live2d, $ffmpeg | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $core "wwcombo.exe")

$dist = Join-Path $root "dist"
Copy-Item -LiteralPath $dist -Destination (Join-Path $core "dist") -Recurse
$ffmpegSource = Join-Path $root "src-tauri\resources\ffmpeg.exe"
if (Test-Path -LiteralPath $ffmpegSource -PathType Leaf) { Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $ffmpeg "ffmpeg.exe") }

$liveRoot = Join-Path $root "live2d-optional"
if (Test-Path -LiteralPath $liveRoot -PathType Container) {
    Copy-Item -LiteralPath $liveRoot -Destination (Join-Path $live2d "live2d-optional") -Recurse
}

$docs = @("README.md", "README_EN.txt", "LICENSE", "RUN-AS-ADMIN.txt", "RUN-AS-ADMIN-ZH.txt")
foreach ($doc in $docs) {
    $source = Join-Path $root $doc
    if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination (Join-Path $core $doc) }
}
Set-Content -LiteralPath (Join-Path $core "INSTALL.txt") -Encoding utf8 -Value @"
WWCOMBO $Version

This package intentionally contains exactly three folders:
  wwcombo  - the application and frontend files
  live2d   - optional Live2D assets
  ffmpeg   - optional video/export executable

Run wwcombo\wwcombo.exe. Keep the three folders together.
"@

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
Write-Output "Created $zip"
