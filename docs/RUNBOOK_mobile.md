# Mobile Build Runbook

This runbook captures the minimal local steps required to match the new split
CI jobs for Android and iOS.

## Android

1. Ensure Java 17 is available (Adoptium Temurin JDK recommended).
2. Install the Android SDK command-line tools and accept all licenses.
3. From the repository root run:
   ```bash
   ./gradlew --stacktrace clean
   ./gradlew assembleDebug -x lint
   ./gradlew lint test
   ```
4. The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

### Common Android Issues

- **SDK components missing** – run `sdkmanager --install "platforms;android-34" "build-tools;34.0.0"` and re-accept licenses.
- **Gradle cache corruption** – delete `~/.gradle/caches` and re-run the build.
- **Stale Kotlin/Java compilation** – use `./gradlew clean` before rebuilding.

### Clean Commands

- `./gradlew clean` removes module build outputs.
- `rm -rf ~/.gradle/caches` clears the global cache (slow, but fixes corrupted caches).

## iOS

1. Install Xcode 15 and ensure the command line tools are selected.
2. Install CocoaPods dependencies:
   ```bash
   brew install cocoapods
   pod install
   ```
3. Build for the simulator to verify settings:
   ```bash
   xcodebuild \
     -workspace GolfIQ.xcworkspace \
     -scheme GolfIQ \
     -sdk iphonesimulator \
     -configuration Debug \
     -showBuildSettings
   ```
4. Simulator builds output to `DerivedData`. Use `xcodebuild -derivedDataPath build/DerivedData` to override.

### Common iOS Issues

- **Pods out of sync** – run `pod deintegrate` followed by `pod install`.
- **Xcode cache issues** – delete `~/Library/Developer/Xcode/DerivedData`.
- **Provisioning profile mismatches** – confirm the active scheme targets a simulator or provide a development team ID.

### Clean Commands

- `xcodebuild clean -workspace GolfIQ.xcworkspace -scheme GolfIQ`
- `rm -rf ~/Library/Developer/Xcode/DerivedData`

## Artifact Reference

- Android: `app-debug.apk` and lint/test reports in `android/app/build/reports`.
- iOS: `xcodebuild.log` generated from `xcodebuild ... | tee xcodebuild.log`.
