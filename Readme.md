# SplitTrip for Ionic React

This is a second client for the existing SplitTrip Flutter app. It includes an installable web app and a Capacitor Android app. The React source, Android package, build outputs and local test fixtures all live in this repository.

## Run with your existing SplitTrip account

Install Node.js 22.12 or newer and npm. From this directory run

```sh
npm ci
npm start
```

Open [SplitTrip](http://localhost:4173) and choose **Sign in with Google**. Use the Google account you use in Flutter. The web app reads and writes that account’s trips, expenses and memberships in Firebase project `splittrip-1879b`. The project authorizes the hostname `localhost` for Google sign-in. `npm run local` starts the same app. `npm run dev` also connects to the real backend.

## Connect to the existing backend

The release build uses the public web registration from Flutter’s Firebase configuration for project `splittrip-1879b`. Signing in through the same Google account uses its existing Firebase user ID. Trips, profiles and transactions use the original collections directly. The React client requires no data migration or deployment of new Functions. Hosting has a separate named target, `react`, so the project owner can choose a separate web origin when ready.

| Feature | Flutter-compatible behavior |
| --- | --- |
| Trip and ledger | React reads and writes the same trip, expense and contribution documents. Amounts are stored in rupees. Existing fractional splits, Firebase timestamps, settlement records and membership maps are supported. |
| Balances and budget | The summary follows the Flutter pool calculation. In the seeded example, Asha pays ₹120 and Bharat contributes ₹60. Asha is owed ₹60, Bharat settles at ₹0 and Charu owes ₹60. A repayment updates the personal balances while total spending stays ₹120. |
| Collaboration | The client uses the original invitation fields, inbox, broadcast and feedback collections. The admin account, suspension flag, notification recipients, and single FCM token per user follow the existing app and rules. |
| Device and navigation | Flutter web hash links and direct trip links work. The web app caches visited pages and queued ledger changes per signed-in user. Android includes native Google authentication, system accent colors, notifications and a separate React APK update channel. |

Use `npm run build` to create the release web bundle in `dist/`. Before using real Google sign-in on a new web origin, authorize that origin in the existing Firebase project. For web push, supply the existing project's public Web Push certificate in `VITE_FIREBASE_VAPID_KEY`. Real device delivery needs Firebase credentials and network access. Android uses its own package and signing identity. [Android build and device setup](android/README.md)

## Verify

```sh
npm test
npm run test:emulator
```

Install Java 21 and run `npm ci --prefix functions` for emulator tests. The emulator test starts a fresh suite and needs free emulator ports. The unit and integration tests cover the source app’s formulas, original document shapes, concurrent updates, invitations, notification triggers and recovery. To run browser checks, start the isolated test app with `npm run demo` in another terminal, then run

```sh
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:engines
npm run test:perf
```

Set `SPLITTRIP_SYSTEM_CHROME=1` to use an installed Google Chrome for the Chromium and timing checks. The test app serves its own bundle from `dist-emulator/` on port 4175. Browser tests write fixtures to the local emulator. The timing suite measures two browser sessions with 20 trips and 500 expenses and saves measurements in `test-results/performance/`. Real Firebase sign-in, production latency, device delivery and a signed upgrade from a published React release require separate release testing.
