# Toolchain Versions

| Component | Version | Notes |
|-----------|---------|-------|
| Xcode | 15.2 | Provides Swift 5.9 toolchain for iOS builds |
| Swift | 5.9 | Recorded for swiftenv/.swift-version |
| Android Studio | Giraffe (2022.3.1) | Ships Android 14 SDK + NDK 26 |
| Gradle | 8.4 | Wrapper pin for Android project |
| Kotlin | 1.9.0 | Matches Gradle plugin requirements |
| Node.js | 18.18.0 | Aligns with web build scripts |
| npm | 9.8.1 | Stored in package-lock.json when generated |

These versions are referenced by bootstrap scripts and CI to ensure reproducible builds.