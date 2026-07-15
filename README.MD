# Big Scroll

Big Scroll is a lightweight, iPhone-first Wikipedia feed built from
[terrakok/WikWok](https://github.com/terrakok/WikWok). The deployed web surface lives in
`site/`: it has no logo, About menu, or language menu, and retains only the per-article
like action and device-local Likes collection.

The personalized order is derived entirely from the articles saved in
`big-scroll.likes.v1` in the browser's `localStorage`. It uses established methods:

- Rocchio positive relevance feedback (J. J. Rocchio, *The SMART Retrieval System*, 1971)
- signed feature hashing ([Weinberger et al., ICML 2009](https://doi.org/10.1145/1553374.1553516))
- epsilon-greedy exploration (Sutton and Barto, *Reinforcement Learning*, 2nd ed., section 2.2)

There is no server-side profile, account, database, analytics SDK, or paid hosting. GitHub
Actions tests the recommendation model and deploys `site/` to free GitHub Pages hosting.

Run locally with:

```sh
python3 -m http.server 4173 --directory site
node --test web-tests/*.test.mjs
```

## Upstream WikWok

https://github.com/user-attachments/assets/a131ab28-fc53-4e3b-81d8-8e1276ae5b36

> Wikipedia meets TikTok: Knowledge that keeps you scrolling

### 📱 About WikWok

WikWok is a beautiful and functional app that transforms your Wikipedia reading experience into an engaging, TikTok-style article feed. Learn something new with every scroll!

## ✨ Features

- **Beautiful Interface**: Clean, modern design focused on readability
- **TikTok-Style Feed**: Scroll through Wikipedia articles in an intuitive, engaging format
- **Cross-Platform**: Available on iOS, Android, Macos, Windows, Linux and web platforms
- **Completely Free**: No subscriptions, no ads, just knowledge
- **Open Source**: Community-driven development welcomes contributions

## ☕ Support the Developer

<p align="center">
  <a href="https://www.buymeacoffee.com/terrakok" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-green.png" alt="Buy Me A Coffee" width="200"></a>
</p>

If you enjoy WikWok and want to support its development, consider buying me a coffee. Your support helps keep this project free and open-source!

## 🚀 Getting Started

### Installation

Download WikWok from your preferred app store:

- [Google Play](https://play.google.com/store/apps/details?id=com.github.terrakok.wikwok.androidApp)
- [Desktop (Macos/Linux/Windows)](https://github.com/terrakok/WikWok/releases)
- [Web App](https://terrakok.github.io/WikWok/)
- ~~App Store: IN PROGRESS~~
  Did you know that Apple is asking for 99 USD **per year** to put the app out to users in AppStore!
  A year, Carl! A free opensource app!
  I'm waiting for alternate stores, in the meantime, there's a way to install PWA:
  - open https://terrakok.github.io/WikWok/ on your iOS device
  - click on the share button
  - select "Add to Home screen"

https://github.com/user-attachments/assets/72e03e0b-280c-4247-94d5-6840b3ede31f


Or build it yourself from source!

## 🛠️ Development

### Prerequisites
 - check your system with [KDoctor](https://github.com/Kotlin/kdoctor)
 - install JDK 17 or higher on your machine
 - add `local.properties` file to the project root and set a path to Android SDK there

### Android
To run the application on android device/emulator:
 - open project in Android Studio and run imported android run configuration

To build the application bundle:
 - run `./gradlew :androidApp:assembleDebug`
 - find `.apk` file in `androidApp/build/outputs/apk/debug/androidApp-debug.apk`

### Desktop
Run the desktop application: `./gradlew :desktopApp:run`  
Run the desktop **hot reload** application: `./gradlew :desktopApp:hotRun --auto`

### iOS
To run the application on iPhone device/simulator:
 - Open `iosApp/iosApp.xcproject` in Xcode and run standard configuration
 - Or use [Kotlin Multiplatform Mobile plugin](https://plugins.jetbrains.com/plugin/14936-kotlin-multiplatform-mobile) for Android Studio

### Wasm Browser
Run the browser application: `./gradlew :webApp:wasmJsBrowserDevelopmentRun`

## 🧑‍💻 Idea
Inspiration and idea were seen in the web-application [wikitok](https://wikitok.vercel.app/)
