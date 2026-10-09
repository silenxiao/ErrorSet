# AI 错题本 · 移动端（Android / iOS）

React Native + Expo（TypeScript + expo-router）。与 Web 端（frontend/）、微信小程序（miniprogram/）共用同一 FastAPI 后端，界面交互对齐小程序版。

## 运行

```bash
cd mobile
npm install
npx expo start        # 扫码或按平台启动
```

## 后端地址

编辑 `src/api/config.ts` 的 `BACKEND_BASE`（或用环境变量 `EXPO_PUBLIC_BACKEND_BASE` 覆盖）：

- iOS 模拟器：`http://127.0.0.1:8000`
- Android 模拟器：`http://10.0.2.2:8000`
- 真机：Mac 局域网 IP（`ipconfig getifaddr en0` 查询），如 `http://192.168.1.100:8000`，
  并确认后端监听 `0.0.0.0` 而非仅 127.0.0.1

## 构建

### 指定服务器地址打包（Windows）

在仓库根目录运行，地址只填写服务器域名/IP 和端口，不要附加 `/api/v1`：

```powershell
# EAS 云构建 Android APK，首次使用需登录 Expo 账号并关联项目
.\mobile\scripts\build-mobile.cmd -BackendBaseUrl https://api.example.com

# 本地构建 Android Release APK，需已有 Java / Android SDK
.\mobile\scripts\build-mobile.cmd -Mode Local -BackendBaseUrl http://192.168.0.20:8000

# iOS 云构建（需要相应的 Apple 签名凭据）
.\mobile\scripts\build-mobile.cmd -Platform ios -BackendBaseUrl https://api.example.com

# 只校验参数，不启动构建
.\mobile\scripts\build-mobile.cmd -BackendBaseUrl https://api.example.com -DryRun
```

默认 `preview` 为内部安装包，Android 输出 APK；`-Profile production` 用于商店构建。
云构建的服务器地址通过 EAS 构建 profile 注入，构建结束后恢复 `eas.json`。
本地构建复用 `build-android.ps1`，APK 输出在 `mobile/dist`，服务器地址保存至 `.env.local`。
服务器地址会编译进安装包，更换地址后需重新打包。真机地址应使用可访问的域名或局域网 IP。
本地 Release 当前使用调试证书签名，适合内部安装；商店发布请使用正式签名。
本地 APK 默认包含 `arm64-v8a` 和 `x86_64`，兼容 ARM64 真机及 x86_64 模拟器。
可使用 `-Mode Local -Arch arm64-v8a` 仅打包真机架构以减小包体；`-Arch` 仅用于本地构建。

- **Android APK（自用，免签名）**：

  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  npx expo prebuild -p android --no-install
  cd android && ./gradlew assembleDebug
  # 产物: android/app/build/outputs/apk/debug/app-debug.apk
  ```

- **iOS 真机**：`npx expo prebuild -p ios` 后用 Xcode 打开 `ios/*.xcworkspace`，
  免费 Apple ID 签名真机调试（7 天有效）；长期使用需 Apple 开发者账号（¥688/年）或 TestFlight。

## 结构

- `src/api/` — 接口层（fetch 封装 + 登录态存 SecureStore），与 `frontend/src/api/` 保持同构
- `src/types/` — 与 Web 端相同的类型定义
- `src/utils/` — markdown.js / latex.js / analysis.js / bbox.js 直接复用小程序纯 JS 渲染器
- `src/components/` — MdRender（WebView 渲染 Markdown/LaTeX）、BboxEditor（拖拽框选）、QuestionTree、ui
- `src/app/` — expo-router 路由：`(tabs)/exam|bank|mine`、`login`、`recognition/[id]`、`add-wrong/[questionId]`、`models`
