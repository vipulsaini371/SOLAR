// Run after `npx cap add android`: notification icon/colour, and Firebase config if google-services.json is in the project.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync('app.config.json', 'utf8'));
const res = 'android/app/src/main/res', manifest = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(manifest)) { console.error('android/ folder not found: run "npx cap add android" first'); process.exit(1); }

// 1. small white icon shown in the phone's status bar for notifications
if (fs.existsSync('android-res')) for (const d of fs.readdirSync('android-res')) {
  fs.mkdirSync(path.join(res, d), { recursive: true });
  for (const f of fs.readdirSync(path.join('android-res', d))) fs.copyFileSync(path.join('android-res', d, f), path.join(res, d, f));
}
fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(path.join(res, 'values', 'notify_colors.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="notify_color">${cfg.themeColor || '#84f04c'}</color></resources>\n`);
let m = fs.readFileSync(manifest, 'utf8');
if (!m.includes('POST_NOTIFICATIONS')) m = m.replace('<application', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application');
fs.writeFileSync(manifest, m);
if (!m.includes('default_notification_icon')) {
  m = m.replace('</application>', `    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notify_color" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="default" />
    </application>`);
  fs.writeFileSync(manifest, m);
}

// 2. Website -> App bridge: window.AndroidNotification.postNotification(title, body, url)
// Lets the WEBSITE trigger a notification itself while the app is open/foreground/background (not killed) -
// e.g. right after an order is placed. This is separate from Firebase push (which also works when the app is
// fully closed) - the two are independent and both can be used together.
const pkg = cfg.appId, pkgPath = pkg.split('.').join('/');
const javaDir = path.join('android/app/src/main/java', pkgPath);
if (!fs.existsSync(javaDir)) { console.error('CONFIG ERROR: expected ' + javaDir + ' - run "npx cap add android" first.'); process.exit(1); }
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package ${pkg};

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.Manifest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new AndroidNotificationBridge(this, MainActivity.class), "AndroidNotification");
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9100);
        handleTargetUrl(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTargetUrl(intent);
    }

    private void handleTargetUrl(Intent intent) {
        if (intent == null) return;
        final String url = intent.getStringExtra("target_url");
        if (url != null && !url.isEmpty()) getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
`);
fs.writeFileSync(path.join(javaDir, 'AndroidNotificationBridge.java'), `package ${pkg};

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Called from the website's own JavaScript while the app is open (foreground or background, not force-closed):
 *   if (window.AndroidNotification) window.AndroidNotification.postNotification(title, body, targetUrl);
 * targetUrl may be empty/null - the app then just opens to whatever page it was already on.
 * This is separate from Firebase Cloud Messaging (Admin > Push notifications), which also works when the app
 * is fully closed; the two do not conflict and can both be used.
 */
public class AndroidNotificationBridge {
    private static final String CHANNEL_ID = "default";
    private static int nextId = 9200;
    private final Context ctx;
    private final Class<?> activity;

    public AndroidNotificationBridge(Context ctx, Class<?> activity) { this.ctx = ctx; this.activity = activity; }

    @JavascriptInterface
    public void postNotification(String title, String body, String targetUrl) {
        if (title == null) title = "";
        if (body == null) body = "";
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Website notifications", NotificationManager.IMPORTANCE_HIGH));

        Intent intent = new Intent(ctx, activity);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (targetUrl != null && !targetUrl.isEmpty()) intent.putExtra("target_url", targetUrl);
        int id = nextId++;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, intent, flags);

        int iconRes = ctx.getResources().getIdentifier("ic_stat_notify", "drawable", ctx.getPackageName());
        if (iconRes == 0) iconRes = ctx.getApplicationInfo().icon;

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        try { NotificationManagerCompat.from(ctx).notify(id, b.build()); } catch (SecurityException ignored) { /* notification permission not granted yet */ }
    }
}
`);
console.log('Website -> App bridge (window.AndroidNotification) added.');

// 3. Firebase: only when the file is there (the push plugin itself is added by the workflow in the same case)
if (fs.existsSync('google-services.json')) {
  const g = JSON.parse(fs.readFileSync('google-services.json', 'utf8')), pk = (g.client || []).map(c => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name);
  if (!pk.includes(cfg.appId)) { console.error('\nCONFIG ERROR: google-services.json is for the app "' + pk.join(', ') + '" but appId in app.config.json is "' + cfg.appId + '". In Firebase add an Android app with exactly this package name and download google-services.json again.\n'); process.exit(1); }
  fs.copyFileSync('google-services.json', 'android/app/google-services.json'); console.log('Firebase: google-services.json copied, push notifications are built in.'); }
else console.log('Firebase: no google-services.json found, building without push notifications.');
