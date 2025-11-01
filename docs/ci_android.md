# Android CI

The GitHub Actions workflow builds the Android application and Wear modules while skipping the legacy benchmarking module. To work on the bench module locally, opt in via the environment variable before invoking Gradle:

```bash
INCLUDE_BENCH=true ./gradlew :bench:assembleDebug
```
