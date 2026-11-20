# SplitTrip ✈️💸

A modern travel expense tracker and group bill-splitting app built with **React**, **Ionic**, and **Firebase**, packaged for Android with **Capacitor**.

SplitTrip makes traveling with friends stress-free by handling all the group math. Whether you're splitting hotel stays, cab rides, food, or group activities, SplitTrip tracks who paid, calculates the split, and minimizes the transactions needed so everyone settles up easily.

Developed as a semester project for our **Mobile Application Development** course.

---

### 📲 How to Use SplitTrip

- 🍏 **For iOS Users (Web PWA)**: Open **[splittrip.ansh.one](https://splittrip.ansh.one)** in Safari $\rightarrow$ tap **Share** $\rightarrow$ select **"Add to Home Screen"** for an installable, standalone app experience with full offline support.
- 🤖 **For Android Users (Native APK Only)**: Download and install the native Android APK package. *(Android web visits automatically redirect to the product site to download the APK, as the native build provides a significantly better mobile experience with native Google Credential Manager, system dynamic colors, and notifications).*

---

## ✨ Features

- 👥 **Group Trips & Members**: Create trips and invite friends with invite codes or shareable links.
- 💰 **Smart Expense Splitting**: Add expenses in rupees (₹), pick who paid, and split equally or customize shares among trip members.
- ⚖️ **Automatic Debt Settlement**: Built-in debt simplification calculates who owes whom with the minimum number of payments—no awkward mental math.
- 📱 **Platform-Optimized Experience**:
  - **iOS**: Lightweight Web PWA at [splittrip.ansh.one](https://splittrip.ansh.one) with home-screen install and offline caching.
  - **Android**: Native APK built with Capacitor for performance, dynamic theming, and push notifications.
- 🎨 **Clean & Modern UI**: Built with Ionic components and Material You dynamic color styling with full Dark Mode support.
- 📴 **Offline-Friendly**: Client caching and local storage ensure you can still check your balances and view trips even with spotty travel internet.
- 🔒 **Firebase Authentication & Firestore**: Secure Google Sign-In with real-time Firestore database synchronization.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Ionic 9, React Router 6
- **Mobile & Packaging**: Capacitor 7 (Android)
- **Styling**: Ionic CSS Variables, Material Dynamic Theme
- **Backend & Database**: Firebase (Firestore, Authentication, Cloud Functions)
- **Build Tool**: Vite
- **Testing**: Vitest (Unit Tests), Playwright (E2E & Performance Tests)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v20+ or v22 LTS recommended)
- **npm** (included with Node.js)
- *(Optional for Android)*: JDK 21 and Android Studio / Android SDK

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/gurjaskaur0990-dotcom/mobile_app_dev.git
   cd mobile_app_dev
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and add your Firebase credentials:
   ```bash
   cp .env.example .env
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser!

To build and preview the production bundle locally:
```bash
npm run start
```
Then visit [http://localhost:4173](http://localhost:4173).

---

## 🧪 Testing

Automated unit, emulator, and browser end-to-end tests:

```bash
# Run unit tests with Vitest
npm test

# Run Firebase emulator integration tests
npm run test:emulator

# Run browser tests with Playwright
npm run test:browser
```

---

## 📱 Android App (Capacitor)

To build the Android application:

1. Build the web assets:
   ```bash
   npm run build:android
   ```
2. Build with Gradle or open in Android Studio:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
The output APK will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`.  
*(For more details on Android setup and signing, see [android/README.md](android/README.md))*

---

## 👥 Contributors

This project was built collaboratively by our team:

- **[Ansh Sharma](https://github.com/07-Ansh)** — Platform architecture, Firebase integration, and test suite.
- **[Gurjas Kaur](https://github.com/gurjaskaur0990-dotcom)** — UI/UX design, Ionic components, and PWA configuration.
- **[Saurabh Vishwakarma](https://github.com/SaurabhVishwakarma22)** — Ledger algorithms, debt settlement calculations, and emulator fixtures.

---

## 📄 License

This project is created for educational and academic coursework purposes.
