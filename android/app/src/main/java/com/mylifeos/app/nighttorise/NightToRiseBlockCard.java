package com.mylifeos.app.nighttorise;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * ============================================================================
 * [N2R-CARD] MAIN FILE — Sleep to Rise block card (1 of 3)
 * ============================================================================
 *
 * The card system is exactly three files:
 *
 *   NightToRiseBlockCard.java   (this file)
 *       - picks WHICH card to show (Sleep or Rise) and WHICH artwork,
 *       - reads the user's saved artwork choice from Android preferences,
 *       - holds the shared tools both cards use (card shell, drawing pen).
 *
 *   NightToRiseSleepScenes.java
 *       - the whole Sleep Guard card: its pictures, colours, label, icon.
 *
 *   NightToRiseRiseScenes.java
 *       - the whole Rise Guard card: its pictures, colours, label, icon.
 *
 * Callers never change: they call build(ctx, isRise) and get Handles back.
 * The saved artwork is applied automatically for every caller
 * (NightToRiseBlockActivity, NightToRiseLockScreen, BlockingOverlay).
 *
 * Artwork choice is saved by NightToRisePlugin.setCardThemes() into the
 * "night_to_rise_prefs" file under the keys below, as plain text keys
 * ("default", "lake", ...). Unknown / old values always fall back to default.
 * ============================================================================
 */
public final class NightToRiseBlockCard {

    private NightToRiseBlockCard() {}

    // ------------------------------------------------------------------
    // Saved artwork choice (written by NightToRisePlugin.setCardThemes)
    // ------------------------------------------------------------------
    public static final String PREFS            = "night_to_rise_prefs";
    public static final String K_SLEEP_THEME    = "sleepCardTheme";
    public static final String K_RISE_THEME     = "riseCardTheme";

    // Theme ids. 0 is always the original picture of that side.
    public static final int THEME_DEFAULT = 0;
    // Sleep pictures
    public static final int THEME_LAKE    = 1;
    public static final int THEME_CABIN   = 2;
    public static final int THEME_HARBOR  = 3;
    // Rise pictures
    public static final int THEME_MEADOW  = 1;
    public static final int THEME_PEAKS   = 2;

    /** Live widgets the caller (Activity / overlay) updates and attaches listeners to. */
    public static final class Handles {
        public final View root;
        public final View content;
        public final TextView pill;
        public final TextView title;
        public final TextView message;
        public final TextView countdown;
        public final View countdownBox;
        /** The second stat box, e.g. "6:30 AM". Set with setEndTime() or directly. */
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

        /** Format and set an absolute epoch-ms end time, e.g. setEndTime(endMs). */
        public void setEndTime(long epochMs) {
            if (endTime != null) endTime.setText(formatClock(epochMs));
        }
    }

    // ------------------------------------------------------------------
    // Entry points
    // ------------------------------------------------------------------

    /** Main entry point — uses the artwork the user picked in Sleep to Rise. */
    public static Handles build(Context ctx, boolean isRise) {
        return build(ctx, isRise, savedTheme(ctx, isRise));
    }

    /** Builds the card for the chosen side with an explicit theme id. */
    public static Handles build(Context ctx, boolean isRise, int theme) {
        try {
            return isRise ? NightToRiseRiseScenes.build(ctx, theme)
                          : NightToRiseSleepScenes.build(ctx, theme);
        } catch (Throwable t) {
            // Never leave the user without a card: retry with the original picture.
            return isRise ? NightToRiseRiseScenes.build(ctx, THEME_DEFAULT)
                          : NightToRiseSleepScenes.build(ctx, THEME_DEFAULT);
        }
    }

    /** Reads the saved artwork for one side. Missing/unknown -> THEME_DEFAULT. */
    public static int savedTheme(Context ctx, boolean isRise) {
        try {
            SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = sp.getString(isRise ? K_RISE_THEME : K_SLEEP_THEME, "default");
            return isRise ? NightToRiseRiseScenes.themeFromKey(key)
                          : NightToRiseSleepScenes.themeFromKey(key);
        } catch (Throwable t) {
            return THEME_DEFAULT;
        }
    }

    /** Saves both artwork choices (called by the plugin). Unknown keys become "default". */
    public static void saveThemes(Context ctx, String sleepKey, String riseKey) {
        String s = NightToRiseSleepScenes.KEYS[NightToRiseSleepScenes.themeFromKey(sleepKey)];
        String r = NightToRiseRiseScenes.KEYS[NightToRiseRiseScenes.themeFromKey(riseKey)];
        ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(K_SLEEP_THEME, s).putString(K_RISE_THEME, r).apply();
    }

    /** Formats an absolute end time as a 12-hour clock string, e.g. "6:30 AM". */
    public static String formatClock(long epochMs) {
        try {
            return new SimpleDateFormat("h:mm a", Locale.US).format(new Date(epochMs));
        } catch (Throwable t) {
            return "";
        }
    }

    // ==================================================================
    // SHARED CARD SHELL — same layout for both sides; each Scenes file
    // fills a Style with its own picture, colours, label and icon.
    // ==================================================================

    /** Draws one picture into the top area of the card. */
    interface SceneDrawer { void draw(Canvas c, int w, int h); }

    /** Everything that makes a card "Sleep" or "Rise". Filled by the Scenes files. */
    static final class Style {
        String pillText;      // e.g. "SLEEP GUARD"
        String icon;          // e.g. "☾"
        String countdownLabel;// label under the countdown
        String endLabel;      // label under the end time
        int accent1, accent2; // main button gradient
        int cardBottom;       // bottom colour of the card body
        int fallback;         // top colour of the card body / flat fallback
        SceneDrawer scene;
    }

    static Handles buildShell(Context ctx, Style st) {
        final float d = ctx.getResources().getDisplayMetrics().density;

        // Root: dim scrim over whatever is behind, card centred.
        FrameLayout root = new FrameLayout(ctx);
        root.setBackgroundColor(0xB3000000);
        root.setClickable(true);
        root.setFocusable(true);

        LinearLayout card = new LinearLayout(ctx);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable cardBg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{st.fallback, st.cardBottom});
        cardBg.setCornerRadius(28 * d);
        card.setBackground(cardBg);
        card.setClipToOutline(true);
        card.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View v, Outline o) {
                o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), 28 * d);
            }
        });
        card.setElevation(12 * d);
        int screenW = ctx.getResources().getDisplayMetrics().widthPixels;
        int cardW = (int) Math.min(screenW - 32 * d, 400 * d);
        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(cardW, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.gravity = Gravity.CENTER;
        root.addView(card, cardLp);

        // Picture area (drawn once into a cached bitmap; falls back to flat colour).
        card.addView(new SceneView(ctx, st), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, (int) (190 * d)));

        LinearLayout body = new LinearLayout(ctx);
        body.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (22 * d);
        body.setPadding(pad, (int) (18 * d), pad, pad);
        card.addView(body);

        // Pill: icon + guard name
        TextView pill = text(ctx, st.icon + "  " + st.pillText, 11, 0xFFFFFFFF, true);
        pill.setLetterSpacing(0.12f);
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setColor(0x26FFFFFF);
        pillBg.setCornerRadius(100 * d);
        pill.setBackground(pillBg);
        pill.setPadding((int) (12 * d), (int) (5 * d), (int) (12 * d), (int) (5 * d));
        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        body.addView(pill, pillLp);

        TextView title = text(ctx, "", 26, 0xFFFFFFFF, true);
        title.setPadding(0, (int) (12 * d), 0, (int) (4 * d));
        body.addView(title);

        TextView message = text(ctx, "", 15, 0xCCFFFFFF, false);
        message.setLineSpacing(0, 1.2f);
        body.addView(message);

        // Stats row: countdown + end time
        LinearLayout stats = new LinearLayout(ctx);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams statsLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statsLp.topMargin = (int) (16 * d);
        body.addView(stats, statsLp);

        TextView countdown = text(ctx, "--:--", 22, 0xFFFFFFFF, true);
        countdown.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        LinearLayout countdownBox = statBox(ctx, d, countdown, st.countdownLabel);
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        l1.rightMargin = (int) (5 * d);
        stats.addView(countdownBox, l1);

        TextView endTime = text(ctx, "—", 22, 0xFFFFFFFF, true);
        LinearLayout endBox = statBox(ctx, d, endTime, st.endLabel);
        LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        l2.leftMargin = (int) (5 * d);
        stats.addView(endBox, l2);

        // Allowed apps chips (filled by the caller), horizontally scrollable.
        HorizontalScrollView chipsScroll = new HorizontalScrollView(ctx);
        chipsScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout allowed = new LinearLayout(ctx);
        allowed.setOrientation(LinearLayout.HORIZONTAL);
        chipsScroll.addView(allowed);
        LinearLayout.LayoutParams chipsLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        chipsLp.topMargin = (int) (12 * d);
        body.addView(chipsScroll, chipsLp);

        // Main button: Go home (accent gradient)
        Button home = new Button(ctx);
        home.setText("Go home");
        home.setAllCaps(false);
        home.setTextColor(0xFFFFFFFF);
        home.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        home.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable homeBg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{st.accent1, st.accent2});
        homeBg.setCornerRadius(100 * d);
        home.setBackground(homeBg);
        home.setStateListAnimator(null);
        LinearLayout.LayoutParams homeLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, (int) (52 * d));
        homeLp.topMargin = (int) (18 * d);
        body.addView(home, homeLp);

        // Secondary button: Emergency unlock (caller sets text / hides it)
        Button override = new Button(ctx);
        override.setText("Emergency unlock");
        override.setAllCaps(false);
        override.setTextColor(0xB3FFFFFF);
        override.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        GradientDrawable ovBg = new GradientDrawable();
        ovBg.setColor(Color.TRANSPARENT);
        ovBg.setStroke((int) Math.max(1, d), 0x40FFFFFF);
        ovBg.setCornerRadius(100 * d);
        override.setBackground(ovBg);
        override.setStateListAnimator(null);
        LinearLayout.LayoutParams ovLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, (int) (44 * d));
        ovLp.topMargin = (int) (10 * d);
        body.addView(override, ovLp);

        return new Handles(root, card, pill, title, message, countdown, countdownBox,
            endTime, allowed, home, override);
    }

    private static TextView text(Context ctx, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private static LinearLayout statBox(Context ctx, float d, TextView value, String label) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding((int) (14 * d), (int) (10 * d), (int) (14 * d), (int) (10 * d));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x1AFFFFFF);
        bg.setCornerRadius(16 * d);
        box.setBackground(bg);
        box.addView(value);
        TextView l = text(ctx, label, 10, 0x99FFFFFF, true);
        l.setLetterSpacing(0.14f);
        box.addView(l);
        return box;
    }

    /** Picture view: draws the scene once per size into a bitmap. */
    private static final class SceneView extends View {
        private final Style st;
        private Bitmap cache;
        SceneView(Context ctx, Style st) { super(ctx); this.st = st; }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            if (cache != null) { cache.recycle(); cache = null; }
            if (w <= 0 || h <= 0) return;
            try {
                cache = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                st.scene.draw(new Canvas(cache), w, h);
            } catch (Throwable t) {
                cache = null; // fall back to flat colour below
            }
        }

        @Override protected void onDraw(Canvas c) {
            if (cache != null) c.drawBitmap(cache, 0, 0, null);
            else c.drawColor(st.fallback);
        }

        @Override protected void onDetachedFromWindow() {
            super.onDetachedFromWindow();
            if (cache != null) { cache.recycle(); cache = null; }
        }
    }

    // ==================================================================
    // SHARED DRAWING TOOLKIT — used by both Scenes files.
    // ==================================================================

    /** Same colour, new alpha (0..255). */
    static int alpha(int color, int a) {
        return (Math.max(0, Math.min(255, a)) << 24) | (color & 0x00FFFFFF);
    }

    /** Small deterministic random generator, so every picture looks the same each time. */
    static class Rng {
        private long s;
        Rng(long seed) { s = seed * 2654435761L + 1; }
        float next() {
            s = (s * 6364136223846793005L + 1442695040888963407L);
            return ((s >>> 40) & 0xFFFFFF) / (float) 0x1000000;
        }
    }

    /** Alias used by the newer scenes. Same behaviour as Rng. */
    static final class Rnd extends Rng { Rnd(long seed) { super(seed); } }

    /** Two rolling hill layers along the bottom of the picture. */
    static void drawHills(Canvas c, int w, int h, int back, int front) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Path a = new Path();
        a.moveTo(0, h * 0.80f);
        a.cubicTo(w * 0.25f, h * 0.70f, w * 0.45f, h * 0.84f, w * 0.65f, h * 0.76f);
        a.cubicTo(w * 0.80f, h * 0.70f, w * 0.92f, h * 0.76f, w, h * 0.74f);
        a.lineTo(w, h); a.lineTo(0, h); a.close();
        p.setColor(back);
        c.drawPath(a, p);
        Path b = new Path();
        b.moveTo(0, h * 0.90f);
        b.cubicTo(w * 0.30f, h * 0.82f, w * 0.60f, h * 0.94f, w, h * 0.86f);
        b.lineTo(w, h); b.lineTo(0, h); b.close();
        p.setColor(front);
        c.drawPath(b, p);
    }

    /** A tiny cottage silhouette. (x, baseY) = bottom-left corner. */
    static void drawCottage(Canvas c, float x, float baseY, float size, int color, boolean litWindow) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        float bw = size * 1.1f, bh = size * 0.7f;
        c.drawRect(x, baseY - bh, x + bw, baseY, p);
        Path roof = new Path();
        roof.moveTo(x - size * 0.12f, baseY - bh);
        roof.lineTo(x + bw / 2f, baseY - bh - size * 0.55f);
        roof.lineTo(x + bw + size * 0.12f, baseY - bh);
        roof.close();
        c.drawPath(roof, p);
        c.drawRect(x + bw * 0.72f, baseY - bh - size * 0.5f, x + bw * 0.86f, baseY - bh - size * 0.15f, p);
        if (litWindow) {
            float wx = x + bw * 0.22f, wy = baseY - bh * 0.72f, ws = size * 0.26f;
            p.setShader(new RadialGradient(wx + ws / 2, wy + ws / 2, ws * 2.4f,
                alpha(0xFFFFC46B, 120), alpha(0xFFFFC46B, 0), Shader.TileMode.CLAMP));
            c.drawCircle(wx + ws / 2, wy + ws / 2, ws * 2.4f, p);
            p.setShader(null);
            p.setColor(0xFFFFD27A);
            c.drawRect(wx, wy, wx + ws, wy + ws, p);
        }
    }

    /**
     * Pen — draws in a fixed 360-unit-wide design space so every scene scales
     * to any card width. H is the picture height in the same units.
     * All x / y / size arguments below are design units, colours are ARGB.
     */
    static final class Pen {
        final Canvas c;
        final float sc;   // device pixels per design unit
        final float H;    // height in design units
        final float W = 360f;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        Pen(Canvas c, int w, int h) {
            this.c = c;
            this.sc = w / 360f;
            this.H = h / sc;
        }

        private Paint fill(int color) {
            p.reset();
            p.setAntiAlias(true);
            p.setStyle(Paint.Style.FILL);
            p.setColor(color);
            return p;
        }

        /** Vertical gradient band across the full width, from y0 to y1. */
        void vGrad(float y0, float y1, int[] colors, float[] pos) {
            Paint q = fill(0xFFFFFFFF);
            q.setShader(new LinearGradient(0, y0 * sc, 0, y1 * sc, colors, pos, Shader.TileMode.CLAMP));
            c.drawRect(0, y0 * sc, W * sc, y1 * sc, q);
            q.setShader(null);
        }

        /** n white stars between y0 and y1, radius minR..maxR. */
        void stars(Rng r, int n, float y0, float y1, float minR, float maxR) {
            for (int i = 0; i < n; i++) {
                float x = r.next() * W, y = y0 + r.next() * (y1 - y0);
                float rad = minR + r.next() * (maxR - minR);
                circle(x, y, rad, alpha(0xFFFFFFFF, 90 + (int) (r.next() * 150)));
            }
        }

        /** Soft round glow that fades to transparent. */
        void glow(float x, float y, float rad, int color, int a) {
            Paint q = fill(0xFFFFFFFF);
            q.setShader(new RadialGradient(x * sc, y * sc, Math.max(1f, rad * sc),
                alpha(color, a), alpha(color, 0), Shader.TileMode.CLAMP));
            c.drawCircle(x * sc, y * sc, rad * sc, q);
            q.setShader(null);
        }

        void circle(float x, float y, float rad, int color) {
            c.drawCircle(x * sc, y * sc, rad * sc, fill(color));
        }

        /** Mountain ridge across the width; filled down to the bottom. */
        void ridge(Rng r, float baseY, float amp, float rough, int color) {
            Path path = new Path();
            path.moveTo(0, H * sc);
            float prevX = 0, prevY = baseY - amp * r.next();
            path.lineTo(0, prevY * sc);
            for (float x = 24; x <= W + 24; x += 24) {
                float y = baseY - amp * (0.5f + (r.next() - 0.5f) * 2f * rough) - amp * 0.3f * r.next();
                float mx = (prevX + x) / 2f, my = (prevY + y) / 2f;
                path.quadTo(prevX * sc, prevY * sc, mx * sc, my * sc);
                prevX = x; prevY = y;
            }
            path.lineTo(W * sc, H * sc);
            path.close();
            c.drawPath(path, fill(color));
        }

        /** Soft oval (mist, cloud, reflection). blur in design units, 0 = sharp. */
        void blob(float cx, float cy, float rx, float ry, int color, int a, float blur) {
            Paint q = fill(alpha(color, a));
            if (blur > 0) q.setMaskFilter(new BlurMaskFilter(blur * sc, BlurMaskFilter.Blur.NORMAL));
            c.drawOval(new RectF((cx - rx) * sc, (cy - ry) * sc, (cx + rx) * sc, (cy + ry) * sc), q);
            q.setMaskFilter(null);
        }

        /** Thin wavy line across the width (water ripples). */
        void waveLine(float y, int color, float stroke, float amp) {
            Paint q = fill(color);
            q.setStyle(Paint.Style.STROKE);
            q.setStrokeWidth(Math.max(0.5f, stroke * sc * 0.6f));
            q.setStrokeCap(Paint.Cap.ROUND);
            Path path = new Path();
            path.moveTo(0, y * sc);
            for (float x = 0; x <= W; x += 6) {
                path.lineTo(x * sc, (y + (float) Math.sin(x / 14f + y) * amp) * sc);
            }
            c.drawPath(path, q);
        }

        /** Pine tree: base at (x, baseY), total height, widest width. */
        void pine(float x, float baseY, float height, float width, int color) {
            Paint q = fill(color);
            float trunkH = height * 0.12f;
            c.drawRect((x - width * 0.06f) * sc, (baseY - trunkH) * sc, (x + width * 0.06f) * sc, baseY * sc, q);
            float top = baseY - height, bottom = baseY - trunkH;
            int tiers = 3;
            for (int i = 0; i < tiers; i++) {
                float tTop = top + (bottom - top) * (i * 0.28f);
                float tBot = top + (bottom - top) * (0.45f + i * 0.275f);
                float hw = width / 2f * (0.55f + i * 0.225f);
                Path t = new Path();
                t.moveTo(x * sc, tTop * sc);
                t.lineTo((x + hw) * sc, tBot * sc);
                t.lineTo((x - hw) * sc, tBot * sc);
                t.close();
                c.drawPath(t, q);
            }
        }

        void rect(float l, float t, float r, float b, int color) {
            c.drawRect(l * sc, t * sc, r * sc, b * sc, fill(color));
        }

        /** Filled polygon from x,y pairs. */
        void poly(int color, float... xy) {
            if (xy.length < 6) return;
            Path path = new Path();
            path.moveTo(xy[0] * sc, xy[1] * sc);
            for (int i = 2; i + 1 < xy.length; i += 2) path.lineTo(xy[i] * sc, xy[i + 1] * sc);
            path.close();
            c.drawPath(path, fill(color));
        }

        void line(float x1, float y1, float x2, float y2, int color, float width) {
            Paint q = fill(color);
            q.setStyle(Paint.Style.STROKE);
            q.setStrokeWidth(Math.max(0.5f, width * sc));
            c.drawLine(x1 * sc, y1 * sc, x2 * sc, y2 * sc, q);
        }

        /** Light beam from (x, y) widening to the vertical span y1..y2 at toX, fading out. */
        void beam(float x, float y, float toX, float y1, float y2, int color, int a, float blur) {
            Paint q = fill(0xFFFFFFFF);
            q.setShader(new LinearGradient(x * sc, 0, toX * sc, 0,
                alpha(color, a), alpha(color, 0), Shader.TileMode.CLAMP));
            if (blur > 0) q.setMaskFilter(new BlurMaskFilter(blur * sc, BlurMaskFilter.Blur.NORMAL));
            Path path = new Path();
            path.moveTo(x * sc, y * sc);
            path.lineTo(toX * sc, y1 * sc);
            path.lineTo(toX * sc, y2 * sc);
            path.close();
            c.drawPath(path, q);
            q.setShader(null);
            q.setMaskFilter(null);
        }
    }
}
