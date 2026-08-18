package com.mylifeos.app.nighttorise;

import android.content.Context;

/**
 * NightToRiseManager — thin Android adapter over {@link NightToRiseDecider}.
 *
 * All decision logic lives in the decider (pure, unit tested). This class only
 * reads persisted preferences and maps them onto a Config snapshot.
 *
 * Sleep lock runs continuously from the configured pre-sleep start until either
 * the next Rise alarm fires (seamless hand-off to RISE_LOCK) or the fallback
 * maximum elapses when no alarm is set — there is no gap window.
 */
public class NightToRiseManager {

    /** Kept as an alias so existing call sites keep compiling. */
    public enum Phase { OFF, ARMED, SLEEP_LOCK, RISE_LOCK, PAUSED, INACTIVE_DAY }

    public static class Decision {
        public final Phase phase;
        public final boolean shouldBlock;
        public final long endTimeMs;
        public final String message;
        public Decision(Phase p, boolean b, long end, String msg) {
            this.phase = p; this.shouldBlock = b; this.endTimeMs = end; this.message = msg;
        }
    }

    private final NightToRisePreferences prefs;
    private final String selfPackage;

    public NightToRiseManager(Context ctx) {
        this.prefs = new NightToRisePreferences(ctx);
        this.selfPackage = ctx.getApplicationContext().getPackageName();
    }

    public NightToRisePreferences prefs() { return prefs; }

    public NightToRiseDecider.Config snapshot() {
        NightToRiseDecider.Config cfg = new NightToRiseDecider.Config();
        cfg.enabled         = prefs.isEnabled();
        cfg.pausedUntilMs   = prefs.pausedUntilMs();
        cfg.sleepTime       = prefs.sleepTime();
        cfg.sleepBeforeMin  = prefs.sleepBeforeMin();
        cfg.riseAfterMin    = prefs.riseAfterMin();
        cfg.riseAlarmMs     = prefs.riseAlarmMs();
        cfg.scheduleMode    = prefs.scheduleMode();
        cfg.scheduleDays    = prefs.scheduleDays();
        cfg.allowedPackages = prefs.allowedPackages();
        cfg.extraSafePackages = safetyPackages();

        cfg.sleepMessage    = prefs.sleepMessage();
        cfg.riseMessage     = prefs.riseMessage();
        cfg.selfPackage     = selfPackage;
        return cfg;
    }

    /** Compute the current decision for a foreground package. */
    public Decision decide(long nowMs, String foregroundPackage) {
        NightToRiseDecider.Decision d =
            NightToRiseDecider.decide(snapshot(), nowMs, foregroundPackage);
        return new Decision(Phase.valueOf(d.phase.name()), d.shouldBlock, d.endTimeMs, d.message);
    }

    /**
     * Called from BootReceiver: the stored Rise alarm reference points at a
     * timestamp that may have passed while the phone was off, which would leave
     * the Rise window permanently "already ended". Re-point it at the earliest
     * future alarm shot that survived the reboot so Sleep/Rise enforcement
     * keeps working without waiting for the app to be opened.
     */
    public static void onBootRestored(Context ctx) {
        NightToRisePreferences p = new NightToRisePreferences(ctx);
        long now = System.currentTimeMillis();
        if (p.riseAlarmMs() > now) return;

        long earliest = Long.MAX_VALUE;
        for (com.mylifeos.app.rise.scheduler.RiseAlarmStore.Shot s
                : com.mylifeos.app.rise.scheduler.RiseAlarmStore.all(ctx)) {
            if (s == null) continue;
            long when = s.dayOfWeek >= 0
                ? com.mylifeos.app.rise.core.AlarmTimeMath.rollForwardWeekly(s.timeInMillis, now)
                : s.timeInMillis;
            if (when > now && when < earliest) earliest = when;
        }
        if (earliest != Long.MAX_VALUE) p.saveRiseAlarmMillis(earliest);
    }
}
