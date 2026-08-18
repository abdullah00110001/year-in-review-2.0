package com.mylifeos.app.nighttorise;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.mylifeos.app.nighttorise.NightToRiseDecider.Config;
import com.mylifeos.app.nighttorise.NightToRiseDecider.Decision;
import com.mylifeos.app.nighttorise.NightToRiseDecider.Phase;

import org.junit.Test;

import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.TimeZone;

/**
 * Unit tests for the pure Sleep-to-Rise decider: midnight rollover, allowlist, safety exemptions, alarm hand-off and schedule days.
 */
public class NightToRiseDeciderTest {

    private static final TimeZone TZ = TimeZone.getTimeZone("UTC");

    /** Local timestamp helper (UTC to keep the math deterministic). */
    private static long at(int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TZ);
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    private static Config base() {
        Config cfg = new Config();
        cfg.enabled = true;
        cfg.timeZone = TZ;
        cfg.sleepTime = "22:30";
        cfg.sleepBeforeMin = 30;   // lock starts 22:00
        cfg.riseAfterMin = 30;
        cfg.scheduleMode = "everyday";
        cfg.allowedPackages = new HashSet<>();
        cfg.selfPackage = "com.mylifeos.app";
        return cfg;
    }

    // ── OFF / PAUSED ────────────────────────────────────────────────

    @Test public void disabledNeverBlocks() {
        Config cfg = base();
        cfg.enabled = false;
        Decision d = NightToRiseDecider.decide(cfg, at(2026, 2, 10, 23, 0), "com.instagram.android");
        assertEquals(Phase.OFF, d.phase);
        assertFalse(d.shouldBlock);
    }

    @Test public void pausedNeverBlocks() {
        Config cfg = base();
        long now = at(2026, 2, 10, 23, 0);
        cfg.pausedUntilMs = now + 60_000L;
        Decision d = NightToRiseDecider.decide(cfg, now, "com.instagram.android");
        assertEquals(Phase.PAUSED, d.phase);
        assertFalse(d.shouldBlock);
    }

    // ── Safety exemptions ───────────────────────────────────────────

    @Test public void dialerClockAndSelfAreAlwaysSafe() {
        Config cfg = base();
        long now = at(2026, 2, 10, 23, 0);
        for (String pkg : new String[]{
            "com.android.dialer", "com.android.emergency", "com.google.android.deskclock",
            "com.android.systemui", "com.mylifeos.app", "com.oem.incallui"
        }) {
            assertTrue(pkg, NightToRiseDecider.isSafePackage(cfg, pkg));
            assertFalse(pkg, NightToRiseDecider.decide(cfg, now, pkg).shouldBlock);
        }
    }

    // ── Blocklist vs allowlist ──────────────────────────────────────

    @Test public void everythingOutsideTheAllowlistIsLocked() {
        Config cfg = base();
        long now = at(2026, 2, 10, 23, 0); // inside sleep window
        assertTrue(NightToRiseDecider.decide(cfg, now, "com.instagram.android").shouldBlock);
        assertTrue(NightToRiseDecider.decide(cfg, now, "com.some.notes").shouldBlock);
    }

    @Test public void runtimeSafetyPackagesAreExempt() {
        Config cfg = base();
        cfg.extraSafePackages = new HashSet<>(Arrays.asList("com.oem.messages"));
        long now = at(2026, 2, 10, 23, 0);
        assertFalse(NightToRiseDecider.decide(cfg, now, "com.oem.messages").shouldBlock);
    }

    @Test public void allowlistLocksEverythingExceptAllowed() {
        Config cfg = base();
        cfg.allowedPackages = new HashSet<>(Arrays.asList("com.spotify.music"));
        long now = at(2026, 2, 10, 23, 0);
        assertTrue(NightToRiseDecider.decide(cfg, now, "com.some.notes").shouldBlock);
        assertFalse(NightToRiseDecider.decide(cfg, now, "com.spotify.music").shouldBlock);
    }

    // ── Midnight rollover + alarm hand-off ──────────────────────────

    @Test public void locksAcrossMidnightUntilTheAlarm() {
        Config cfg = base();
        cfg.riseAlarmMs = at(2026, 2, 11, 5, 0);

        Decision beforeMidnight = NightToRiseDecider.decide(cfg, at(2026, 2, 10, 23, 30), "com.instagram.android");
        assertEquals(Phase.SLEEP_LOCK, beforeMidnight.phase);
        assertEquals(cfg.riseAlarmMs, beforeMidnight.endTimeMs);

        Decision afterMidnight = NightToRiseDecider.decide(cfg, at(2026, 2, 11, 2, 15), "com.instagram.android");
        assertEquals(Phase.SLEEP_LOCK, afterMidnight.phase);
        assertTrue(afterMidnight.shouldBlock);
    }

    @Test public void alarmHandsOffToRiseLockThenReleases() {
        Config cfg = base();
        cfg.riseAlarmMs = at(2026, 2, 11, 5, 0);

        Decision duringRise = NightToRiseDecider.decide(cfg, at(2026, 2, 11, 5, 20), "com.instagram.android");
        assertEquals(Phase.RISE_LOCK, duringRise.phase);
        assertEquals(cfg.riseAlarmMs + 30 * 60_000L, duringRise.endTimeMs);

        Decision after = NightToRiseDecider.decide(cfg, at(2026, 2, 11, 5, 31), "com.instagram.android");
        assertEquals(Phase.ARMED, after.phase);
        assertFalse(after.shouldBlock);
    }

    @Test public void noAlarmFallsBackToMaxLockWindow() {
        Config cfg = base();
        cfg.riseAlarmMs = 0;
        assertTrue(NightToRiseDecider.decide(cfg, at(2026, 2, 11, 3, 0), "com.instagram.android").shouldBlock);
        // 22:00 + 9h30m = 07:30 → released after that
        assertFalse(NightToRiseDecider.decide(cfg, at(2026, 2, 11, 8, 0), "com.instagram.android").shouldBlock);
    }

    @Test public void beforeWindowDoesNotBlock() {
        Config cfg = base();
        cfg.riseAlarmMs = at(2026, 2, 11, 5, 0);
        Decision d = NightToRiseDecider.decide(cfg, at(2026, 2, 10, 21, 59), "com.instagram.android");
        assertEquals(Phase.ARMED, d.phase);
        assertFalse(d.shouldBlock);
    }

    // ── Schedule days ───────────────────────────────────────────────

    @Test public void inactiveDayDoesNotBlockButOpenRiseLockStillFinishes() {
        Config cfg = base();
        cfg.scheduleMode = "custom";
        cfg.scheduleDays = new HashSet<>(Arrays.asList(1)); // Monday only
        // 2026-02-10 is a Tuesday → sleep window not scheduled.
        Decision d = NightToRiseDecider.decide(cfg, at(2026, 2, 10, 23, 30), "com.instagram.android");
        assertEquals(Phase.INACTIVE_DAY, d.phase);
        assertFalse(d.shouldBlock);

        // An alarm-driven rise lock that is already open still enforces.
        cfg.riseAlarmMs = at(2026, 2, 11, 5, 0);
        Decision rise = NightToRiseDecider.decide(cfg, at(2026, 2, 11, 5, 10), "com.instagram.android");
        assertEquals(Phase.RISE_LOCK, rise.phase);
        assertTrue(rise.shouldBlock);
    }

    @Test public void weekdaysModeUsesSleepWindowStartDay() {
        Config cfg = base();
        cfg.scheduleMode = "weekdays";
        cfg.riseAlarmMs = at(2026, 2, 16, 5, 0);
        // Sunday 2026-02-15 22:30 → window started on a Sunday, so not active.
        assertFalse(NightToRiseDecider.decide(cfg, at(2026, 2, 15, 23, 0), "com.instagram.android").shouldBlock);
    }

    // ── Sleep start minute math ─────────────────────────────────────

    @Test public void sleepStartMinuteWrapsBackwardsPastMidnight() {
        Config cfg = base();
        cfg.sleepTime = "00:15";
        cfg.sleepBeforeMin = 30;
        assertEquals(23 * 60 + 45, NightToRiseDecider.sleepStartMinuteOfDay(cfg));
    }

    @Test public void invalidSleepTimeFallsBackToDefault() {
        Config cfg = base();
        cfg.sleepTime = "not-a-time";
        cfg.sleepBeforeMin = 0;
        assertEquals(22 * 60 + 30, NightToRiseDecider.sleepStartMinuteOfDay(cfg));
    }
}
