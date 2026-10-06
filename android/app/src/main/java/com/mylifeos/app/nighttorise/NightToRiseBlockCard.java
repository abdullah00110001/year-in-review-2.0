package com.mylifeos.app.nighttorise;

import android.content.Context;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * [N2R-CARD] MAIN file — only picks which card to show. No drawing, no layout here.
 *
 *   NightToRiseSleepCard  -> the whole Sleep Guard card (layout + all its pictures)
 *   NightToRiseRiseCard   -> the whole Rise Guard card  (layout + all its pictures)
 *
 * Public API is unchanged: Handles, build(ctx, isRise), formatClock().
 * Optional: build(ctx, isRise, theme) to pick a different picture (0 = default).
 */
public final class NightToRiseBlockCard {

    private NightToRiseBlockCard() {}

    // theme ids — 0 is always the original default picture of that side
    public static final int THEME_DEFAULT = 0;
    public static final int THEME_LAKE    = 1; // sleep
    public static final int THEME_CABIN   = 2; // sleep
    public static final int THEME_HARBOR  = 3; // sleep
    public static final int THEME_COUNT   = NightToRiseSleepCard.COUNT;

    /** Live widgets the caller (the Activity) updates and attaches listeners to. */
    public static final class Handles {
        public final View root;
        public final View content;
        public final TextView pill;
        public final TextView title;
        public final TextView message;
        public final TextView countdown;
        public final View countdownBox;
        /** The second stat box, e.g. "6:30 AM" / "ALARM". Set with setEndTime() or directly. */
        public final TextView endTime;
        public final LinearLayout allowedContainer;
        public final Button home;
        public final Button override;

        Handles(View root, View content, TextView pill, TextView title, TextView message,
                TextView countdown, View countdownBox, TextView endTime,
                LinearLayout allowedContainer, Button home, Button override) {
            this.root = root; this.content = content; this.pill = pill; this.title = title;
            this.message = message; this.countdown = countdown; this.countdownBox = countdownBox;
            this.endTime = endTime;
            this.allowedContainer = allowedContainer; this.home = home; this.override = override;
        }

        /** Convenience: format and set an absolute epoch-ms end time, e.g. setEndTime(endMs). */
        public void setEndTime(long epochMs) {
            if (endTime != null) endTime.setText(formatClock(epochMs));
        }
    }

    /** Original entry point — always the default picture. */
    public static Handles build(Context ctx, boolean isRise) {
        return build(ctx, isRise, THEME_DEFAULT);
    }

    /** Builds the card for the chosen side. theme 0 = default picture. */
    public static Handles build(Context ctx, boolean isRise, int theme) {
        return isRise ? NightToRiseRiseCard.build(ctx, theme) : NightToRiseSleepCard.build(ctx, theme);
    }

    /** Sleep picture id from a stored string ("lake" / "cabin" / "harbor"); unknown -> default. */
    public static int themeFromKey(String key) { return NightToRiseSleepCard.themeFromKey(key); }

    /** Optional copy that matches a Sleep picture; null for default = keep your existing text. */
    public static String suggestedTitle(int theme)   { return NightToRiseSleepCard.suggestedTitle(theme); }
    public static String suggestedMessage(int theme) { return NightToRiseSleepCard.suggestedMessage(theme); }

    /** Formats an absolute end time as a 12-hour clock string, e.g. "6:30 AM". */
    public static String formatClock(long epochMs) {
        try {
            return new SimpleDateFormat("h:mm a", Locale.US).format(new Date(epochMs));
        } catch (Throwable t) {
            return "";
        }
    }
}
