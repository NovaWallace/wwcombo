param(
  [ValidateSet('aarch64')]
  [string]$Target = 'aarch64',
  [switch]$SkipRust
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$srcTauri = Join-Path $projectRoot 'src-tauri'
$androidProject = Join-Path $srcTauri 'gen\android'
function Get-EnvValue {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'User') }
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Machine') }
  return $value
}

$sdk = Get-EnvValue 'ANDROID_HOME'
if (-not $sdk) { $sdk = Get-EnvValue 'ANDROID_SDK_ROOT' }
$ndk = Get-EnvValue 'NDK_HOME'
if (-not $ndk) { $ndk = Get-EnvValue 'ANDROID_NDK_HOME' }
$jdkCandidates = @(
  'C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot',
  (Get-EnvValue 'JAVA_HOME')
) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) }

if (-not $sdk -or -not (Test-Path $sdk)) { throw 'ANDROID_HOME is not configured.' }
if (-not $ndk -or -not (Test-Path $ndk)) { throw 'NDK_HOME is not configured.' }
if (-not $jdkCandidates.Count) { throw 'JDK 21 is required for the Android build.' }

$env:JAVA_HOME = $jdkCandidates[0]
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:NDK_HOME = $ndk
$env:ANDROID_NDK_HOME = $ndk
$env:GRADLE_OPTS = "$($env:GRADLE_OPTS) -Dorg.gradle.native=false"
$env:JAVA_TOOL_OPTIONS = "$($env:JAVA_TOOL_OPTIONS) -Dorg.gradle.native=false"
# NDK's Windows linker cannot reliably open Cargo object files whose absolute
# paths contain non-ASCII characters. Keep native build outputs in an ASCII path.
$androidBuildRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $env:TEMP }
$androidBuildCache = Join-Path $androidBuildRoot 'WWComboAndroidBuild'
$env:CARGO_TARGET_DIR = Join-Path $androidBuildCache 'cargo-target'
$env:GRADLE_USER_HOME = Join-Path $androidBuildCache 'gradle-home'
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
$toolchain = Join-Path $ndk 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$env:PATH = "$env:JAVA_HOME\bin;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$toolchain;$env:PATH"

$triple = 'aarch64-linux-android'
$linker = Join-Path $toolchain 'aarch64-linux-android24-clang.cmd'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $linker
$env:CC_aarch64_linux_android = $linker
$env:AR_aarch64_linux_android = Join-Path $toolchain 'llvm-ar.exe'

& (Join-Path $PSScriptRoot 'sync-android-mobile-icons.ps1') -ProjectRoot $projectRoot

Push-Location $projectRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally {
  Pop-Location
}

$nativeDestination = Join-Path $androidProject 'app\src\main\jniLibs\arm64-v8a\libwwcombo_lib.so'
if (-not $SkipRust) {
  Push-Location $srcTauri
  try {
    & cargo build --package wwcombo --target $triple --features tauri/custom-protocol --lib
    if ($LASTEXITCODE -ne 0) { throw 'Android Rust build failed.' }
  } finally {
    Pop-Location
  }

  $nativeSource = Join-Path $env:CARGO_TARGET_DIR "$triple\debug\libwwcombo_lib.so"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $nativeDestination) | Out-Null
  Copy-Item -LiteralPath $nativeSource -Destination $nativeDestination -Force
} elseif (-not (Test-Path $nativeDestination)) {
  throw "SkipRust was requested, but the native library is missing: $nativeDestination"
}

$gradle = Join-Path $env:USERPROFILE '.gradle\wrapper\dists\gradle-8.14.3-bin\40dfek2kz346l18gf9ltjsnyd\gradle-8.14.3\bin\gradle.bat'
if (-not (Test-Path $gradle)) {
  $gradle = Join-Path $androidProject 'gradlew.bat'
}
$apk = Join-Path $androidProject 'app\build\outputs\apk\arm64\debug\app-arm64-debug.apk'
if (Test-Path $apk) { Remove-Item -LiteralPath $apk -Force }

# AGP's incremental APK writer can retain the previous uncompressed Rust library
# as unreachable bytes when libwwcombo_lib.so changes. Clear only the arm64 APK
# packaging cache so repeated debug builds do not silently double in size.
$packageCache = Join-Path $androidProject 'app\build\intermediates\incremental\packageArm64Debug'
if (Test-Path $packageCache) {
  $resolvedCache = [IO.Path]::GetFullPath($packageCache)
  $resolvedBuild = [IO.Path]::GetFullPath((Join-Path $androidProject 'app\build'))
  if (-not $resolvedCache.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove packaging cache outside Android build directory: $resolvedCache"
  }
  Remove-Item -LiteralPath $resolvedCache -Recurse -Force
}

Push-Location $androidProject
try {
  # The build host can block Gradle's bundled native-platform.dll. The JDK fallback
  # is sufficient for packaging and keeps this script usable in restricted hosts.
  & $gradle :app:assembleArm64Debug -x :app:rustBuildArm64Debug --no-daemon --no-problems-report
  if ($LASTEXITCODE -ne 0) { throw 'Android Gradle build failed.' }
} finally {
  Pop-Location
}

if (-not (Test-Path $apk)) { throw 'Gradle completed without producing the expected APK.' }

# A normal signed APK has only a small amount of ZIP/signing overhead. A large
# gap means the incremental packager left stale native-library bytes behind.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apk)
try {
  $packedSize = ($archive.Entries | Measure-Object CompressedLength -Sum).Sum
} finally {
  $archive.Dispose()
}
$apkSize = (Get-Item -LiteralPath $apk).Length
$apkOverhead = $apkSize - $packedSize
if ($apkOverhead -gt 16MB) {
  throw "APK contains $apkOverhead bytes outside its ZIP payload; packaging cache may be stale."
}
Write-Host "Android APK: $apk"
