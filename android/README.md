# SplitTrip React for Android

The Capacitor app uses the Android package `com.splittrip.react` and the existing SplitTrip Firebase project. The distinct package name allows installation alongside Flutter.

## Firebase setup

Sign in to the Firebase CLI with an account that can manage apps in `splittrip-1879b`. Enable the Google provider in the existing project's Authentication settings if needed. With Android SDK Build Tools 35.0.0 on macOS or Linux, build the debug APK once using the instructions below. From the React project root, run

```sh
npm run firebase:android
```

This checks the APK package and signer against Gradle, reuses or creates the `com.splittrip.react` registration, and adds missing SHA-1 and SHA-256 fingerprints. It verifies both the web and Android OAuth clients in the downloaded configuration before saving it to `android/app/google-services.json`. Rebuild the APK with the same key to include the registration. The command is safe to rerun after Firebase permissions or Google sign-in settings change.

Use `npm run firebase:android -- --check-apk` for the local signing check by itself. For another signed APK, use `npm run firebase:android -- --apk /path/to/release.apk`. When using Google Play App Signing, register the Play-distributed signing certificate as well.

Google Credential Manager uses the generated web OAuth client ID. Firebase Authentication on the React side exchanges the returned Google ID token and restores the existing UID. Native FCM uses the same Android registration. The original Flutter Functions deliver background messages on `high_importance_channel`. Foreground notifications use the quiet `low_importance_channel`. Opening a notification sends its trip ID through the signed-in React navigation.

## Build

Install JDK 21, Android SDK Platform 35, Build Tools 35.0.0 and Platform Tools. From the React project root, build and copy the web assets and plugins before assembling the package.

```sh
npm ci
npm run build:android
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

The package is written to `app/build/outputs/apk/debug/app-debug.apk`. Without the React Android registration, the debug shell builds and identifies missing Google sign-in or push configuration when those features are requested.

### Local Android demo

The `local` build uses a separate package, `com.splittrip.react.local`, with emulator accounts. Use Android 7 or later for per-domain loopback access. Run the following from the React project root.

```sh
npm run build:android:local
cd android
./gradlew :app:assembleLocal
```

Start the local Firebase emulators and seed the demo from the React project. For an Android emulator or USB-connected development device that you select, reverse TCP ports `9099` (Auth) and `8080` (Firestore) to your computer with `adb reverse tcp:9099 tcp:9099` and `adb reverse tcp:8080 tcp:8080`. Install `app/build/outputs/apk/local/app-local.apk` and use one of the local account buttons. The local build permits loopback HTTP for emulator traffic.

## Release updates

Use a dedicated Android release signing key and increment the version code on each release. Android Studio's **Generate Signed Bundle / APK** flow can sign the package. Pass values such as `-PsplitTripVersionCode=2 -PsplitTripVersionName=1.1.0` when building a new version. Publish the signed single APK as `splittrip-react-v1.1.0.apk` on a release in `gurjaskaur0990-dotcom/mobile_app_dev`.

For a sideloaded update, the app checks the release URL, the package identity, the installed signing certificate set, and the version code. It shows a confirmation, then opens Android's package installer. Android may prompt the user to allow installs from this app. Switching from a debug key to a production key requires uninstalling the debug app first.

## Device checks

On an Android device with Google Play Services, sign in with an existing SplitTrip Google account and open a known trip. On Android 12 or later, select the wallpaper theme and inspect the accent. With notification permission granted, send a trip event from another client and open the resulting notification while the app is foregrounded, backgrounded, and closed. Exercise the updater against two successively versioned test releases signed with the same test key.
