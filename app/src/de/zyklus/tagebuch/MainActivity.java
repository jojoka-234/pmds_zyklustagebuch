package de.zyklus.tagebuch;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQ_SAVE = 10;
    private static final int REQ_OPEN = 11;
    private static final int REQ_NOTIF = 12;

    private WebView web;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#8A1538"));
        getWindow().setNavigationBarColor(Color.parseColor("#FFFFFF"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        Reminder.schedule(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getBooleanExtra("openToday", false)) js("window.app && app.goToday()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        js("window.app && app.onResume()");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.app ? app.handleBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    private void js(final String code) {
        if (web == null) return;
        web.post(new Runnable() {
            @Override
            public void run() { web.evaluateJavascript(code, null); }
        });
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SAVE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                out.write(bytes);
                toast("Gespeichert");
            } catch (Exception e) {
                toast("Speichern fehlgeschlagen: " + e.getMessage());
            }
        } else if (requestCode == REQ_OPEN) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                String text = new String(Store.readAll(in), StandardCharsets.UTF_8);
                js("app.onBackupImported(" + JSONObject.quote(text) + ")");
            } catch (Exception e) {
                toast("Öffnen fehlgeschlagen: " + e.getMessage());
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_NOTIF) js("app.refreshReminderStatus()");
    }

    private void saveAs(final byte[] bytes, final String filename, final String mime) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                pendingSave = bytes;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(i, REQ_SAVE);
            }
        });
    }

    private void share(final byte[] bytes, final String filename, final String mime) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    File f = new File(ShareProvider.dir(MainActivity.this), filename);
                    try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                    Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(filename));
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.setClipData(ClipData.newRawUri(filename, uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "Teilen"));
                } catch (Exception e) {
                    toast("Teilen fehlgeschlagen: " + e.getMessage());
                }
            }
        });
    }

    /** Methods callable from JavaScript as window.Android.* */
    private class Bridge {
        @JavascriptInterface public String load() { return Store.read(MainActivity.this); }

        @JavascriptInterface public boolean save(String json) { return Store.write(MainActivity.this, json); }

        @JavascriptInterface
        public String getReminder() {
            try {
                JSONObject o = new JSONObject();
                o.put("enabled", Reminder.isEnabled(MainActivity.this));
                o.put("hour", Reminder.hour(MainActivity.this));
                o.put("minute", Reminder.minute(MainActivity.this));
                o.put("exact", Reminder.canExact(MainActivity.this));
                o.put("notifAllowed", notificationsAllowed());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void setReminder(boolean enabled, int hour, int minute) {
            Reminder.save(MainActivity.this, enabled, hour, minute);
            if (enabled && !notificationsAllowed() && Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
            }
        }

        @JavascriptInterface
        public void testNotification() {
            if (!notificationsAllowed() && Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                return;
            }
            ReminderReceiver.show(MainActivity.this, -1);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        }

        @JavascriptInterface
        public void saveFile(String base64, String filename, String mime) {
            saveAs(Base64.decode(base64, Base64.DEFAULT), filename, mime);
        }

        @JavascriptInterface
        public void shareFile(String base64, String filename, String mime) {
            share(Base64.decode(base64, Base64.DEFAULT), filename, mime);
        }

        @JavascriptInterface
        public void openBackup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, REQ_OPEN);
                }
            });
        }

        @JavascriptInterface public void toast(String msg) { MainActivity.this.toast(msg); }
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
        return nm.areNotificationsEnabled();
    }
}
