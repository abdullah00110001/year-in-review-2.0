package com.mylifeos.app.rise.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Calendar;
import java.util.TimeZone;

/** Unit tests for recurring-alarm time math (next shot, boot roll-forward, DST). */
public class AlarmTimeMathTest {

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");
    private static final TimeZone NY  = TimeZone.getTimeZone("America/New_York");

    private static long at(TimeZone tz, int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(tz);
        c.clear();
        c.set(y, mo - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    private static int hourOf(long ms, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(ms);
        return c.get(Calendar.HOUR_OF_DAY);
    }

    @Test public void nextOccurrenceIsAlwaysInTheFuture() {
        long now = at(UTC, 2026, 2, 10, 12, 0); // Tuesday
        for (int day = 0; day < 7; day++) {
            long next = AlarmTimeMath.nextOccurrence(day, 6, 30, now, UTC);
            assertTrue("day " + day, next > now);
            assertEquals("day " + day, day, AlarmTimeMath.dayOfWeek(next, UTC));
        }
    }

    @Test public void sameDayEarlierTimeRollsToNextWeek() {
        long now = at(UTC, 2026, 2, 10, 12, 0);            // Tuesday noon
        long next = AlarmTimeMath.nextOccurrence(2, 6, 30, now, UTC); // Tuesday 06:30
        assertEquals(at(UTC, 2026, 2, 17, 6, 30), next);
    }

    @Test public void sameDayLaterTimeStaysToday() {
        long now = at(UTC, 2026, 2, 10, 12, 0);
        long next = AlarmTimeMath.nextOccurrence(2, 23, 45, now, UTC);
        assertEquals(at(UTC, 2026, 2, 10, 23, 45), next);
    }

    @Test public void rollForwardKeepsFutureTriggerUntouched() {
        long now = at(UTC, 2026, 2, 10, 12, 0);
        long future = at(UTC, 2026, 2, 12, 6, 30);
        assertEquals(future, AlarmTimeMath.rollForwardWeekly(future, now, UTC));
    }

    @Test public void rollForwardAdvancesStalePastTriggerByWholeWeeks() {
        long now  = at(UTC, 2026, 2, 10, 12, 0);
        long past = at(UTC, 2026, 1, 6, 6, 30); // Tuesday, 5 weeks earlier
        long rolled = AlarmTimeMath.rollForwardWeekly(past, now, UTC);
        assertTrue(rolled > now);
        assertEquals(AlarmTimeMath.dayOfWeek(past, UTC), AlarmTimeMath.dayOfWeek(rolled, UTC));
        assertEquals(0, (rolled - past) % AlarmTimeMath.WEEK_MS);
    }

    @Test public void rollForwardKeepsLocalWakeTimeAcrossDstChange() {
        // US DST starts 2026-03-08. A trigger stored before it must still fire
        // at 06:30 local afterwards, not 05:30/07:30.
        long past = at(NY, 2026, 3, 3, 6, 30);   // Tuesday before DST
        long now  = at(NY, 2026, 3, 9, 12, 0);   // after DST
        long rolled = AlarmTimeMath.rollForwardWeekly(past, now, NY);
        assertTrue(rolled > now);
        assertEquals(6, hourOf(rolled, NY));
        assertEquals(AlarmTimeMath.dayOfWeek(past, NY), AlarmTimeMath.dayOfWeek(rolled, NY));
    }

    @Test public void nextOccurrenceHandlesDstBoundaryDay() {
        long now = at(NY, 2026, 3, 7, 20, 0);  // Saturday evening before DST
        long next = AlarmTimeMath.nextOccurrence(0, 6, 30, now, NY); // Sunday 06:30
        assertTrue(next > now);
        assertEquals(6, hourOf(next, NY));
        assertEquals(0, AlarmTimeMath.dayOfWeek(next, NY));
    }
}
