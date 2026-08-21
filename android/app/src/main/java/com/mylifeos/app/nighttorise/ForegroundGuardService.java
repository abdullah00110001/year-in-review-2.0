package com.mylifeos.app.nighttorise;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.mylifeos.app.MainActivity;

/**
 * ForegroundGuardService — the REAL, actually-wired enforcement backbone for
 * Sleep to Rise.
 *
 * Why this exists: enforcement was previously ONLY driven by
 * ShieldAccessibilityService.onAccessibilityEvent(TYPE_WINDOW_STATE_CHANGED).
 * That is an event Android is free to delay, coalesce, or drop entirely for
 * background listeners — a well-known failure mode on MIUI/HyperOS/OneUI/
 * ColorOS — which is consistent with "the in-app status showed active but
 * nothing was ever actually blocked."
 *
 * This service does NOT depend on that event stream at all. It polls the
 * real foreground app directly via UsageStatsManager every 2 seconds and
 * runs the exact same NightToRiseManager.decide() used everywhere else, so
 * both paths can never disagree. If the accessibility event fires too,
 * great — this is a redundant, independent backup that catches whatever the
 * event-driven path misses. It also owns the ONE persistent notification
 * that honestly reflects whether a lock is currently active, so the user is
 * never dependent on the in-app UI to know Sleep to Rise is actually doing
 * something right now.
 *
 * Started by: NightToRisePlugin.setConfig() (whenever enabled becomes true)
 * and BootReceiver (so it survives a reboot). Stops itself once
 * NightToRisePreferences.isEnabled() is false.
 */
public class ForegroundGuardService extends Service {

    private static final String TAG = "N2RGuardService";
    private static final String CHANNEL_ID = "night_to_rise_status";
    private static final int NOTIF_ID = 8821;
    private static final long POLL_MS = 2000;
    private static final long BLOCK_SCREEN_DEDUPE_MS = 1500;

    private Handler handler;
    private Runnable pollRunnable;
    private NightToRiseManager manager;
    private NightToRisePreferences prefs;

    private String lastBlockedFor = null;
    private long lastBlockScreenAt = 0L;
    private String lastNotifText = null;

    public static void start(Context ctx) {
        try {
            Intent i = new Intent(ctx, ForegroundGuardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable t) {
            Log.e(TAG, "start failed", t);
        }
    }

    public static void stop(Context ctx) {
        try { ctx.stopService(new Intent(ctx, ForegroundGuardService.class)); }
        catch (Throwable ignored) {}
    }

    /** Call after any config change so a running instance re-syncs immediately. */
    public static void kick(Context ctx) {
        NightToRisePreferences p = new NightToRisePreferences(ctx);
        if (p.isEnabled()) start(ctx); else stop(ctx);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        manager = new NightToRiseManager(this);
        prefs = manager.prefs();
        ensureChannel();
        startForeground(NOTIF_ID, buildNotification("Sleep to Rise", "Watching…", false));
        handler = new Handler(Looper.getMainLooper());
        pollRunnable = this::tick;
        handler.post(pollRunnable);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (handler != null && pollRunnable != null) handler.removeCallbacks(pollRunnable);
        super.onDestroy();
    }

    private void tick() {
        try {
            if (!prefs.isEnabled()) {
                updateNotification("Sleep to Rise", "Turned off", false);
                stopSelf();
                return;
            }

            String fg = queryForegroundPackage();
            NightToRiseManager.Decision d =
                manager.decide(System.currentTimeMillis(), fg != null ? fg : "__n2r_probe__");

            // ---- Notification: always reflects the REAL decision, not a guess ----
            if (d.shouldBlock) {
                String label = d.phase == NightToRiseManager.Phase.RISE_LOCK ? "Rise Guard" : "Sleep Guard";
                long remMin = Math.max(0, (d.endTimeMs - System.currentTimeMillis()) / 60000);
                updateNotification(label + " active", "Locked \u2022 " + remMin + " min left", true);
            } else {
                updateNotification("Sleep to Rise", "Not currently locking", false);
            }

            // ---- Enforcement: block the real foreground app if needed ----
            if (d.shouldBlock && fg != null && !isSelf(fg)) {
                long now = System.currentTimeMillis();
                boolean sameAppRecently = fg.equals(lastBlockedFor) && (now - lastBlockScreenAt) < BLOCK_SCREEN_DEDUPE_MS;
                if (!sameAppRecently) {
                    lastBlockedFor = fg;
                    lastBlockScreenAt = now;
                    prefs.recordBlockedAttempt(fg, d.phase == NightToRiseManager.Phase.RISE_LOCK ? "rise" : "sleep");
                    launchBlockScreen(d, fg);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "tick failed", t);
        } finally {
            if (handler != null && pollRunnable != null) handler.postDelayed(pollRunnable, POLL_MS);
        }
    }

    private boolean isSelf(String pkg) {
        return pkg.equals(getPackageName());
    }

    private void launchBlockScreen(NightToRiseManager.Decision d, String blockedPackage) {
        Intent i = new Intent(this, NightToRiseBlockActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra(NightToRiseBlockActivity.EXTRA_MESSAGE, d.message);
        i.putExtra(NightToRiseBlockActivity.EXTRA_END_MS, d.endTimeMs);
        i.putExtra(NightToRiseBlockActivity.EXTRA_STRICT, prefs.strictMode());
        i.putExtra(NightToRiseBlockActivity.EXTRA_PACKAGE, blockedPackage);
        try {
            startActivity(i);
        } catch (Throwable t) {
            // Starting an Activity from a background Service can be restricted on some
            // OEM builds (MIUI's "display pop-up window while running in background").
            // Log loudly instead of failing silently, since this is the #1 suspect if
            // blocking still doesn't visually appear despite this service running.
            Log.e(TAG, "BLOCK SCREEN LAUNCH FAILED — check 'Display pop-up windows while "
                + "running in background' permission for this app in device Settings", t);
        }
    }

    /**
     * Reads the real current foreground app via UsageStatsManager. Requires the
     * PACKAGE_USAGE_STATS app-op (the "Usage access" permission from
     * NightToRisePermissions.tsx) — returns null if not granted or no recent event.
     */
    private String queryForegroundPackage() {
        try {
            UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            long end = System.currentTimeMillis();
            long begin = end - 15_000L;
            UsageEvents events = usm.queryEvents(begin, end);
            if (events == null) return null;
            UsageEvents.Event event = new UsageEvents.Event();
            String pkg = null;
            long lastTime = 0L;
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                int type = event.getEventType();
                boolean isForegroundEvent =
                    type == UsageEvents.Event.MOVE_TO_FOREGROUND
                    || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type == UsageEvents.Event.ACTIVITY_RESUMED);
                if (isForegroundEvent && event.getTimeStamp() >= lastTime) {
                    lastTime = event.getTimeStamp();
                    pkg = event.getPackageName();
                }
            }
            return pkg;
        } catch (Throwable t) {
            Log.w(TAG, "queryForegroundPackage failed (Usage Access likely not granted)", t);
            return null;
        }
    }

    // ---- Notification plumbing ----

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Sleep to Rise status", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shows whether Sleep to Rise is currently locking apps");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String title, String text, boolean locking) {
        PendingIntent tapIntent = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return b.setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)
            .setContentIntent(tapIntent)
            .setPriority(Notification.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String title, String text, boolean locking) {
        String key = title + "|" + text;
        if (key.equals(lastNotifText)) return; // avoid needless notification churn
        lastNotifText = key;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(title, text, locking));
    }
}