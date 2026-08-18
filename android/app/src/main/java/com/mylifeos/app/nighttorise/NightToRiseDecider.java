package com.mylifeos.app.nighttorise;

import java.util.Calendar;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

/**
 * NightToRiseDecider — the pure, side-effect free heart of Sleep to Rise.
 *
 * It knows nothing about Android Context / SharedPreferences so it can be unit
 * tested directly (midnight rollover, blocklist vs allowlist, safety
 * exemptions, alarm hand-off). NightToRiseManager adapts the persisted
 * preferences onto {@link Config} and delegates here.
 */
public final class NightToRiseDecider {

    private NightToRiseDecider() {}

    public enum Phase { OFF, ARMED, SLEEP_LOCK, RISE_LOCK, PAUSED, INACTIVE_DAY }

    /** Fallback lock duration when no rise alarm is configured (9.5 hours). */
    public static final int DEFAULT_MAX_LOCK_MINUTES = 570;

    /** A sleep window can never span longer than this (18 hours). */
    static final long MAX_WINDOW_MS = 18L * 60 * 60 * 1000;

    /**
     * Packages that can never be locked. Emergency calling, the system dialer,
     * the system clock, the system UI (status bar / recents chrome) and Life OS
     * itself must always stay reachable, in every mode.
     */
    private static final String[] SAFE_EXACT = new String[]{
        "com.android.phone",
        "com.android.dialer",
        "com.google.android.dialer",
        "com.samsung.android.dialer",
        "com.android.server.telecom",
        "com.android.emergency",
        "com.android.deskclock",
        "com.google.android.deskclock",
        "com.sec.android.app.clockpackage",
        "com.android.systemui",
        "com.android.settings",
    };

    private static final String[] SAFE_CONTAINS = new String[]{
        "dialer", "telecom", "emergency", "incallui", "deskclock", "clockpackage", "systemui",
    };

    public static class Config {
        public boolean enabled;
        public long    pausedUntilMs;
        public String  sleepTime = "22:30";     // "HH:MM"
        public int     sleepBeforeMin = 30;
        public int     riseAfterMin = 30;
        public long    riseAlarmMs;
        public String  scheduleMode = "everyday";
        public Set<Integer> scheduleDays = new HashSet<>();
        /** The ONLY packages the user may foreground during a lock window. */
        public Set<String>  allowedPackages = Collections.emptySet();
        /**
         * Runtime-resolved safety exemptions (e.g. the device's default SMS
         * app), added on top of the hardcoded SAFE_* lists.
         */
        public Set<String>  extraSafePackages = Collections.emptySet();
        public String  sleepMessage = "Time to rest.";
        public String  riseMessage  = "Start your morning right.";
        /** Our own package — always exempt. */
        public String  selfPackage = "com.mylifeos.app";
        /** Injectable for deterministic tests. */
        public TimeZone timeZone = TimeZone.getDefault();
    }


    public static class Decision {
        public final Phase phase;
        public final boolean shouldBlock;
        public final long endTimeMs;
        public final String message;
        public Decision(Phase p, boolean b, long end, String msg) {
            this.phase = p; this.shouldBlock = b; this.endTimeMs = end; this.message = msg;
        }
    }

    /** True when the package must never be locked, whatever the mode is. */
    public static boolean isSafePackage(Config cfg, String pkg) {
        if (pkg == null || pkg.isEmpty()) return true;
        if (cfg.selfPackage != null && pkg.equals(cfg.selfPackage)) return true;
        for (String s : SAFE_EXACT) if (s.equals(pkg)) return true;
        String lower = pkg.toLowerCase();
        for (String s : SAFE_CONTAINS) if (lower.contains(s)) return true;
        return false;
    }

    public static Decision decide(Config cfg, long nowMs, String foregroundPackage) {
        if (cfg == null || !cfg.enabled) return new Decision(Phase.OFF, false, 0, "");
        if (cfg.pausedUntilMs > nowMs)   return new Decision(Phase.PAUSED, false, cfg.pausedUntilMs, "");

        // ---- Safety exemptions come first, before any mode logic ----
        if (isSafePackage(cfg, foregroundPackage)) return new Decision(Phase.ARMED, false, 0, "");
        if (foregroundPackage != null && cfg.allowedPackages.contains(foregroundPackage)) {
            return new Decision(Phase.ARMED, false, 0, "");
        }

        // Blocklist mode: only the apps the user explicitly picked are locked.
        // Allowlist mode: everything that is not allowed (and not safe) locks.
        if ("blocklist".equals(cfg.blocklistMode)) {
            if (foregroundPackage == null || !cfg.blockedPackages.contains(foregroundPackage)) {
                return new Decision(Phase.ARMED, false, 0, "");
            }
        }

        // ---- Sleep-start time (today or yesterday, whichever is most recent) ----
        int sleepStartMin = sleepStartMinuteOfDay(cfg);
        long sleepStartMs = mostRecentOccurrence(cfg, sleepStartMin, nowMs);

        // Schedule-day check uses the DAY THE SLEEP WINDOW STARTED, not "now",
        // since "now" may already be past midnight into the next calendar day.
        if (!isDayActive(cfg, sleepStartMs)) {
            Decision riseOnly = checkRiseOnly(cfg, nowMs);
            if (riseOnly != null) return riseOnly;
            return new Decision(Phase.INACTIVE_DAY, false, 0, "");
        }

        long alarmMs = cfg.riseAlarmMs;
        // An alarm only belongs to THIS sleep window when it lands inside a sane
        // night horizon after the window opened. Accepting any future alarm made
        // a next-night alarm keep yesterday's window "open" all day long, so
        // apps stayed blocked at e.g. 22:00-1min the following evening.
        boolean hasAlarm = alarmMs > sleepStartMs
                && alarmMs <= sleepStartMs + MAX_WINDOW_MS;

        if (hasAlarm) {
            long riseEnd = alarmMs + (long) cfg.riseAfterMin * 60_000L;
            if (nowMs >= sleepStartMs && nowMs < alarmMs) {
                return new Decision(Phase.SLEEP_LOCK, true, alarmMs, cfg.sleepMessage);
            }
            if (nowMs >= alarmMs && nowMs < riseEnd) {
                return new Decision(Phase.RISE_LOCK, true, riseEnd, cfg.riseMessage);
            }
        } else {
            long fallbackEnd = sleepStartMs + (long) DEFAULT_MAX_LOCK_MINUTES * 60_000L;
            if (nowMs >= sleepStartMs && nowMs < fallbackEnd) {
                return new Decision(Phase.SLEEP_LOCK, true, fallbackEnd, cfg.sleepMessage);
            }
        }

        return new Decision(Phase.ARMED, false, 0, "");
    }

    static int sleepStartMinuteOfDay(Config cfg) {
        String time = (cfg.sleepTime == null || !cfg.sleepTime.contains(":")) ? "22:30" : cfg.sleepTime;
        String[] s = time.split(":");
        int sh, sm;
        try { sh = Integer.parseInt(s[0].trim()); sm = Integer.parseInt(s[1].trim()); }
        catch (Throwable t) { sh = 22; sm = 30; }
        return ((sh * 60 + sm) - cfg.sleepBeforeMin + 1440 * 2) % 1440;
    }

    /**
     * A rise-lock that is already open must finish naturally even when the
     * calendar day it rolled into is not part of the schedule.
     */
    private static Decision checkRiseOnly(Config cfg, long nowMs) {
        long alarmMs = cfg.riseAlarmMs;
        if (alarmMs <= 0) return null;
        long riseEnd = alarmMs + (long) cfg.riseAfterMin * 60_000L;
        if (nowMs >= alarmMs && nowMs < riseEnd) {
            return new Decision(Phase.RISE_LOCK, true, riseEnd, cfg.riseMessage);
        }
        return null;
    }

    static boolean isDayActive(Config cfg, long atMs) {
        Calendar c = Calendar.getInstance(cfg.timeZone);
        c.setTimeInMillis(atMs);
        int dow = c.get(Calendar.DAY_OF_WEEK) - 1; // 0=Sun..6=Sat
        String mode = cfg.scheduleMode;
        if ("everyday".equals(mode)) return true;
        if ("weekdays".equals(mode)) return dow >= 1 && dow <= 5;
        return cfg.scheduleDays.contains(dow);
    }

    /** Latest timestamp <= nowMs at which the clock read `minuteOfDay`. */
    static long mostRecentOccurrence(Config cfg, int minuteOfDay, long nowMs) {
        Calendar c = Calendar.getInstance(cfg.timeZone);
        c.setTimeInMillis(nowMs);
        c.set(Calendar.HOUR_OF_DAY, minuteOfDay / 60);
        c.set(Calendar.MINUTE, minuteOfDay % 60);
        c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() > nowMs) c.add(Calendar.DAY_OF_MONTH, -1);
        return c.getTimeInMillis();
    }
}
