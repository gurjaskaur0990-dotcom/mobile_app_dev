# SplitTrip Android App

The Capacitor app uses the Android package `com.splittrip.react` and connects to the SplitTrip Firebase backend.

## Firebase setup

Sign in to the Firebase CLI with your account. Enable the Google provider in Authentication settings if needed. With Android SDK Build Tools 35.0.0 on macOS or Linux, build the debug APK once using the instructions below. From the project root, run:

```sh
npm run firebase:android
```

This checks the APK package and signer against Gradle, verifies the `com.splittrip.react` registration, and adds SHA-1 and SHA-256 fingerprints. It verifies both the web and Android OAuth clients before saving the configuration to `android/app/google-services.json`. Rebuild the APK to include the registration.

Use `npm run firebase:android -- --check-apk` for the local signing check by itself. For another signed APK, use `npm run firebase:android -- --apk /path/to/release.apk`. When using Google Play App Signing, register the Play-distributed signing certificate as well.

Google Credential Manager uses the generated web OAuth client ID. Firebase Authentication exchanges the returned Google ID token and restores the user session. Native FCM uses the Android registration. Cloud Functions deliver background messages on `high_importance_channel`. Foreground notifications use the quiet `low_importance_channel`. Opening a notification navigates directly to the relevant trip.

## Build

Install JDK 21, Android SDK Platform 35, Build Tools 35.0.0 and Platform Tools. From the project root, build and copy the web assets and plugins before assembling the package:

```sh
npm install
npm run build:android
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

The package is written to `app/build/outputs/apk/debug/app-debug.apk`.

### Local Android demo

The `local` build uses a separate package, `com.splittrip.react.local`, with emulator accounts. Run the following from the project root:

```sh
npm run build:android:local
cd android
./gradlew :app:assembleLocal
```

Start the local Firebase emulators and seed the demo data. For an Android emulator or USB-connected development device, reverse TCP ports `9099` (Auth) and `8080` (Firestore) with `adb reverse tcp:9099 tcp:9099` and `adb reverse tcp:8080 tcp:8080`. Install `app/build/outputs/apk/local/app-local.apk` to test locally.

## Release updates

Use a dedicated Android release signing key and increment the version code on each release. Android Studio's **Generate Signed Bundle / APK** flow can sign the package. Pass values such as `-PsplitTripVersionCode=2 -PsplitTripVersionName=1.1.0` when building a new version. Publish the signed single APK as `splittrip-react-v1.1.0.apk` on GitHub releases.

For sideloaded updates, the app checks the release URL, package identity, installed signing certificate set, and version code, prompting the user with a confirmation before opening Android's package installer.

## Device checks

On an Android device with Google Play Services, sign in with your Google account and open a trip. On Android 12 or later, select dynamic wallpaper theme to inspect the accent colors. With notification permissions granted, test sending a trip event and open notifications across foreground, background, and closed app states.
