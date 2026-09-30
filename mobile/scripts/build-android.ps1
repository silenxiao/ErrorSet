<#
.SYNOPSIS
    打包 AI 错题本（mobile）Android APK。

.DESCRIPTION
    一条命令完成：解析 Android SDK → 生成原生工程（expo prebuild）→ 打国内镜像补丁
    → 补齐缺失的 SDK 组件 → Gradle 构建 → 校验产物。

    脚本把首建踩到的坑全部内置处理：
      1. gradle 分发包走腾讯云镜像（services.gradle.org 在国内不可达，且 wrapper 默认只等 10s）
      2. 插件解析走阿里云镜像（内置 gradlePluginPortal() 无法解析 foojay-resolver-convention）
      3. Gradle 内置 SDK 下载器会 Connection refused，故一律用命令行 sdkmanager 预装组件
      4. NDK / build-tools 版本按 Expo SDK 57 模板实际要求（27.1.12297006、36.0.0）

.PARAMETER Arch
    目标 ABI，默认 arm64-v8a（现代真机）。多架构可传 "arm64-v8a,armeabi-v7a"，构建更慢、包更大。

.PARAMETER Variant
    Release（默认）或 Debug。两者都用 Android Debug 证书签名，均可直接安装；
    Release 体积更小、启动更快。上架商店需自备 keystore（见 -KeystorePath）。

.PARAMETER BackendBaseUrl
    打包时注入的后端地址，写入 mobile/.env.local 的 EXPO_PUBLIC_BACKEND_BASE。
    真机无法访问 127.0.0.1，必须用本机局域网 IP。留空则沿用现有 .env.local。

.PARAMETER AndroidSdk
    Android SDK 路径。留空时依次尝试 $env:ANDROID_HOME、$env:ANDROID_SDK_ROOT、
    G:\Android\Sdk、%LOCALAPPDATA%\Android\Sdk。

.PARAMETER SkipPrebuild
    跳过 expo prebuild（复用已有 mobile/android）。原生配置未变时可显著加快重出包。

.PARAMETER SkipSdkInstall
    跳过 SDK 组件检查与安装（组件已齐时可用）。

.PARAMETER KeystorePath / KeystorePassword / KeyAlias / KeyPassword
    可选的自定义签名。仅当 KeystorePath 非空时启用；将覆写 app/build.gradle 的 release 签名配置。

.PARAMETER OutputDir
    APK 输出目录，默认 mobile\dist。

.EXAMPLE
    .\build-android.cmd
    按默认设置打包 release arm64 APK。

.EXAMPLE
    .\build-android.cmd -BackendBaseUrl http://192.168.1.50:8000 -SkipPrebuild
    换后端地址并复用已有原生工程快速重出包。
#>

[CmdletBinding()]
param(
    [string]$Arch = 'arm64-v8a',
    [ValidateSet('Release', 'Debug')]
    [string]$Variant = 'Release',
    [string]$BackendBaseUrl = '',
    [string]$AndroidSdk = '',
    [switch]$SkipPrebuild,
    [switch]$SkipSdkInstall,
    [string]$KeystorePath = '',
    [string]$KeystorePassword = '',
    [string]$KeyAlias = '',
    [string]$KeyPassword = '',
    [string]$OutputDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) { Write-Host ''; Write-Host "=== $Text ===" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text){ Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Info([string]$Text) { Write-Host "  $Text" }

# ---------------------------------------------------------------------------
# 0. 定位路径
# ---------------------------------------------------------------------------
$scriptDir  = $PSScriptRoot
$mobileDir  = Split-Path -Parent $scriptDir
$androidDir = Join-Path $mobileDir 'android'
$envFile    = Join-Path $mobileDir '.env.local'

if (-not (Test-Path (Join-Path $mobileDir 'app.json'))) {
    throw "未找到 mobile/app.json，脚本应放在 mobile/scripts 下。当前解析：$mobileDir"
}
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $mobileDir 'dist' }

Write-Step '环境'
Write-Info "mobile    : $mobileDir"
Write-Info "变体/架构 : $Variant / $Arch"

# ---------------------------------------------------------------------------
# 1. 解析 Android SDK
# ---------------------------------------------------------------------------
function Resolve-AndroidSdk([string]$Explicit) {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) { $candidates += $Explicit }
    if ($env:ANDROID_HOME)     { $candidates += $env:ANDROID_HOME }
    if ($env:ANDROID_SDK_ROOT) { $candidates += $env:ANDROID_SDK_ROOT }
    $candidates += 'G:\Android\Sdk'
    $candidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')

    foreach ($c in $candidates) {
        if ([string]::IsNullOrWhiteSpace($c)) { continue }
        if (Test-Path (Join-Path $c 'platform-tools')) { return (Resolve-Path $c).Path }
    }
    return $null
}

$sdk = Resolve-AndroidSdk $AndroidSdk
if (-not $sdk) {
    throw '未找到 Android SDK。请用 -AndroidSdk 指定，或设置环境变量 ANDROID_HOME（目录下应含 platform-tools）。'
}
Write-Ok "Android SDK : $sdk"

$sdkManager = $null
foreach ($ct in @('latest', '8.0')) {
    $p = Join-Path $sdk "cmdline-tools\$ct\bin\sdkmanager.bat"
    if (Test-Path $p) { $sdkManager = $p; break }
}
if (-not $sdkManager -and (Test-Path (Join-Path $sdk 'cmdline-tools'))) {
    $found = Get-ChildItem (Join-Path $sdk 'cmdline-tools') -Recurse -Filter 'sdkmanager.bat' -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($found) { $sdkManager = $found.FullName }
}

# Gradle 用户目录：沿用已有缓存可省下数 GB 重复下载
if (-not $env:GRADLE_USER_HOME) {
    if (Test-Path 'G:\Android\.gradle') { $env:GRADLE_USER_HOME = 'G:\Android\.gradle' }
    else { $env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle' }
}
Write-Info "GRADLE_USER_HOME : $env:GRADLE_USER_HOME"

# ---------------------------------------------------------------------------
# 2. 后端地址注入
# ---------------------------------------------------------------------------
if (-not [string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    Write-Step '写入后端地址'
    # EXPO_PUBLIC_USE_RN_FETCH 必须为 1：Expo SDK 57 原生端默认用 expo/fetch 替换全局 fetch，
    # 而该实现不支持 RN 特有的 FormData 文件写法（{uri,name,type}），会导致上传图片时
    # fetch 直接抛错、表现为「无法连接后端」。详见 expo/src/winter/runtime.native.ts。
    $content = @(
        '# 由 scripts/build-android.ps1 生成：打包时注入到客户端包',
        '# 真机无法访问 127.0.0.1，必须用本机局域网 IP；后端需监听 0.0.0.0',
        "EXPO_PUBLIC_BACKEND_BASE=$BackendBaseUrl",
        '',
        '# 恢复 React Native 内置 fetch（见上方脚本注释），勿删',
        'EXPO_PUBLIC_USE_RN_FETCH=1'
    ) -join [Environment]::NewLine
    Set-Content -LiteralPath $envFile -Value $content -Encoding UTF8
    Write-Ok "已写入 $envFile -> $BackendBaseUrl （含 EXPO_PUBLIC_USE_RN_FETCH=1）"
}

$apiBase = ''
if (Test-Path $envFile) {
    $m = Select-String -LiteralPath $envFile -Pattern '^\s*EXPO_PUBLIC_BACKEND_BASE\s*=\s*(.+?)\s*$'
    if ($m) { $apiBase = $m.Matches[0].Groups[1].Value }
}
if ([string]::IsNullOrWhiteSpace($apiBase)) {
    Write-Warn2 '未设置后端地址，APK 内将使用默认 127.0.0.1:8000（真机连不上后端）'
} else {
    Write-Info "后端地址 : $apiBase"
    $env:EXPO_PUBLIC_BACKEND_BASE = $apiBase
}

# ---------------------------------------------------------------------------
# 3. 生成原生工程
# ---------------------------------------------------------------------------
if ($SkipPrebuild) {
    if (-not (Test-Path $androidDir)) {
        throw "指定了 -SkipPrebuild 但 $androidDir 不存在，请先不带该参数运行一次。"
    }
    Write-Step '跳过 prebuild（复用已有 android 工程）'
} else {
    Write-Step 'expo prebuild（生成原生 Android 工程）'
    Push-Location $mobileDir
    try {
        & node (Join-Path $mobileDir 'node_modules\expo\bin\cli') prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw "expo prebuild 失败（exit $LASTEXITCODE）" }
    } finally { Pop-Location }
    Write-Ok 'prebuild 完成'
}

# ---------------------------------------------------------------------------
# 4. 打镜像补丁（幂等；prebuild 会覆盖，故每次构建都检查）
# ---------------------------------------------------------------------------
Write-Step '应用国内镜像补丁'

# Gradle 脚本含中文（如 rootProject.name = 'AI 错题本'），必须按 UTF-8 无 BOM 读写。
# 曾用 Set-Content -Encoding ASCII，会把非 ASCII 字符替换成 '?'，直接破坏 settings.gradle。
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
function Read-TextFile([string]$Path) { [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false)) }
function Write-TextFile([string]$Path, [string]$Text) { [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom) }

$wrapperProps = Join-Path $androidDir 'gradle\wrapper\gradle-wrapper.properties'
if (Test-Path $wrapperProps) {
    $text = Read-TextFile $wrapperProps
    $patched = $text -replace 'distributionUrl=https\\://services\.gradle\.org/distributions/', 'distributionUrl=https\://mirrors.cloud.tencent.com/gradle/'
    $patched = $patched -replace 'networkTimeout=\d+', 'networkTimeout=180000'
    if ($patched -ne $text) {
        Write-TextFile $wrapperProps $patched
        Write-Ok 'gradle-wrapper.properties -> 腾讯云镜像 + 超时 180s'
    } else { Write-Info 'gradle-wrapper.properties 已是镜像（跳过）' }
} else { Write-Warn2 "未找到 $wrapperProps" }

$settingsGradle = Join-Path $androidDir 'settings.gradle'
if (Test-Path $settingsGradle) {
    $text = Read-TextFile $settingsGradle
    if ($text -match 'aliyun') { Write-Info 'settings.gradle 已含镜像（跳过）' }
    else {
        $block = "  repositories {`n" +
                 "    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }`n" +
                 "    maven { url 'https://maven.aliyun.com/repository/public' }`n" +
                 "    google()`n" +
                 "    mavenCentral()`n" +
                 "  }`n"
        $idx = $text.IndexOf('pluginManagement {')
        if ($idx -lt 0) {
            Write-Warn2 'settings.gradle 无 pluginManagement 块，跳过'
        } else {
            # 从 pluginManagement 的左花括号起配平，找到与之匹配的右花括号
            $depth = 0; $end = -1
            for ($i = $text.IndexOf('{', $idx); $i -lt $text.Length; $i++) {
                if ($text[$i] -eq '{') { $depth++ }
                elseif ($text[$i] -eq '}') { $depth--; if ($depth -eq 0) { $end = $i; break } }
            }
            if ($end -lt 0) {
                throw 'settings.gradle 的 pluginManagement 括号不配平，无法安全插入仓库配置。'
            }
            Write-TextFile $settingsGradle ($text.Substring(0, $end) + $block + $text.Substring($end))
            Write-Ok 'settings.gradle -> 阿里云插件仓库'
        }
    }
}

$buildGradle = Join-Path $androidDir 'build.gradle'
if (Test-Path $buildGradle) {
    $text = Read-TextFile $buildGradle
    if ($text -match 'aliyun') { Write-Info 'build.gradle 已含镜像（跳过）' }
    else {
        $mirrors = "    // 国内镜像优先，避免 Maven Central / Google 直连超时`n" +
                   "    maven { url 'https://maven.aliyun.com/repository/public' }`n" +
                   "    maven { url 'https://maven.aliyun.com/repository/google' }`n"
        $new = $text -replace '(?m)^(\s*)(repositories\s*\{\r?\n)', "`$1`$2$mirrors"
        if ($new -eq $text) {
            throw 'build.gradle 未匹配到 repositories 块，镜像补丁无法应用（模板可能已变更）。'
        }
        Write-TextFile $buildGradle $new
        Write-Ok 'build.gradle -> 阿里云依赖仓库'
    }
}

# ---------------------------------------------------------------------------
# 5. 自定义签名（可选）
# ---------------------------------------------------------------------------
if (-not [string]::IsNullOrWhiteSpace($KeystorePath)) {
    Write-Step '配置自定义签名'
    if (-not (Test-Path $KeystorePath)) { throw "keystore 不存在：$KeystorePath" }
    if ([string]::IsNullOrWhiteSpace($KeyAlias)) { throw '使用自定义 keystore 时必须提供 -KeyAlias' }

    $appGradle = Join-Path $androidDir 'app\build.gradle'
    $text = Get-Content -LiteralPath $appGradle -Raw
    if ($text -match 'errorsetCustomRelease') { Write-Info 'app/build.gradle 已配置自定义签名（跳过）' }
    else {
        $absStore = (Resolve-Path $KeystorePath).Path -replace '\\', '\\\\'
        $signing = "    errorsetCustomRelease {`n" +
                   "      storeFile file(`"$absStore`")`n" +
                   "      storePassword '$KeystorePassword'`n" +
                   "      keyAlias '$KeyAlias'`n" +
                   "      keyPassword '$KeyPassword'`n" +
                   "    }`n"
        $text = $text -replace '(?m)^(\s*)signingConfigs\s*\{\r?\n', "`$0$signing"
        $text = $text -replace '(?m)^(\s*)release\s*\{\r?\n(\s*)signingConfig\s+signingConfigs\.debug', "`$1release {`n`$2signingConfig signingConfigs.errorsetCustomRelease"
        Write-TextFile $appGradle $text
        Write-Warn2 '已改写 app/build.gradle 的 release 签名为自定义 keystore（下次 prebuild 会被覆盖）'
    }
}

# ---------------------------------------------------------------------------
# 6. 补齐 SDK 组件
# ---------------------------------------------------------------------------
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

if ($SkipSdkInstall) {
    Write-Step '跳过 SDK 组件检查'
} elseif (-not $sdkManager) {
    Write-Step 'SDK 组件'
    Write-Warn2 "未找到 sdkmanager，跳过。若构建报缺组件，请手动安装到 $sdk"
} else {
    Write-Step '检查 / 安装 SDK 组件'
    $required = @('platforms;android-36', 'build-tools;36.0.0', 'ndk;27.1.12297006')

    $installed = @()
    if (Test-Path (Join-Path $sdk 'platforms'))   { $installed += (Get-ChildItem (Join-Path $sdk 'platforms')   -Directory).Name | ForEach-Object { "platforms;$_" } }
    if (Test-Path (Join-Path $sdk 'build-tools')) { $installed += (Get-ChildItem (Join-Path $sdk 'build-tools') -Directory).Name | ForEach-Object { "build-tools;$_" } }
    if (Test-Path (Join-Path $sdk 'ndk'))         { $installed += (Get-ChildItem (Join-Path $sdk 'ndk')         -Directory).Name | ForEach-Object { "ndk;$_" } }

    $missing = @($required | Where-Object { $installed -notcontains $_ })
    if ($missing.Count -eq 0) { Write-Ok 'SDK 组件齐备' }
    else {
        foreach ($pkg in $missing) {
            Write-Info "安装 $pkg ..."
            $yes = ('y' + [Environment]::NewLine) * 20
            $yes | & $sdkManager $pkg | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "sdkmanager 安装 $pkg 失败（exit $LASTEXITCODE）" }
            Write-Ok "$pkg 安装完成"
        }
    }
}

# ---------------------------------------------------------------------------
# 7. Gradle 构建
# ---------------------------------------------------------------------------
$task = "assemble$Variant"
$gradlew = Join-Path $androidDir 'gradlew.bat'
Write-Step "Gradle $task （架构 $Arch）"

# Expo CLI 的 env 加载要求 NODE_ENV 已指定，否则告警并只读 .env.local/.env。
# Release 走 production，Debug 走 development，让 bundle 的优化与分支行为正确。
$env:NODE_ENV = if ($Variant -eq 'Release') { 'production' } else { 'development' }

Push-Location $androidDir
try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $gradlew $task "-PreactNativeArchitectures=$Arch" --no-daemon --console=plain
    $code = $LASTEXITCODE
    $sw.Stop()
} finally { Pop-Location }

if ($code -ne 0) { throw "Gradle $task 失败（exit $code），请查看上方日志。" }
Write-Ok ("构建成功，用时 {0:N1} 分钟" -f $sw.Elapsed.TotalMinutes)

# ---------------------------------------------------------------------------
# 8. 收集与校验产物
# ---------------------------------------------------------------------------
Write-Step '校验产物'
$apkDir = Join-Path $androidDir ("app\build\outputs\apk\" + $Variant.ToLower())
$apk = Get-ChildItem $apkDir -Filter '*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) { throw "构建报告成功但未找到 APK：$apkDir" }

$aapt = Get-ChildItem (Join-Path $sdk 'build-tools') -Recurse -Filter 'aapt2.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
if ($aapt) {
    $pkgLine = (& $aapt.FullName dump badging $apk.FullName | Select-String -Pattern '^package:' | Select-Object -First 1).Line
    if ($pkgLine) { Write-Info $pkgLine }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk.FullName)
try {
    $abis = $zip.Entries | Where-Object { $_.FullName -like 'lib/*' } |
            Group-Object { ($_.FullName -split '/')[1] } |
            ForEach-Object { "$($_.Name)($($_.Count))" }
    Write-Info "原生库 ABI : $($abis -join ', ')"

    $bundle = $zip.Entries | Where-Object { $_.FullName -eq 'assets/index.android.bundle' }
    if ($bundle -and $apiBase) {
        $ms = New-Object System.IO.MemoryStream
        $bundle.Open().CopyTo($ms)
        $js = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
        $ms.Dispose()
        if ($js.Contains($apiBase)) { Write-Ok "后端地址已注入 bundle：$apiBase" }
        else { Write-Warn2 "bundle 内未找到 $apiBase，请检查 .env.local 是否生效" }
    }
} finally { $zip.Dispose() }

if ($aapt) {
    $apksigner = Join-Path (Split-Path $aapt.FullName -Parent) 'apksigner.bat'
    if (Test-Path $apksigner) {
        $sig = & $apksigner verify --print-certs $apk.FullName
        if ($LASTEXITCODE -eq 0) {
            $dn = ($sig | Select-String -Pattern 'certificate DN:' | Select-Object -First 1).Line
            Write-Ok ("签名有效：" + ($dn -replace '.*certificate DN:\s*', ''))
        } else { Write-Warn2 '签名校验未通过' }
    }
}

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }
# 清掉同目录下本脚本早期命名的旧产物，避免与本次输出混淆
Get-ChildItem $OutputDir -Filter 'errorset-android-*.apk' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "errorset-android-$Arch-$($Variant.ToLower()).apk" } |
    Remove-Item -Force -ErrorAction SilentlyContinue
$outPath = Join-Path $OutputDir "errorset-android-$Arch-$($Variant.ToLower()).apk"
Copy-Item $apk.FullName $outPath -Force

Write-Step '完成'
Write-Host "  APK  : $outPath" -ForegroundColor Green
Write-Host ("  大小 : {0:N2} MB" -f ((Get-Item $outPath).Length / 1MB))
Write-Host "  变体 : $Variant / $Arch"
if ($apiBase) { Write-Host "  后端 : $apiBase" }
Write-Host ''
Write-Host '  安装：adb install -r "<上面的 APK 路径>"' -ForegroundColor Gray
Write-Host '  提示：Release 使用 Android Debug 证书签名，可直接安装；上架商店需自备 keystore。' -ForegroundColor DarkGray
Write-Host '  提示：真机需与后端在同一网段，且后端监听 0.0.0.0。' -ForegroundColor DarkGray
