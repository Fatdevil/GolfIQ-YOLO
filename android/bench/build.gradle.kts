import java.io.File
import java.net.URL
import java.security.MessageDigest
import org.gradle.api.DefaultTask
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import org.gradle.kotlin.dsl.register

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

abstract class DownloadFileTask : DefaultTask() {
    @get:Input
    abstract val sourceUrl: Property<String>

    @get:Input
    @get:Optional
    abstract val sha256: Property<String>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun download() {
        val destination = outputFile.asFile.get()
        if (destination.exists()) {
            if (!sha256.isPresent || destination.sha256() == sha256.get()) {
                logger.lifecycle("Skipping download for ${destination.name}; file already present")
                return
            }
            logger.lifecycle("Checksum mismatch for ${destination.name}; re-downloading")
            destination.delete()
        }
        destination.parentFile?.mkdirs()
        logger.lifecycle("Downloading ${sourceUrl.get()} → ${destination.relativePath()}")
        URL(sourceUrl.get()).openStream().use { input ->
            destination.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        if (sha256.isPresent) {
            val actual = destination.sha256()
            check(actual.equals(sha256.get(), ignoreCase = true)) {
                "Checksum validation failed for ${destination.name}: expected ${sha256.get()} got $actual"
            }
        }
    }

    private fun File.sha256(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        inputStream().use { input ->
            val buffer = ByteArray(16 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString(separator = "") { byte ->
            "%02x".format(byte)
        }
    }

    private fun File.relativePath(): String {
        val projectDirPath = project.projectDir.absolutePath + File.separator
        return if (absolutePath.startsWith(projectDirPath)) {
            absolutePath.removePrefix(projectDirPath)
        } else {
            absolutePath
        }
    }
}

val modelsDir = layout.projectDirectory.dir("src/main/assets/models")

val downloadTfliteBenchmarkModel = tasks.register<DownloadFileTask>("downloadTfliteBenchmarkModel") {
    group = "benchmark"
    description = "Download the benchmark TFLite model"
    sourceUrl.set("https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/object_detection/rpi/lite-model_efficientdet_lite0_detection_metadata_1.tflite")
    sha256.set("2e04c53bfeac0ac2a30c057c7e2a777594ce39baaac35a92f74fb1e8c4fc4e0b")
    outputFile.set(modelsDir.file("benchmark.tflite"))
}

val downloadOrtBenchmarkModel = tasks.register<DownloadFileTask>("downloadOrtBenchmarkModel") {
    group = "benchmark"
    description = "Download the benchmark ONNX model"
    sourceUrl.set("https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.onnx")
    sha256.set("04f0e55c26f58d17145b36045780fe1250d5bd2187543e11568e5141d05b3262")
    outputFile.set(modelsDir.file("benchmark.onnx"))
}

val downloadNcnnParam = tasks.register<DownloadFileTask>("downloadNcnnBenchmarkParam") {
    group = "benchmark"
    description = "Download the benchmark NCNN param file"
    sourceUrl.set("https://github.com/nihui/ncnn-assets/raw/master/models/yolov5n.param")
    sha256.set("ba282abbf12eac9911b44ddebdfded964663e557c6c951a5da1d4db9ade3c1dd")
    outputFile.set(modelsDir.file("benchmark.param"))
}

val downloadNcnnBin = tasks.register<DownloadFileTask>("downloadNcnnBenchmarkBin") {
    group = "benchmark"
    description = "Download the benchmark NCNN binary weights"
    sourceUrl.set("https://github.com/nihui/ncnn-assets/raw/master/models/yolov5n.bin")
    sha256.set("a9821e8d65ea683daf4adb6d5939390283ee52d0a0bf14b1baf1037bcf70ee5d")
    outputFile.set(modelsDir.file("benchmark.bin"))
}

tasks.register("downloadBenchAssets") {
    group = "benchmark"
    description = "Download all benchmark models required for runtime comparisons"
    dependsOn(
        downloadTfliteBenchmarkModel,
        downloadOrtBenchmarkModel,
        downloadNcnnParam,
        downloadNcnnBin,
    )
}
