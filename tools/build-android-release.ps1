param([ValidateSet('aarch64')][string]$Target = 'aarch64')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$srcTauri = Join-Path $projectRoot 'src-tauri'
$androidProject = Join-Path $srcTauri 'gen\android'
function Get-EnvValue { param([string]$Name) $value = [Environment]::GetEnvironmentVariable($Name, 'Process'); if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'User') }; if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Machine') }; return $value }
$sdk = Get-EnvValue 'ANDROID_HOME'; if (-not $sdk) { $sdk = Get-EnvValue 'ANDROID_SDK_ROOT' }
$ndk = Get-EnvValue 'NDK_HOME'; if (-not $ndk) { $ndk = Get-EnvValue 'ANDROID_NDK_HOME' }
$jdkCandidates = @('C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot', (Get-EnvValue 'JAVA_HOME')) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) }
if (-not $sdk -or -not (Test-Path $sdk)) { throw 'ANDROID_HOME is not configured.' }
if (-not $ndk -or -not (Test-Path $ndk)) { throw 'NDK_HOME is not configured.' }
if (-not $jdkCandidates.Count) { throw 'JDK 21 is required for the Android build.' }
$env:JAVA_HOME = $jdkCandidates[0]; $env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk; $env:NDK_HOME = $ndk; $env:ANDROID_NDK_HOME = $ndk
$env:GRADLE_OPTS = "$($env:GRADLE_OPTS) -Dorg.gradle.native=false"; $env:JAVA_TOOL_OPTIONS = "$($env:JAVA_TOOL_OPTIONS) -Dorg.gradle.native=false"
$androidBuildRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $env:TEMP }
$androidBuildCache = Join-Path $androidBuildRoot 'WWComboAndroidBuild'
$env:CARGO_TARGET_DIR = Join-Path $androidBuildCache 'cargo-target'; $env:GRADLE_USER_HOME = Join-Path $androidBuildCache 'gradle-home'
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
$toolchain = Join-Path $ndk 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$env:PATH = "$env:JAVA_HOME\bin;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$toolchain;$env:PATH"
$triple = 'aarch64-linux-android'; $linker = Join-Path $toolchain 'aarch64-linux-android24-clang.cmd'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $linker; $env:CC_aarch64_linux_android = $linker; $env:AR_aarch64_linux_android = Join-Path $toolchain 'llvm-ar.exe'

& (Join-Path $PSScriptRoot 'sync-android-mobile-icons.ps1') -ProjectRoot $projectRoot

Write-Host '1/6 Building frontend...'
Push-Location $projectRoot
try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' } } finally { Pop-Location }

Write-Host '2/6 Building Rust release library...'
Push-Location $srcTauri
try { & cargo build --package wwcombo --target $triple --features tauri/custom-protocol --release --lib; if ($LASTEXITCODE -ne 0) { throw 'Android Rust release build failed.' } } finally { Pop-Location }
$nativeSource = Join-Path $env:CARGO_TARGET_DIR "$triple\release\libwwcombo_lib.so"
$nativeDestination = Join-Path $androidProject 'app\src\main\jniLibs\arm64-v8a\libwwcombo_lib.so'
if (-not (Test-Path $nativeSource)) { throw "Release native library is missing: $nativeSource" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $nativeDestination) | Out-Null
Copy-Item -LiteralPath $nativeSource -Destination $nativeDestination -Force

$gradle = Join-Path $env:USERPROFILE '.gradle\wrapper\dists\gradle-8.14.3-bin\40dfek2kz346l18gf9ltjsnyd\gradle-8.14.3\bin\gradle.bat'; if (-not (Test-Path $gradle)) { $gradle = Join-Path $androidProject 'gradlew.bat' }
$releaseDirectory = Join-Path $androidProject 'app\build\outputs\apk\arm64\release'
$unsignedApk = Join-Path $releaseDirectory 'app-arm64-release-unsigned.apk'; $rawReleaseApk = Join-Path $releaseDirectory 'app-arm64-release.apk'
Remove-Item -LiteralPath $unsignedApk,$rawReleaseApk -Force -ErrorAction SilentlyContinue
$packageCache = Join-Path $androidProject 'app\build\intermediates\incremental\packageArm64Release'
if (Test-Path $packageCache) { $resolvedCache = [IO.Path]::GetFullPath($packageCache); $resolvedBuild = [IO.Path]::GetFullPath((Join-Path $androidProject 'app\build')); if (-not $resolvedCache.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove packaging cache outside Android build directory: $resolvedCache" }; Remove-Item -LiteralPath $resolvedCache -Recurse -Force }

Write-Host '3/6 Assembling Android release variant...'
Push-Location $androidProject
try { & $gradle :app:assembleArm64Release -x :app:rustBuildArm64Release --no-daemon --no-problems-report; if ($LASTEXITCODE -ne 0) { throw 'Android Gradle release build failed.' } } finally { Pop-Location }
$builtApk = @($unsignedApk,$rawReleaseApk) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $builtApk) { throw 'Gradle completed without producing the release APK.' }

Write-Host '4/6 Aligning and signing release APK for test distribution...'
$buildTools = Get-ChildItem -LiteralPath (Join-Path $sdk 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$zipalign = Join-Path $buildTools.FullName 'zipalign.exe'; $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'; $debugKeystore = Join-Path $env:USERPROFILE '.android\debug.keystore'
if (-not (Test-Path $zipalign)) { throw "zipalign is missing: $zipalign" }; if (-not (Test-Path $apksigner)) { throw "apksigner is missing: $apksigner" }; if (-not (Test-Path $debugKeystore)) { throw "Test signing keystore is missing: $debugKeystore" }
$alignedApk = Join-Path $releaseDirectory 'app-arm64-release-aligned.apk'; $signedApk = Join-Path $releaseDirectory 'app-arm64-release-signed.apk'
Remove-Item -LiteralPath $alignedApk,$signedApk -Force -ErrorAction SilentlyContinue
& $zipalign -f -p 4 $builtApk $alignedApk; if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }
& $apksigner sign --ks $debugKeystore --ks-pass pass:android --out $signedApk $alignedApk; if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
& $apksigner verify --verbose $signedApk; if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }

Write-Host '5/6 Checking APK payload integrity...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($signedApk); try { $packedSize = ($archive.Entries | Measure-Object CompressedLength -Sum).Sum } finally { $archive.Dispose() }
$apkSize = (Get-Item -LiteralPath $signedApk).Length; $apkOverhead = $apkSize - $packedSize
if ($apkOverhead -gt 16MB) { throw "APK contains $apkOverhead bytes outside its ZIP payload; packaging cache may be stale." }
$outputDirectory = Join-Path $projectRoot 'android-builds'; New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version; $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $outputDirectory "WWCombo-Android-$version-release-$stamp.apk"; Copy-Item -LiteralPath $signedApk -Destination $output -Force
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
Write-Host '6/6 Release APK ready.'
[pscustomobject]@{ Path = $output; SizeBytes = (Get-Item $output).Length; SizeMB = [math]::Round((Get-Item $output).Length / 1MB, 2); ZipPayloadBytes = $packedSize; OverheadBytes = $apkOverhead; SHA256 = $hash } | Format-List
