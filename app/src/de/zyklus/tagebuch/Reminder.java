package de.zyklus.tagebuch;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/** Schedules the daily reminder alarm based on the stored settings. */
public final class Reminder {
    static final String PREFS = "reminder";
    static final String CHANNEL_ID = "daily_reminder";

    private Reminder() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) { return prefs(c).getBoolean("enabled", false); }
    static int hour(Context c) { return prefs(c).getInt("hour", 20); }
    static int minute(Context c) { return prefs(c).getInt("minute", 0); }

    static void save(Context c, boolean enabled, int hour, int minute) {
        prefs(c).edit().putBoolean("enabled", enabled).putInt("hour", hour).putInt("minute", minute).apply();
        schedule(c);
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am.canScheduleExactAlarms();
    }

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c, ReminderReceiver.class);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(c);
        am.cancel(pi);
        if (!isEnabled(c)) return;

        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour(c));
        next.set(Calendar.MINUTE, minute(c));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis() + 1000) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        long at = next.getTimeInMillis();
        if (canExact(c)) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Tägliche Erinnerung",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Erinnert dich täglich daran, das Zyklustagebuch auszufüllen");
            nm.createNotificationChannel(ch);
        }
    }
}
