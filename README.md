# Customer Android app (APK)

This wraps your website in a real Android app (Capacitor WebView). The app opens **your live website**, so every website
update reaches customers instantly and you never rebuild the APK for normal changes. Rebuild only to change the app name,
icon, or web address.

**Needs:** your site on **HTTPS** (a normal SSL certificate) and a free GitHub account. Nothing is installed on your PC.

## Make the APK (about 10 minutes, first time)
1. Edit `app.config.json`: `url` = your website (`https://yourdomain.com/`), `appName`, and `appId` (like `com.yourname.store`, never change it later).
2. Put your logo in `assets/`: `icon-only.png` (1024x1024), `icon-foreground.png` + `icon-background.png` (adaptive icon), `splash.png` and `splash-dark.png` (2732x2732). The pictures in there now are placeholders.
3. Create a **private** repository on github.com and upload everything in this folder (drag and drop works).
4. Repository → **Actions** → **Build Android APK** → **Run workflow**. After ~5-8 minutes open the finished run and download **android-apk** (a zip with the .apk).

Without a keystore (step below) you get `store-app-TEST-ONLY.apk`: installs fine for testing.

## Before giving it to customers: sign it with your own key (once)
On any computer with Java: `keytool -genkeypair -v -keystore release.jks -alias store -keyalg RSA -keysize 2048 -validity 10000`
then `base64 -w0 release.jks` (Windows: `certutil -encode`). In the repository → Settings → Secrets and variables → Actions add:
`KEYSTORE_BASE64` (that text), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (store), `KEY_PASSWORD`. The next run produces `store-app.apk`.
**Keep `release.jks` and its passwords safe (backup!).** Lose them and customers cannot update the app, they would have to uninstall it first.

## Giving it to customers
Send the .apk (WhatsApp / your website download link). On the phone they allow "install unknown apps" once for that source.
Android may show a Play Protect note for apps outside the Play Store; that is normal for direct APKs.
A Play Store listing needs a Google developer account ($25 once) and Google can ask for more than a website wrapper, so start with the APK.

## If you already have this repo on GitHub
Update these files only, don't overwrite the others: `scripts/patch-android.js`, `.github/workflows/build-apk.yml`, `package.json`, `package-lock.json`, `README.md`. **Leave `app.config.json`, `google-services.json`, and `assets/` alone** if you already set your app name, package ID, icon or domain there — this zip's copies are generic placeholders and would overwrite your real ones.

## Two kinds of notification — which one you get
- **From the website itself, while the app is open or in the background (not force-closed):** built in, works right now, no setup. Any page of the website can call `window.AndroidNotification.postNotification(title, body, url)` and the phone shows the notification immediately, no server round-trip. The website (`solar-platform-core.zip`, updated) already calls this after an order is placed and after a bank-transfer request is sent — open `public/assets/app.js` and search for `nativeNotify` to see or add more. Calling it when the app isn't installed (plain browser) does nothing and never errors.
- **From the admin panel, reaching the phone even when the app is fully closed:** needs Firebase (below).
Both can be used together — they don't conflict.

## Push notifications (phone notifications from the admin panel, even when the app is closed)
Optional, free. Without the steps below the app works exactly the same, just without this kind of notification.
1. console.firebase.google.com → create a project → add an **Android app** with the same package name as `appId` in `app.config.json`.
2. Download **google-services.json** and upload it to the **top folder** of this repository (next to `app.config.json`). Run the build again: the workflow notices the file and builds push in.
3. Firebase → Project settings → **Service accounts** → *Generate new private key*. Open your admin panel → **Push notifications** → paste the file's text → Save. (This key stays only in your admin panel, never put it on GitHub.)
4. Install the new APK, open it, log in and allow notifications. The phone then shows up under "Phones registered" in the admin page, and you can send a test to your own number.
If the package name in `google-services.json` does not match `appId`, the build stops with a clear message.

## Build on your own PC instead (optional)
Install Node 22, JDK 21 and Android Studio, then: `npm ci`, `node scripts/configure.js`, `npx cap add android`, `node scripts/patch-android.js`, `npx capacitor-assets generate --android`, `npx cap sync android` (for push: `npm install @capacitor/push-notifications@^8` before `cap add`), and open the `android` folder in Android Studio → Build → Build APK.

## What works inside the app
Login by OTP, browsing, cart, wallet, uploading the bank-transfer screenshot / cheque (gallery picker), orders. **Invoices and order documents:** the app saves the PDF and opens the phone's share sheet (open / save / send), because a WebView cannot download the normal way.
Payment pages of the common gateways stay inside the app (list in `scripts/configure.js`). **Test each gateway in the app with a small amount before launch**: UPI-app payments inside a WebView depend on the gateway and on the phone.
No internet → a "Try again" page is shown.

## Not done yet
A Play Store release. It can be added later without changing the website. Push on a real phone still has to be tried once by you (nothing here could be run on a real Android device).
