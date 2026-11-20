<div align="center">

<a href="https://splittrip.ansh.one">
  <img src="assets/LOGO.png" width="120" alt="SplitTrip Logo" />
</a>

<h1>SplitTrip</h1>

<p><strong>Split travel expenses. Settle debts. Stay in sync.</strong></p>

<p>
  <a href="https://splittrip.ansh.one">
    <img src="https://img.shields.io/badge/🌐%20Try%20it%20Live-splittrip.ansh.one-56AB83?style=for-the-badge" alt="Live Web App" />
  </a>
  &nbsp;
  <a href="../../releases/latest">
    <img src="https://img.shields.io/badge/📦%20Download-Latest%20APK-02569B?style=for-the-badge" alt="Download APK" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Platform-Android%20%7C%20iOS%20PWA-02569B?style=flat-square&logo=android&logoColor=white" alt="Platform" />
  &nbsp;
  <img src="https://img.shields.io/badge/Free-No%20Ads-56AB83?style=flat-square" alt="Free" />
  &nbsp;
  <img src="https://img.shields.io/badge/Real--time-Firebase%20Sync-FFCA28?style=flat-square&logo=firebase&logoColor=black" alt="Firebase" />
  &nbsp;
  <img src="https://img.shields.io/badge/PWA-Installable-8A2BE2?style=flat-square&logo=pwa&logoColor=white" alt="PWA" />
</p>

</div>

---

<div align="center">

### No more IOUs. No more awkward "you owe me" conversations.
SplitTrip automatically figures out who owes who — and the smartest way to settle up.

</div>

---

## Table of Contents

- [Screenshots](#-screenshots)
- [Features](#-what-splittrip-does)
- [Tech Stack](#-tech-stack)
- [How It Works](#️-how-it-works)
- [Privacy & Security](#-privacy--security)
- [Contributors](#-contributors)
- [Changelog](#-changelog)

---

## 📱 Screenshots

> Click any screenshot to view it full size.

### Home & Group Trips

<div align="center">

| Home | Members | Expenses |
|:---:|:---:|:---:|
| <a href="assets/home1.png"><img src="assets/home1.png" width="210" alt="Home Screen" /></a> | <a href="assets/Members.png"><img src="assets/Members.png" width="210" alt="Members" /></a> | <a href="assets/expenses.png"><img src="assets/expenses.png" width="210" alt="Expenses" /></a> |

</div>

### Finance, Budget & Analytics

<div align="center">

| Summary & Balances | Analytics | Budget Tracker |
|:---:|:---:|:---:|
| <a href="assets/summary.png"><img src="assets/summary.png" width="210" alt="Balance Summary" /></a> | <a href="assets/Analytics.png"><img src="assets/Analytics.png" width="210" alt="Analytics" /></a> | <a href="assets/Budget.png"><img src="assets/Budget.png" width="210" alt="Budget" /></a> |

</div>

### Profile & More

<div align="center">

| Profile | Recently Deleted | About |
|:---:|:---:|:---:|
| <a href="assets/profile.png"><img src="assets/profile.png" width="210" alt="Profile" /></a> | <a href="assets/Recently-deleted-expenses.png"><img src="assets/Recently-deleted-expenses.png" width="210" alt="Recently Deleted" /></a> | <a href="assets/About.png"><img src="assets/About.png" width="210" alt="About" /></a> |

</div>

---

## ✨ What SplitTrip Does

### 💸 Track Every Expense Instantly
Add an expense in seconds — who paid, how much, and who it's split between. SplitTrip does the math automatically and updates everyone's balance in real time.

### 🧠 Smart Auto-Settlement
Forget the spreadsheet. SplitTrip calculates the **minimum number of payments** needed to settle all debts in the group — so instead of 10 confusing transfers, you might need just 3.

### 📊 See the Full Picture
Get a clear breakdown of who owes what, how spending is distributed across the group, and where your money is going — all in one glance.

### 🎯 Set & Track a Budget
Define a trip budget, assign contributions per member, and watch the tracker fill up as expenses are added. Over-budget alerts keep the group on track.

### 🔄 Real-Time Sync
Every expense, every settlement, every change — synced instantly across all devices the moment it happens. No refreshing, no waiting.

### 🗑️ Soft Delete with Undo
Accidentally deleted an expense? SplitTrip moves it to **Recently Deleted** where you can restore it any time. Nothing is gone forever unless you choose it to be.

### 🔔 Push Notifications
Get notified when a trip member adds an expense or settles a debt — even when the app is closed.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Ionic 9, React Router 6
- **Mobile Packaging**: Capacitor 7 (Android)
- **Styling**: Ionic CSS Variables, Material Dynamic Theme
- **Backend & Database**: Firebase (Firestore, Authentication, Cloud Functions)
- **Build Tool**: Vite
- **Testing**: Vitest (Unit Tests), Playwright (E2E & Performance Tests)

---

## 🗺️ How It Works

| Step | Action |
|:---:|:---|
| **1** | Create a trip and give it a name & budget |
| **2** | Invite friends — they join instantly with your trip code |
| **3** | Log expenses — who paid, how much, who it's split between |
| **4** | Check live balances — see exactly who owes who |
| **5** | Settle up — record payments to clear all debts |

---

## 🔐 Privacy & Security

| | |
|:---|:---|
| 🔑 **Authentication** | Google Sign-In only — no passwords ever stored |
| 🗄️ **Data Storage** | Secured in Firebase Firestore with strict access rules |
| 🔒 **Access Control** | Only trip members can view or modify trip data |
| 🚫 **No Tracking** | Zero ads, zero analytics, zero third-party data sharing |

---

## 👥 Contributors

This project was built collaboratively by our team:

- **[Ansh Sharma](https://github.com/07-Ansh)** — Platform architecture, Firebase integration, and test suite.
- **[Gurjas Kaur](https://github.com/gurjaskaur0990-dotcom)** — UI/UX design, Ionic components, and PWA configuration.
- **[Saurabh Vishwakarma](https://github.com/SaurabhVishwakarma22)** — Ledger algorithms, debt settlement calculations, and emulator fixtures.

---

## 📋 Changelog

### [v1.0.0](../../releases/tag/v1.0.0) — Initial Release

- ✅ Core expense tracking with real-time Firebase sync
- ✅ Smart auto-settlement engine (minimum transactions)
- ✅ Budget tracking with per-member contributions
- ✅ Google Sign-In authentication
- ✅ Push notifications via Firebase Cloud Messaging
- ✅ Archive & Recently Deleted screens with restore
- ✅ Material 3 design with full dark mode support
- ✅ Progressive Web App (PWA) with offline caching & auto-updates

---

<div align="center">

**Built with [React](https://react.dev), [Ionic](https://ionicframework.com), [Capacitor](https://capacitorjs.com) & [Firebase](https://firebase.google.com)**

Made with ❤️ by **Ansh Sharma**, **Gurjas Kaur** & **Saurabh Vishwakarma**

</div>
