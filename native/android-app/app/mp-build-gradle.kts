plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.magnetpulse.app"
    compileSdk = 35

    // 版本号跟随 GitHub Actions 构建序号自动递增（本地构建时为 1）
    val runNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

    // 固定 release 签名：release.keystore 由 workflow 从 Secrets 解码出来，密码从环境变量读。
    // 本地构建没有 keystore 时，assembleRelease 会在签名一步报错；assembleDebug 不受影响。
    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }

    defaultConfig {
        applicationId = "com.magnetpulse.app"
        minSdk = 26
        targetSdk = 35
        versionCode = runNumber
        versionName = "1.0.$runNumber"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.11.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")
    implementation("net.java.dev.jna:jna:5.15.0@aar")
}
