# MagnetPulse Native — librqbit 跨平台磁力核心与原生安卓端工程

本项目包含基于 Rust **`librqbit`** 引擎的高性能跨平台磁力下载核心（通过 **Mozilla UniFFI** 导出原生绑定），以及 **Kotlin + Jetpack Compose (Material You)** 原生安卓端应用，完整支持：

- **FastResume 断点续传**：开启 `SessionOptions.fastresume = true` 与 `SessionPersistenceConfig::Json`，异常退出或重启后自动恢复分片位图与下载进度。
- **多任务并发队列**：核心调度器维护并发下载槽位，支持置顶、排队、暂停/恢复、单任务与全局限速。
- **动态单文件选择 (`only_files`)**：支持添加前预选与下载中调用 `update_only_files` 动态修改文件下载掩码。
- **Android 前台服务与实时系统通知**：`TorrentForegroundService` 适配 Android 14+ `FOREGROUND_SERVICE_TYPE_DATA_SYNC`，在通知栏实时渲染总速率、进度条与「暂停/继续/取消」快捷操作按钮。
- **网络与电量策略监听**：`NetworkPolicyMonitor` 基于 `ConnectivityManager.NetworkCallback` 与 `BatteryManager` 实现仅 Wi-Fi / 仅充电时自动暂停与恢复。

---

## 编译与运行指南

### 1. 环境准备
- **Rust 工具链**：`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`
- **Cargo NDK**：`cargo install cargo-ndk`
- **Android Studio**：Ladybug / Meerkat 或更新版本（AGP 8.7+，JDK 17，Android NDK r27）

### 2. 编译 Rust 核心动态库并生成 Kotlin 绑定
```bash
cd rust-core

# 1. 交叉编译 Android 各架构 .so 动态库至 jniLibs
cargo ndk \
  -t arm64-v8a \
  -t armeabi-v7a \
  -t x86_64 \
  -o ../android-app/app/src/main/jniLibs \
  build --release

# 2. 生成 UniFFI Kotlin 胶水代码
cargo run --bin uniffi-bindgen generate \
  src/magnet_engine.udl \
  --language kotlin \
  --out-dir ../android-app/app/src/main/java
```

### 3. 构建并安装 Android APK
```bash
cd ../android-app
./gradlew assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
```
