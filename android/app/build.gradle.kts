plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.golfiq"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.golfiq"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].java.srcDir("../shared/playslike")

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.fragment:fragment-ktx:1.6.2")
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("com.google.android.material:material:1.11.0")
    implementation("com.google.android.gms:play-services-base:18.4.0")
    implementation("com.google.android.gms:play-services-location:21.2.0")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("com.google.ar:core:1.44.0")
    implementation("com.gorisse.thomas.sceneform:sceneform:1.23.0")
    implementation("io.sentry:sentry-android:7.13.0")
    implementation("com.facebook.react:react-android:0.73.0")
}
