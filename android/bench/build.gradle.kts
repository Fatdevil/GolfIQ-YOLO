plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.golfiq.bench"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.golfiq.bench"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        val telemetryBaseUrl = project.providers.gradleProperty("benchTelemetryBaseUrl")
            .orElse("http://10.0.2.2:8080")
        buildConfigField("String", "TELEMETRY_BASE_URL", "\"${telemetryBaseUrl.get()}\"")
        buildConfigField("boolean", "ENABLE_VM_STRICT_MODE", "false")
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
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
        buildConfig = true
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
        }
    }

    packaging {
        resources {
            excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE", "META-INF/LICENSE.txt", "META-INF/NOTICE", "META-INF/NOTICE.txt")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.10.0")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-gpu:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-select-tf-ops:2.14.0")
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.16.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
