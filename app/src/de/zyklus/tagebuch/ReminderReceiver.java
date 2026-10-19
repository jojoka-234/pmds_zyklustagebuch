package de.zyklus.tagebuch;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Fires once a day: shows the reminder (unless today is already filled in) and schedules the next one. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Reminder.schedule(context);
        if (!Reminder.isEnabled(context)) return;

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        int cycleDay = -1;
        boolean done = false;
        try {
            JSONObject data = new JSONObject(Store.read(context));
            JSONArray cycles = data.optJSONArray("cycles");
            String start = null;
            if (cycles != null) {
                for (int i = 0; i < cycles.length(); i++) {
                    String s = cycles.getJSONObject(i).getString("start");
                    if (s.compareTo(today) <= 0 && (start == null || s.compareTo(start) > 0)) start = s;
                }
            }
            if (start != null) {
                SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                long diff = f.parse(today).getTime() - f.parse(start).getTime();
                cycleDay = (int) TimeUnit.MILLISECONDS.toDays(diff) + 1;
            }
            JSONObject entries = data.optJSONObject("entries");
            JSONObject e = entries == null ? null : entries.optJSONObject(today);
            if (e != null) {
                JSONArray r = e.optJSONArray("r");
                done = r != null && r.length() >= 10;
                for (int i = 0; r != null && i < r.length(); i++) {
                    if (r.isNull(i)) { done = false; break; }
                }
            }
        } catch (Exception ignored) {
            // No data yet or unreadable: still remind.
        }
        if (done) return;
        show(context, cycleDay);
    }

    static void show(Context context, int cycleDay) {
        Reminder.ensureChannel(context);
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("openToday", true);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 2, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String text = cycleDay > 0
                ? "Zyklustag " + cycleDay + ": Zeit für deinen heutigen Eintrag."
                : "Zeit für deinen heutigen Eintrag.";
        Notification n = new Notification.Builder(context, Reminder.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notify)
                .setColor(0xFF8A1538)
                .setContentTitle("Zyklustagebuch")
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(1, n);
    }
}
