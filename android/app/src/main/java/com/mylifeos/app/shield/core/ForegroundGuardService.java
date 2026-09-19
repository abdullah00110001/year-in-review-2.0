package com.mylifeos.app.shield.core;

import android.app.AppOpsManager;
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
import android.os.Process;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.mylifeos.app.MainActivity;
import com.mylifeos.app.R;
import com.mylifeos.app.nighttorise.NightToRiseManager;
import com.mylifeos.app.shield.ShieldPreferences;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;

/**
 * ForegroundGuardService — the reliability layer behind app blocking.
 *
 * FIX (guard-stop): the service never stopped itself when a lock window ended
 * mid-session. sync() only started/stopped based on whether N2R is *enabled*
 * (the feature toggle), not whether a lock is *currently active*. So after
 * Sleep Guard ended at the alarm, the service kept running and kept showing
 * the block screen on every app switch.
 *
 * FIX (rise-only notification): notification was always showing "sleep lock
 * ACTIVE" even during Rise Guard because it used a hardcoded label instead
 * of reading probe.phase.
 */
public class ForegroundGuardService extends Service {

    private static final String TAG = "ForegroundGuard";
    private static final String CHANNEL_ID = "shield_guard_status";
    private static final int NOTIF_ID = 4711;
    private static final long POLL_MS = 1000L;

    private static final String PROBE_PACKAGE = "zz.lifeos.lock.probe";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable tick;
    private String lastNotificationText = null;

    public static void sync(Context ctx) {
        try {
            com.mylifeos.app.nighttorise.NightToRisePreferences n2rPrefs =
                new com.mylifeos.app.nighttorise.NightToRisePreferences(ctx);
            boolean n2rOn = n2rPrefs.isEnabled();
            Set<String> blocked = new ShieldPreferences(ctx).getBlockedApps();
            boolean shieldOn = blocked != null && !blocked.isEmpty();
            boolean needed = n2rOn || shieldOn;
            Intent i = new Intent(ctx, ForegroundGuardService.class);
            if (needed) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
                else ctx.startService(i);
            } else {
                ctx.stopService(i);
            }
        } catch (Throwable t) {
            Log.w(TAG, "sync failed", t);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIF_ID, buildNotification("Protection active", "Checking your lock schedule…"));
        tick = new Runnable() {
            @Override public void run() {
                try { pass(); } catch (Throwable t) { Log.w(TAG, "guard pass failed", t); }
                handler.postDelayed(this, POLL_MS);
            }
        };
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (tick != null) handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void pass() {
        NightToRiseManager n2r = new NightToRiseManager(this);
        NightToRiseManager.Decision probe = n2r.decide(System.currentTimeMillis(), PROBE_PACKAGE);
        String pkg = currentForegroundPackage();

        boolean accessibilityAvailable =
            com.mylifeos.app.shield.ShieldAccessibilityService.isConnected()
            || new com.mylifeos.app.shield.ShieldPermissionHelper(this).hasAccessibilityPermission();

        BlockEnforcer.noteGuardPass(probe.phase.name(), probe.shouldBlock, pkg,
            hasUsageAccess(), accessibilityAvailable);

        // Announce guard start / end / timer completion to the user.
        com.mylifeos.app.nighttorise.GuardTransitionNotifier.onDecision(this, probe);

        // FIX: when nothing is actively locking AND Shield has no blocked apps
        // AND N2R feature is off — stop so Sleep Guard auto-releases correctly.
        boolean shieldHasBlocked = false;
        try {
            Set<String> blockedApps = new ShieldPreferences(this).getBlockedApps();
            shieldHasBlocked = blockedApps != null && !blockedApps.isEmpty();
        } catch (Throwable ignored) {}

        if (!probe.shouldBlock && !shieldHasBlocked && !n2r.prefs().isEnabled()) {
            stopSelf();
            return;
        }

        updateNotification(probe, pkg != null && canLeaveApp());

        if (pkg == null) {
            if (probe.shouldBlock) Log.w(TAG, "Lock active but no foreground-app signal available");
            return;
        }
        BlockEnforcer.enforce(this, pkg, this::goHome);
    }

    private boolean canLeaveApp() {
        if (com.mylifeos.app.shield.ShieldAccessibilityService.isConnected()) return true;
        try {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || android.provider.Settings.canDrawOverlays(this);
        } catch (Throwable t) {
            return false;
        }
    }

    private void goHome() {
        if (com.mylifeos.app.shield.ShieldAccessibilityService.goHomeViaAccessibility()) return;
        try {
            Intent home = new Intent(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(home);
        } catch (Throwable t) {
            Log.w(TAG, "goHome intent rejected", t);
        }
    }

    private String cachedLongWindowPkg = null;
    private long cachedLongWindowAt = 0L;

    private String currentForegroundPackage() {
        if (hasUsageAccess()) {
            String recent = lastResumedSince(10_000L);
            if (recent != null) return recent;
            long now = System.currentTimeMillis();
            // FIX: the fallback window used to be SIX HOURS, so a missed poll
            // could resurrect an app the user closed hours ago (blocking the
            // wrong thing) or mask the real foreground app. Two minutes is
            // long enough to survive OEM Doze throttling of the 1s poll while
            // still being a genuinely "current" signal.
            if (cachedLongWindowPkg == null || now - cachedLongWindowAt > 5_000L) {
                cachedLongWindowPkg = lastResumedSince(2L * 60 * 1000);
                cachedLongWindowAt = now;
            }
            if (cachedLongWindowPkg != null) return cachedLongWindowPkg;
        }
        if (BlockEnforcer.lastForegroundAgeMs() < 60_000) return BlockEnforcer.lastForegroundPackage();
        return null;
    }

    private String lastResumedSince(long lookbackMs) {
        try {
            UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            long now = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(now - lookbackMs, now);
            UsageEvents.Event e = new UsageEvents.Event();
            String last = null;
            while (events != null && events.hasNextEvent()) {
                events.getNextEvent(e);
                int type = e.getEventType();
                boolean resumed = type == UsageEvents.Event.MOVE_TO_FOREGROUND
                    || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        && type == UsageEvents.Event.ACTIVITY_RESUMED);
                if (resumed) last = e.getPackageName();
            }
            return last;
        } catch (Throwable t) {
            Log.w(TAG, "usage query failed", t);
            return null;
        }
    }

    private boolean hasUsageAccess() {
        try {
            AppOpsManager ops = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), getPackageName());
            } else {
                mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable t) {
            return false;
        }
    }

    private void updateNotification(NightToRiseManager.Decision probe, boolean canEnforce) {
        String title;
        String text;

        boolean locking = probe.shouldBlock;
        if (locking && !canEnforce) {
            title = "Sleep to Rise — permission needed";
            text = "Grant Usage Access or Accessibility to enforce this lock";
        } else if (locking) {
            String until = probe.endTimeMs > 0
                ? new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date(probe.endTimeMs))
                : null;
            // FIX: read actual phase, not hardcoded "sleep lock"
            boolean isRise = probe.phase == NightToRiseManager.Phase.RISE_LOCK;
            title = isRise
                ? "🌅 Sleep to Rise — rise lock ACTIVE"
                : "🌙 Sleep to Rise — sleep lock ACTIVE";
            text = "Only your allowed apps can open"
                + (until != null ? " · until " + until : "");
        } else {
            int blockedCount = 0;
            try {
                Set<String> blocked = new ShieldPreferences(this).getBlockedApps();
                blockedCount = blocked == null ? 0 : blocked.size();
            } catch (Throwable ignored) {}
            switch (probe.phase) {
                case PAUSED:       title = "Sleep to Rise — paused tonight"; break;
                case INACTIVE_DAY: title = "Sleep to Rise — not scheduled today"; break;
                case OFF:          title = "Shield protection running"; break;
                default:           title = "Sleep to Rise — armed"; break;
            }
            text = blockedCount > 0
                ? blockedCount + " app" + (blockedCount == 1 ? "" : "s") + " blocked by Shield"
                : "Lock is not enforcing right now";
        }

        String signature = title + "|" + text;
        if (signature.equals(lastNotificationText)) return;
        lastNotificationText = signature;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(title, text));
    }

    private Notification buildNotification(String title, String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pi)
            .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Blocking status", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shows whether Sleep to Rise / Shield blocking is currently enforcing");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
