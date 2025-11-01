import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "GolfIQBench"

include(":app")
project(":app").projectDir = File(rootDir, "app")

include(":wear")
project(":wear").projectDir = File(rootDir, "wear")

val includeBench = providers.environmentVariable("INCLUDE_BENCH").orNull == "true"
if (includeBench) {
    include(":bench")
    project(":bench").projectDir = File(rootDir, "bench")
}
