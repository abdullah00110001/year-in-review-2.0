#!/usr/bin/env node
/**
 * apply_shield_card.mjs
 *
 * Installs the new Shield block card (overlay-first, 3s optional countdown,
 * same design as the approved mockup) into the LifeOS project.
 *
 *   node apply_shield_card.mjs            install (backup -> patch -> verify)
 *   node apply_shield_card.mjs --check    only verify what is installed now
 *   node apply_shield_card.mjs --dry-run  show what would change, write nothing
 *   node apply_shield_card.mjs --build    install, then run Gradle + tsc checks
 *   node apply_shield_card.mjs --rollback restore the newest backup
 *
 * Safety model:
 *   - every edit is anchored to exact existing text; if ANY anchor does not
 *     match exactly once, NOTHING is written
 *   - originals are copied to .shield_card_backup/<timestamp>/ first
 *   - after writing, the result is verified; on failure it rolls itself back
 *   - Sleep to Rise / Rise files are hashed before and after and must not change
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const J = 'android/app/src/main/java/com/mylifeos/app';
const MARK = '[SHIELD-CARD]';
const BACKUP_ROOT = path.join(ROOT, '.shield_card_backup');

const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => console.log('  \u2717 ' + m);
const info = (m) => console.log(m);

const abs = (rel) => path.join(ROOT, ...rel.split('/'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const L = (lines) => lines.join('\n');

function readText(rel) {
  const buf = fs.readFileSync(abs(rel));
  const raw = buf.toString('utf8');
  const crlf = raw.includes('\r\n');
  return { text: raw.replace(/\r\n/g, '\n'), crlf };
}
function writeText(rel, text, crlf) {
  const out = crlf ? text.replace(/\n/g, '\r\n') : text;
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), out, 'utf8');
}
function count(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// ---------------------------------------------------------------------------
// New / replaced files (full content)
// ---------------------------------------------------------------------------
const CARD_PATH = `${J}/shield/core/ShieldBlockCard.java`;
const ACTIVITY_PATH = `${J}/shield/ShieldBlockActivity.java`;

const CARD_JAVA = String.raw`package com.mylifeos.app.shield.core;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.mylifeos.app.shield.ShieldPreferences;

import java.util.Calendar;

/**
 * [SHIELD-CARD] The single Shield block card.
 *
 * One builder, three hosts: the accessibility overlay (BlockingOverlay), the
 * system overlay tier, and ShieldBlockActivity (last-resort fallback). Every
 * Shield block (app / daily limit / keyword / site / adult content) renders
 * from a {@link Spec} so the design can never drift between hosts.
 *
 * Pure Canvas + framework widgets: no assets, no network, no new dependency.
 * minSdk 24 safe (no blur, no RenderEffect).
 */
public final class ShieldBlockCard {

    private static final String TAG = "ShieldBlockCard";

    public enum Kind { APP, LIMIT, KEYWORD, SITE, CONTENT }

    public interface Callbacks {
        void onHome();
        void onGhost();
    }

    // icon ids
    static final int ICON_SHIELD = 0;
    static final int ICON_CLOCK = 1;
    static final int ICON_GLOBE = 2;
    static final int ICON_LOCK = 3;
    static final int ICON_SEARCH = 4;
    static final int ICON_ARROW = 5;

    private static final int COLOR_BASE = 0xFF0D1224;
    private static final int COLOR_TEXT = 0xFFF5F7FF;
    private static final int COLOR_TEXT2 = 0xFFA3AED0;
    private static final int COLOR_RIM = 0xFF1A2038;

    private ShieldBlockCard() {}

    // ------------------------------------------------------------------
    // Spec
    // ------------------------------------------------------------------

    public static final class Spec {
        public Kind kind = Kind.APP;
        public String pkg;
        public String appName = "This app";
        public String title = "Stay focused";
        public String sub = "";
        public String chipText = "Blocked by Shield";
        public int chipIcon = ICON_SHIELD;
        public float ringProgress = 1f;
        public String ringBig = "";
        public String ringLabel = "";
        public String emoji;
        public int a1 = 0xFF6366F1;
        public int a2 = 0xFFA855F7;
        public int glow1 = 0xFFEC4899;
        public int glow2 = 0xFF3B82F6;
        public boolean countdown = true;
        public String ghostLabel;
        public Drawable appIcon;
        public Bitmap backdropImage;

        /** Builds the spec from the same Intent extras the block activity has always used. */
        public static Spec fromIntent(Context ctx, Intent it, boolean allowGhost) {
            Spec s = new Spec();
            Context app = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;
            ShieldPreferences sp = new ShieldPreferences(app);

            String pkg = it.getStringExtra("BLOCKED_PACKAGE");
            boolean adult = it.getBooleanExtra("IS_ADULT_BLOCK", false);
            boolean limit = it.getBooleanExtra("IS_LIMIT_BLOCK", false);
            int limitMin = it.getIntExtra("LIMIT_MINUTES", 0);
            long escMs = it.getLongExtra("ESCALATION_REMAINING_MS", 0L);
            String kindExtra = it.getStringExtra("BLOCK_KIND");

            s.pkg = pkg;
            s.appName = resolveAppName(app, pkg);
            s.countdown = safeCountdown(sp);
            s.ghostLabel = (allowGhost && !safeStrict(sp)) ? "I opened this by mistake" : null;

            SharedPreferences cap = app.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String themeId = safeString(sp.getBlockScreenTheme(), null);
            if (themeId == null || themeId.isEmpty()) themeId = cap.getString("shield_block_screen_theme", "default");
            applyTheme(s, themeId);

            String customText = safeString(sp.getBlockScreenText(), "");
            if (customText.isEmpty()) customText = cap.getString("shield_block_screen_text", "");
            if (customText == null) customText = "";
            customText = customText.trim();
            if (customText.startsWith("Stay Focused on your GOALS")) customText = "";

            if ("custom".equals(themeId)) {
                String img = cap.getString("shield_block_screen_image", null);
                if (img != null && !img.isEmpty()) {
                    DisplayMetrics dm = app.getResources().getDisplayMetrics();
                    s.backdropImage = decodeBase64(img, Math.max(dm.widthPixels, dm.heightPixels));
                }
            }

            if (limit) {
                s.kind = Kind.LIMIT;
                s.title = "Daily limit reached";
                s.sub = "You've used your " + fmtShort(limitMin) + " on\n" + s.appName + " today.";
                s.ringProgress = 1f;
                s.ringBig = fmtBig(limitMin);
                s.ringLabel = "used today";
                s.chipIcon = ICON_CLOCK;
                s.chipText = resetIn(safeStartHour(sp));
            } else if (adult && "keyword".equals(kindExtra)) {
                s.kind = Kind.KEYWORD;
                s.title = "Blocked keyword";
                s.sub = "This search has a word\nyou chose to avoid.";
                s.chipIcon = ICON_SHIELD;
                s.chipText = "Keyword filter";
            } else if (adult && "site".equals(kindExtra)) {
                s.kind = Kind.SITE;
                s.title = "Site blocked";
                s.sub = "This site is on your\nblock list.";
                s.chipIcon = ICON_GLOBE;
                s.chipText = "Site filter";
            } else if (adult) {
                s.kind = Kind.CONTENT;
                String style = safeString(sp.getAdultBlockScreenStyle(), "focus");
                String custom = safeString(sp.getAdultBlockCustomMessage(), "");
                applyAdultStyle(s, style);
                if ("custom".equals(style) && !custom.isEmpty()) s.sub = custom;
                s.chipIcon = ICON_SHIELD;
                s.chipText = "Content filter";
                if (escMs > 0) {
                    int mins = (int) Math.max(1, (escMs + 59_999L) / 60_000L);
                    s.chipIcon = ICON_CLOCK;
                    s.chipText = "Paused · " + fmtShort(mins) + " left";
                }
            } else {
                s.kind = Kind.APP;
                s.title = "Stay focused";
                s.sub = !customText.isEmpty() ? customText
                    : s.appName + " is blocked right now.\nYou're doing great.";
                s.chipIcon = ICON_SHIELD;
                s.chipText = "Blocked by Shield";
            }

            if (s.kind == Kind.APP || s.kind == Kind.LIMIT) {
                s.appIcon = resolveAppIcon(app, pkg);
            }
            return s;
        }

        /** Generic spec for callers that only have a title + message (safety net). */
        public static Spec generic(String title, String message) {
            Spec s = new Spec();
            s.kind = Kind.CONTENT;
            s.title = title == null || title.isEmpty() ? "Stay focused" : title;
            s.sub = message == null ? "" : message;
            s.chipText = "Blocked by Shield";
            return s;
        }
    }

    private static boolean safeCountdown(ShieldPreferences sp) {
        try { return sp.isBlockCountdownEnabled(); } catch (Throwable t) { return true; }
    }

    private static boolean safeStrict(ShieldPreferences sp) {
        try { return sp.isStrictMode(); } catch (Throwable t) { return false; }
    }

    private static int safeStartHour(ShieldPreferences sp) {
        try { return Math.max(0, Math.min(23, sp.getStartOfDayHour())); } catch (Throwable t) { return 0; }
    }

    private static String safeString(String v, String fallback) {
        return v == null ? fallback : v;
    }

    private static void applyTheme(Spec s, String id) {
        if (id == null) id = "default";
        switch (id) {
            case "ocean":
                set(s, 0xFF0EA5E9, 0xFF14B8A6, 0xFF06B6D4, 0xFF3B82F6); break;
            case "sunset":
                set(s, 0xFFF43F5E, 0xFFFB923C, 0xFFF97316, 0xFFEC4899); break;
            case "forest":
            case "nature":
                set(s, 0xFF10B981, 0xFF0F766E, 0xFF10B981, 0xFF14B8A6); break;
            case "midnight":
                set(s, 0xFF4F46E5, 0xFF1E3A8A, 0xFF4338CA, 0xFF1D4ED8); break;
            case "mono":
            case "minimal":
                set(s, 0xFFA1A1AA, 0xFF52525B, 0xFF71717A, 0xFF52525B); break;
            case "rose":
                set(s, 0xFFF472B6, 0xFFE11D48, 0xFFEC4899, 0xFFF43F5E); break;
            default:
                set(s, 0xFF6366F1, 0xFFA855F7, 0xFFEC4899, 0xFF3B82F6); break;
        }
    }

    private static void set(Spec s, int a1, int a2, int g1, int g2) {
        s.a1 = a1; s.a2 = a2; s.glow1 = g1; s.glow2 = g2;
    }

    private static void applyAdultStyle(Spec s, String style) {
        if (style == null) style = "focus";
        switch (style) {
            case "reminder":
                s.emoji = "\uD83D\uDC94"; s.title = "Not Today";
                s.sub = "Remember your goals.\nYou can do this.";
                set(s, 0xFFF43F5E, 0xFFFB923C, 0xFFF43F5E, 0xFFFB923C); break;
            case "strict":
                s.emoji = "\uD83D\uDEAB"; s.title = "Access Denied";
                s.sub = "This content is blocked.\nFocus Shield is protecting you.";
                set(s, 0xFFEF4444, 0xFFB91C1C, 0xFFDC2626, 0xFF7F1D1D); break;
            case "motivate":
                s.emoji = "\uD83D\uDCAA"; s.title = "You Got This!";
                s.sub = "Every time you resist,\nyou grow stronger.";
                set(s, 0xFF8B5CF6, 0xFF6366F1, 0xFF8B5CF6, 0xFF6366F1); break;
            case "streak":
                s.emoji = "\uD83D\uDD25"; s.title = "Don't Break It!";
                s.sub = "Stay strong.\nDon't ruin your progress.";
                set(s, 0xFFF97316, 0xFFEF4444, 0xFFF97316, 0xFFEF4444); break;
            case "islamic":
                s.emoji = "\u262A\uFE0F"; s.title = "\u0627\u062A\u0642 \u0627\u0644\u0644\u0647";
                s.sub = "Fear Allah.\nGuard your eyes and heart.\n\n\u063A\u064F\u0636\u0651\u064E \u0628\u064E\u0635\u064E\u0631\u064E\u0643\u064E";
                set(s, 0xFF10B981, 0xFF0D9488, 0xFF10B981, 0xFF0D9488); break;
            default:
                s.emoji = null; s.title = "Stay Focused";
                s.sub = "This content is blocked.\nYou are better than this.";
                break;
        }
    }

    // ------------------------------------------------------------------
    // Data helpers
    // ------------------------------------------------------------------

    static String resolveAppName(Context ctx, String pkg) {
        if (pkg == null || pkg.isEmpty()) return "This app";
        try {
            PackageManager pm = ctx.getPackageManager();
            CharSequence label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0));
            if (label != null && label.length() > 0) return label.toString();
        } catch (Throwable ignored) {}
        String[] parts = pkg.split("\\.");
        String name = parts[parts.length - 1];
        if (name.isEmpty()) return "This app";
        return name.substring(0, 1).toUpperCase() + name.substring(1);
    }

    static Drawable resolveAppIcon(Context ctx, String pkg) {
        if (pkg == null || pkg.isEmpty()) return null;
        try { return ctx.getPackageManager().getApplicationIcon(pkg); }
        catch (Throwable t) { return null; }
    }

    static String fmtShort(int m) {
        if (m <= 0) return "0m";
        int h = m / 60, r = m % 60;
        if (h == 0) return m + "m";
        return r == 0 ? h + "h" : h + "h " + r + "m";
    }

    static String fmtBig(int m) {
        if (m < 0) m = 0;
        int h = m / 60, r = m % 60;
        if (h == 0) return m + "m";
        return h + "h " + (r < 10 ? "0" : "") + r + "m";
    }

    static String resetIn(int startHour) {
        Calendar now = Calendar.getInstance();
        Calendar next = (Calendar) now.clone();
        next.set(Calendar.HOUR_OF_DAY, startHour);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (!next.after(now)) next.add(Calendar.DAY_OF_YEAR, 1);
        long mins = (next.getTimeInMillis() - now.getTimeInMillis()) / 60_000L;
        long h = mins / 60, r = mins % 60;
        return "Resets in " + (h > 0 ? h + "h " + r + "m" : Math.max(1, r) + "m");
    }

    static Bitmap decodeBase64(String data, int maxDim) {
        try {
            int comma = data.indexOf(',');
            if (comma >= 0) data = data.substring(comma + 1);
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            int sample = 1;
            while (o.outWidth / sample > maxDim * 2 || o.outHeight / sample > maxDim * 2) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o2);
        } catch (Throwable t) {
            return null;
        }
    }

    static boolean animationsOn(Context ctx) {
        try {
            return Settings.Global.getFloat(ctx.getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f;
        } catch (Throwable t) {
            return true;
        }
    }

    static int blend(int c, int with, float amount) {
        int a = Math.round(Color.alpha(c) * (1 - amount) + Color.alpha(with) * amount);
        int r = Math.round(Color.red(c) * (1 - amount) + Color.red(with) * amount);
        int g = Math.round(Color.green(c) * (1 - amount) + Color.green(with) * amount);
        int b = Math.round(Color.blue(c) * (1 - amount) + Color.blue(with) * amount);
        return Color.argb(a, r, g, b);
    }

    static int alpha(int c, int a) {
        return Color.argb(a, Color.red(c), Color.green(c), Color.blue(c));
    }

    // ------------------------------------------------------------------
    // Icons (24x24 space, stroke based)
    // ------------------------------------------------------------------

    static Path iconPath(int id) {
        Path p = new Path();
        switch (id) {
            case ICON_SHIELD:
                p.moveTo(12f, 3f);
                p.lineTo(19.5f, 6f);
                p.lineTo(19.5f, 11.5f);
                p.cubicTo(19.5f, 16.1f, 16.4f, 19.9f, 12f, 21f);
                p.cubicTo(7.6f, 19.9f, 4.5f, 16.1f, 4.5f, 11.5f);
                p.lineTo(4.5f, 6f);
                p.close();
                break;
            case ICON_CLOCK:
                p.addCircle(12f, 12f, 8.5f, Path.Direction.CW);
                p.moveTo(12f, 7.5f);
                p.lineTo(12f, 12f);
                p.lineTo(15f, 14f);
                break;
            case ICON_GLOBE:
                p.addCircle(12f, 12f, 8.5f, Path.Direction.CW);
                p.moveTo(3.5f, 12f);
                p.lineTo(20.5f, 12f);
                p.addOval(new RectF(8.4f, 3.5f, 15.6f, 20.5f), Path.Direction.CW);
                break;
            case ICON_LOCK:
                p.addRoundRect(new RectF(5.5f, 11f, 18.5f, 20f), 2.5f, 2.5f, Path.Direction.CW);
                p.moveTo(8.5f, 11f);
                p.lineTo(8.5f, 8f);
                p.arcTo(new RectF(8.5f, 4.5f, 15.5f, 11.5f), 180f, 180f);
                p.lineTo(15.5f, 11f);
                break;
            case ICON_SEARCH:
                p.addCircle(11f, 11f, 6.5f, Path.Direction.CW);
                p.moveTo(16f, 16f);
                p.lineTo(20.5f, 20.5f);
                p.moveTo(4f, 4f);
                p.lineTo(20f, 20f);
                break;
            case ICON_ARROW:
            default:
                p.moveTo(5f, 12f);
                p.lineTo(19f, 12f);
                p.moveTo(13f, 6f);
                p.lineTo(19f, 12f);
                p.lineTo(13f, 18f);
                break;
        }
        return p;
    }

    private static Paint strokePaint(int color, float width) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeWidth(width);
        p.setColor(color);
        return p;
    }

    /** Draws icon id centred at (cx, cy) with the given pixel size. */
    private static void drawIcon(Canvas c, int id, float cx, float cy, float size,
                                 int color, float strokeUnits) {
        Path p = iconPath(id);
        Paint paint = strokePaint(color, strokeUnits);
        c.save();
        c.translate(cx - size / 2f, cy - size / 2f);
        float sc = size / 24f;
        c.scale(sc, sc);
        c.drawPath(p, paint);
        c.restore();
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    private static final class IconView extends View {
        private final int id;
        private final int color;
        private final float units;

        IconView(Context ctx, int id, int color, float units) {
            super(ctx);
            this.id = id; this.color = color; this.units = units;
        }

        @Override protected void onDraw(Canvas c) {
            float s = Math.min(getWidth(), getHeight());
            drawIcon(c, id, getWidth() / 2f, getHeight() / 2f, s, color, units);
        }
    }

    private static final class BackdropView extends View {
        private final Spec spec;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Shader g1, g2;

        BackdropView(Context ctx, Spec spec) {
            super(ctx);
            this.spec = spec;
        }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            g1 = new RadialGradient(w * 0.88f, h * 0.06f, Math.max(w, 1) * 0.85f,
                alpha(spec.glow1, 120), alpha(spec.glow1, 0), Shader.TileMode.CLAMP);
            g2 = new RadialGradient(w * 0.08f, h * 0.96f, Math.max(w, 1) * 1.0f,
                alpha(spec.glow2, 110), alpha(spec.glow2, 0), Shader.TileMode.CLAMP);
        }

        @Override protected void onDraw(Canvas c) {
            int w = getWidth(), h = getHeight();
            c.drawColor(COLOR_BASE);
            Bitmap bmp = spec.backdropImage;
            if (bmp != null && !bmp.isRecycled() && bmp.getWidth() > 0 && bmp.getHeight() > 0) {
                float sc = Math.max(w / (float) bmp.getWidth(), h / (float) bmp.getHeight());
                Matrix m = new Matrix();
                m.postScale(sc, sc);
                m.postTranslate((w - bmp.getWidth() * sc) / 2f, (h - bmp.getHeight() * sc) / 2f);
                c.drawBitmap(bmp, m, null);
                paint.setShader(null);
                paint.setColor(Color.argb(160, 6, 8, 18));
                c.drawRect(0, 0, w, h, paint);
                return;
            }
            if (g1 != null) { paint.setShader(g1); c.drawRect(0, 0, w, h, paint); }
            if (g2 != null) { paint.setShader(g2); c.drawRect(0, 0, w, h, paint); }
            paint.setShader(null);
            paint.setColor(Color.argb(70, 6, 8, 18));
            c.drawRect(0, 0, w, h, paint);
        }
    }

    private static final class AccentLine extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int color;

        AccentLine(Context ctx, int color) { super(ctx); this.color = color; }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            paint.setShader(new LinearGradient(0, 0, w, 0,
                new int[]{alpha(color, 0), color, alpha(color, 0)}, null, Shader.TileMode.CLAMP));
        }

        @Override protected void onDraw(Canvas c) {
            c.drawRoundRect(new RectF(0, 0, getWidth(), getHeight()), getHeight() / 2f, getHeight() / 2f, paint);
        }
    }

    private static final class BadgeView extends View {
        private final Spec spec;
        private final float em;
        private final boolean animate;
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path shield = iconPath(ICON_SHIELD);
        private final Path check = new Path();
        private ValueAnimator anim;
        private float t = 0.35f;

        BadgeView(Context ctx, Spec spec, float em) {
            super(ctx);
            this.spec = spec;
            this.em = em;
            this.animate = animationsOn(ctx);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(Math.max(2f, em * 0.09f));
            text.setTextAlign(Paint.Align.CENTER);
            check.moveTo(8.5f, 12.2f);
            check.lineTo(11f, 14.7f);
            check.lineTo(15.6f, 9.7f);
        }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (!animate) return;
            try {
                anim = ValueAnimator.ofFloat(0f, 1f);
                anim.setDuration(2800);
                anim.setInterpolator(new LinearInterpolator());
                anim.setRepeatCount(ValueAnimator.INFINITE);
                anim.addUpdateListener(a -> { t = (float) a.getAnimatedValue(); invalidate(); });
                anim.start();
            } catch (Throwable ignored) {}
        }

        @Override protected void onDetachedFromWindow() {
            if (anim != null) { anim.cancel(); anim = null; }
            super.onDetachedFromWindow();
        }

        @Override protected void onDraw(Canvas c) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float r = em * 2.7f;

            // pulse ring
            float pr = r * (0.8f + 0.45f * t) + em * 0.9f * t;
            ring.setColor(alpha(spec.a2, Math.round(140 * (1f - t))));
            c.drawCircle(cx, cy, pr, ring);

            // soft glow
            fill.setShader(null);
            for (int i = 3; i >= 1; i--) {
                fill.setColor(alpha(spec.a2, 14 * (4 - i)));
                c.drawCircle(cx, cy + em * 0.25f, r + em * 0.32f * i, fill);
            }
            // rim + gradient body
            fill.setColor(COLOR_RIM);
            c.drawCircle(cx, cy, r, fill);
            fill.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r,
                spec.a1, spec.a2, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, r - em * 0.28f, fill);
            fill.setShader(null);

            if (spec.emoji != null) {
                text.setTextSize(em * 2.3f);
                Paint.FontMetrics fm = text.getFontMetrics();
                c.drawText(spec.emoji, cx, cy - (fm.ascent + fm.descent) / 2f, text);
                return;
            }
            float size = em * 2.5f;
            float sc = size / 24f;
            c.save();
            c.translate(cx - size / 2f, cy - size / 2f);
            c.scale(sc, sc);
            Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
            f.setStyle(Paint.Style.FILL);
            f.setColor(Color.argb(46, 255, 255, 255));
            c.drawPath(shield, f);
            c.drawPath(shield, strokePaint(Color.WHITE, 1.8f));
            c.drawPath(check, strokePaint(Color.WHITE, 1.8f));
            c.restore();
        }
    }

    private static final class RingView extends View {
        private final Spec spec;
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float progress;
        private ValueAnimator anim;

        RingView(Context ctx, Spec spec) {
            super(ctx);
            this.spec = spec;
            this.progress = animationsOn(ctx) ? 0f : spec.ringProgress;
            track.setStyle(Paint.Style.STROKE);
            track.setColor(Color.argb(23, 255, 255, 255));
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (!animationsOn(getContext())) { progress = spec.ringProgress; return; }
            try {
                anim = ValueAnimator.ofFloat(0f, spec.ringProgress);
                anim.setDuration(1300);
                anim.setInterpolator(new DecelerateInterpolator(2f));
                anim.addUpdateListener(a -> { progress = (float) a.getAnimatedValue(); invalidate(); });
                anim.start();
            } catch (Throwable t) { progress = spec.ringProgress; }
        }

        @Override protected void onDetachedFromWindow() {
            if (anim != null) { anim.cancel(); anim = null; }
            super.onDetachedFromWindow();
        }

        @Override protected void onDraw(Canvas c) {
            float s = Math.min(getWidth(), getHeight());
            float stroke = s * 8f / 120f;
            float r = s * 52f / 120f;
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            box.set(cx - r, cy - r, cx + r, cy + r);

            track.setStrokeWidth(stroke);
            c.drawOval(box, track);

            float sweep = 360f * Math.max(0f, Math.min(1f, progress));
            if (sweep <= 0.5f) return;
            arc.setShader(null);
            int[] glowAlpha = {26, 16, 8};
            for (int i = 0; i < glowAlpha.length; i++) {
                arc.setColor(alpha(spec.a2, glowAlpha[i]));
                arc.setStrokeWidth(stroke + stroke * 0.8f * (glowAlpha.length - i));
                c.drawArc(box, -90f, sweep, false, arc);
            }
            arc.setStrokeWidth(stroke);
            arc.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r,
                spec.a1, spec.a2, Shader.TileMode.CLAMP));
            c.drawArc(box, -90f, sweep, false, arc);
        }
    }

    private static final class TileView extends View {
        private final Spec spec;
        private final float em;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        TileView(Context ctx, Spec spec, float em) {
            super(ctx);
            this.spec = spec;
            this.em = em;
        }

        @Override protected void onDraw(Canvas c) {
            boolean app = spec.kind == Kind.APP || spec.kind == Kind.LIMIT;
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float half = em * 3.2f;
            RectF tile = new RectF(cx - half, cy - half, cx + half, cy + half);
            float radius = app ? em * 1.75f : half;

            p.setStyle(Paint.Style.FILL);
            p.setShader(null);
            float[] spread = {em * 1.2f, em * 0.6f};
            int[] a = {6, 10};
            for (int i = 0; i < 2; i++) {
                p.setColor(Color.argb(a[i], 255, 255, 255));
                RectF h = new RectF(tile);
                h.inset(-spread[i], -spread[i]);
                c.drawRoundRect(h, radius + spread[i], radius + spread[i], p);
            }

            if (app) {
                Drawable icon = spec.appIcon;
                if (icon != null) {
                    c.save();
                    Path clip = new Path();
                    clip.addRoundRect(tile, radius, radius, Path.Direction.CW);
                    c.clipPath(clip);
                    icon.setBounds(Math.round(tile.left), Math.round(tile.top),
                        Math.round(tile.right), Math.round(tile.bottom));
                    icon.draw(c);
                    c.restore();
                } else {
                    p.setShader(new LinearGradient(tile.left, tile.top, tile.right, tile.bottom,
                        new int[]{0xFFF59E4B, 0xFFE0567F, 0xFF7C5CD6}, null, Shader.TileMode.CLAMP));
                    c.drawRoundRect(tile, radius, radius, p);
                    p.setShader(null);
                    String letter = spec.appName != null && !spec.appName.isEmpty()
                        ? spec.appName.substring(0, 1).toUpperCase() : "?";
                    Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
                    tp.setColor(Color.WHITE);
                    tp.setTypeface(Typeface.DEFAULT_BOLD);
                    tp.setTextAlign(Paint.Align.CENTER);
                    tp.setTextSize(em * 3f);
                    Paint.FontMetrics fm = tp.getFontMetrics();
                    c.drawText(letter, cx, cy - (fm.ascent + fm.descent) / 2f, tp);
                }
                // lock badge, bottom-right
                float lr = em * 1.15f;
                float lx = tile.right - em * 0.55f, ly = tile.bottom - em * 0.55f;
                p.setColor(COLOR_RIM);
                c.drawCircle(lx, ly, lr, p);
                p.setShader(new LinearGradient(lx - lr, ly - lr, lx + lr, ly + lr,
                    spec.a1, spec.a2, Shader.TileMode.CLAMP));
                c.drawCircle(lx, ly, lr - em * 0.2f, p);
                p.setShader(null);
                drawIcon(c, ICON_LOCK, lx, ly, em * 1.2f, Color.WHITE, 2.2f);
            } else {
                p.setColor(Color.argb(18, 255, 255, 255));
                c.drawCircle(cx, cy, half, p);
                Paint edge = strokePaint(Color.argb(36, 255, 255, 255), Math.max(1f, em * 0.06f));
                c.drawCircle(cx, cy, half, edge);
                int glyph = spec.kind == Kind.SITE ? ICON_GLOBE : ICON_SEARCH;
                drawIcon(c, glyph, cx, cy, em * 3.2f, blend(spec.a1, Color.WHITE, 0.7f), 1.7f);
            }
        }
    }

    // ------------------------------------------------------------------
    // Root + layout
    // ------------------------------------------------------------------

    /** Builds the full-screen card view. Throws on unexpected failure: callers must fall back. */
    public static View build(Context ctx, Spec spec, Callbacks cb) {
        return new Root(ctx, spec, cb);
    }

    private static final class Root extends FrameLayout {
        private final Spec spec;
        private final Callbacks cb;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private TextView ctaLabel;
        private int remaining = 3;
        private boolean fired = false;
        private boolean attached = false;

        private final Runnable tick = new Runnable() {
            @Override public void run() {
                if (fired || !attached) return;
                remaining--;
                if (remaining <= 0) {
                    fired = true;
                    try { cb.onHome(); } catch (Throwable t) { Log.w(TAG, "auto-close failed", t); }
                    return;
                }
                updateCta();
                handler.postDelayed(this, 1000);
            }
        };

        Root(Context ctx, Spec spec, Callbacks cb) {
            super(ctx);
            this.spec = spec;
            this.cb = cb;
            setClickable(true);
            setFocusable(true);
            rebuild();
        }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            attached = true;
            if (spec.countdown && !fired) {
                updateCta();
                handler.removeCallbacks(tick);
                handler.postDelayed(tick, 1000);
            }
        }

        @Override protected void onDetachedFromWindow() {
            attached = false;
            handler.removeCallbacks(tick);
            super.onDetachedFromWindow();
        }

        @Override protected void onConfigurationChanged(Configuration newConfig) {
            super.onConfigurationChanged(newConfig);
            try { rebuild(); } catch (Throwable t) { Log.w(TAG, "rebuild failed", t); }
        }

        private void updateCta() {
            if (ctaLabel == null) return;
            ctaLabel.setText(spec.countdown && !fired ? "Go home \u00B7 " + remaining : "Go home");
        }

        private void fireHome() {
            fired = true;
            handler.removeCallbacks(tick);
            cb.onHome();
        }

        private void rebuild() {
            removeAllViews();
            Context ctx = getContext();
            DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
            int W = dm.widthPixels, H = dm.heightPixels;
            boolean land = W > H;
            float d = dm.density;
            float em = Math.max(14f * d, Math.min(22f * d, 0.043f * Math.min(W, H)));
            boolean compact = !land && (H / d) < 640f;
            boolean hasVis = spec.kind != Kind.CONTENT;

            addView(new BackdropView(ctx, spec),
                new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

            ScrollView scroll = new ScrollView(ctx);
            scroll.setFillViewport(true);
            scroll.setVerticalScrollBarEnabled(false);
            scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
            scroll.setClipChildren(false);
            scroll.setClipToPadding(false);
            addView(scroll, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

            LinearLayout page = new LinearLayout(ctx);
            page.setOrientation(LinearLayout.VERTICAL);
            page.setGravity(Gravity.CENTER);
            page.setClipChildren(false);
            page.setClipToPadding(false);
            page.setPadding(0, Math.round(em), 0, Math.round(em));
            scroll.addView(page, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

            int cardW = Math.round(land ? Math.min(em * 38f, W - em * 3f) : Math.min(em * 23f, W - em * 2.4f));
            FrameLayout holder = new FrameLayout(ctx);
            holder.setClipChildren(false);
            holder.setClipToPadding(false);
            page.addView(holder, new LinearLayout.LayoutParams(cardW, LinearLayout.LayoutParams.WRAP_CONTENT));

            int badgeBox = Math.round(em * 9.4f);
            int cardTop = badgeBox / 2;

            // ---- card ----
            LinearLayout card = new LinearLayout(ctx);
            card.setOrientation(land && hasVis ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
            card.setGravity(land && hasVis ? Gravity.CENTER_VERTICAL : Gravity.CENTER_HORIZONTAL);
            int padTop = Math.round(em * (land ? 3.4f : 3.6f));
            card.setPadding(Math.round(em * 1.6f), padTop, Math.round(em * 1.6f), Math.round(em * 1.6f));
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xF2242C47, 0xF2161C32});
            bg.setCornerRadius(em * 2.1f);
            bg.setStroke(Math.max(1, Math.round(d)), 0x26FFFFFF);
            card.setBackground(bg);
            FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
            cardLp.topMargin = cardTop;
            holder.addView(card, cardLp);

            // accent line on top edge
            FrameLayout.LayoutParams lineLp = new FrameLayout.LayoutParams(
                Math.round(cardW * 0.72f), Math.max(2, Math.round(d * 2)));
            lineLp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lineLp.topMargin = cardTop;
            holder.addView(new AccentLine(ctx, spec.a2), lineLp);

            // ---- visual (ring / tile) ----
            View vis = null;
            int visPx = Math.round(em * (compact ? 8f : (land ? 9f : 10f)));
            if (spec.kind == Kind.LIMIT) {
                FrameLayout ringBox = new FrameLayout(ctx);
                ringBox.addView(new RingView(ctx, spec),
                    new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                LinearLayout center = new LinearLayout(ctx);
                center.setOrientation(LinearLayout.VERTICAL);
                center.setGravity(Gravity.CENTER);
                center.addView(text(spec.ringBig, em * (compact || land ? 1.5f : 1.85f), COLOR_TEXT, true, Gravity.CENTER));
                TextView lbl = text(spec.ringLabel, em * 0.82f, COLOR_TEXT2, false, Gravity.CENTER);
                center.addView(lbl);
                ringBox.addView(center, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                vis = ringBox;
            } else if (hasVis) {
                vis = new TileView(ctx, spec, em * (compact ? 0.86f : (land ? 0.9f : 1f)));
            }

            // ---- text column ----
            LinearLayout col = new LinearLayout(ctx);
            col.setOrientation(LinearLayout.VERTICAL);
            col.setGravity(land && hasVis ? Gravity.START : Gravity.CENTER_HORIZONTAL);

            TextView title = text(spec.title, em * 1.7f, COLOR_TEXT, true, land && hasVis ? Gravity.START : Gravity.CENTER);
            title.setMaxLines(2);
            LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            tLp.bottomMargin = Math.round(em * 0.3f);
            col.addView(title, tLp);

            TextView sub = text(spec.sub, em, COLOR_TEXT2, false, land && hasVis ? Gravity.START : Gravity.CENTER);
            sub.setLineSpacing(0f, 1.3f);
            LinearLayout.LayoutParams sLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            sLp.bottomMargin = Math.round(em * (land ? 1.0f : 1.3f));
            col.addView(sub, sLp);

            if (vis != null && !land) {
                LinearLayout.LayoutParams vLp = new LinearLayout.LayoutParams(visPx, visPx);
                vLp.gravity = Gravity.CENTER_HORIZONTAL;
                vLp.bottomMargin = Math.round(em * 1.2f);
                col.addView(vis, vLp);
            }

            // chip
            LinearLayout chip = new LinearLayout(ctx);
            chip.setOrientation(LinearLayout.HORIZONTAL);
            chip.setGravity(Gravity.CENTER_VERTICAL);
            int tint = blend(spec.a1, Color.WHITE, 0.65f);
            int ic = Math.round(em * 1.15f);
            LinearLayout.LayoutParams icLp = new LinearLayout.LayoutParams(ic, ic);
            icLp.rightMargin = Math.round(em * 0.5f);
            chip.addView(new IconView(ctx, spec.chipIcon, tint, 2f), icLp);
            chip.addView(text(spec.chipText, em * 0.85f, tint, false, Gravity.CENTER));
            chip.setPadding(Math.round(em * 1.0f), Math.round(em * 0.6f), Math.round(em * 1.0f), Math.round(em * 0.6f));
            GradientDrawable chipBg = new GradientDrawable();
            chipBg.setColor(0x12FFFFFF);
            chipBg.setCornerRadius(em * 2f);
            chipBg.setStroke(Math.max(1, Math.round(d)), 0x1AFFFFFF);
            chip.setBackground(chipBg);
            LinearLayout.LayoutParams chipLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipLp.bottomMargin = Math.round(em * 1.4f);
            chipLp.gravity = land && hasVis ? Gravity.START : Gravity.CENTER_HORIZONTAL;
            col.addView(chip, chipLp);

            // CTA
            LinearLayout cta = new LinearLayout(ctx);
            cta.setOrientation(LinearLayout.HORIZONTAL);
            cta.setGravity(Gravity.CENTER);
            GradientDrawable ctaBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{spec.a1, spec.a2});
            ctaBg.setCornerRadius(em * 3f);
            cta.setBackground(ctaBg);
            ctaLabel = text("Go home", em * 1.02f, Color.WHITE, true, Gravity.CENTER);
            cta.addView(ctaLabel);
            int ai = Math.round(em * 1.15f);
            LinearLayout.LayoutParams aLp = new LinearLayout.LayoutParams(ai, ai);
            aLp.leftMargin = Math.round(em * 0.5f);
            cta.addView(new IconView(ctx, ICON_ARROW, Color.WHITE, 2.2f), aLp);
            cta.setClickable(true);
            cta.setFocusable(true);
            cta.setOnClickListener(v -> { try { fireHome(); } catch (Throwable t) { Log.w(TAG, "home failed", t); } });
            cta.setOnTouchListener((v, e) -> {
                int a = e.getActionMasked();
                if (a == MotionEvent.ACTION_DOWN) { v.setScaleX(0.97f); v.setScaleY(0.97f); }
                else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) { v.setScaleX(1f); v.setScaleY(1f); }
                return false;
            });
            col.addView(cta, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Math.round(em * 3.4f)));

            // ghost ("opened by mistake")
            if (spec.ghostLabel != null) {
                TextView ghost = text(spec.ghostLabel, em * 0.85f, COLOR_TEXT2, false, Gravity.CENTER);
                ghost.setPadding(0, Math.round(em * 0.9f), 0, Math.round(em * 0.2f));
                ghost.setClickable(true);
                ghost.setOnClickListener(v -> {
                    fired = true;
                    handler.removeCallbacks(tick);
                    try { cb.onGhost(); } catch (Throwable t) { Log.w(TAG, "ghost failed", t); }
                });
                col.addView(ghost, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            }

            if (land && hasVis && vis != null) {
                LinearLayout.LayoutParams vLp = new LinearLayout.LayoutParams(visPx, visPx);
                vLp.rightMargin = Math.round(em * 1.8f);
                card.addView(vis, vLp);
                card.addView(col, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            } else {
                card.addView(col, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            }

            // badge last so it floats above the card edge
            FrameLayout.LayoutParams bLp = new FrameLayout.LayoutParams(badgeBox, badgeBox);
            bLp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            holder.addView(new BadgeView(ctx, spec, em), bLp);

            updateCta();
        }

        private TextView text(String value, float px, int color, boolean bold, int gravity) {
            TextView tv = new TextView(getContext());
            tv.setText(value == null ? "" : value);
            tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, px);
            tv.setTextColor(color);
            tv.setGravity(gravity);
            tv.setIncludeFontPadding(false);
            if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
            return tv;
        }
    }

    /**
     * Last-resort plain view, used only if {@link #build} throws. Never lets a
     * rendering bug leave the person without a way out.
     */
    public static View fallback(Context ctx, String title, String message, Callbacks cb) {
        LinearLayout root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(COLOR_BASE);
        int pad = Math.round(28 * ctx.getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);
        TextView t = new TextView(ctx);
        t.setText(title == null ? "Stay focused" : title);
        t.setTextColor(Color.WHITE);
        t.setTextSize(24);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        root.addView(t);
        TextView m = new TextView(ctx);
        m.setText(message == null ? "This app is blocked right now." : message);
        m.setTextColor(0xFFA3AED0);
        m.setTextSize(15);
        m.setGravity(Gravity.CENTER);
        m.setPadding(0, pad / 2, 0, pad);
        root.addView(m);
        TextView b = new TextView(ctx);
        b.setText("Go home");
        b.setTextColor(0xFF131A2E);
        b.setTextSize(16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(pad, pad / 2, pad, pad / 2);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFFE6EAFF);
        bg.setCornerRadius(pad * 2f);
        b.setBackground(bg);
        b.setOnClickListener(v -> { if (cb != null) cb.onHome(); });
        root.addView(b);
        return root;
    }
}
`;
const ACTIVITY_JAVA = String.raw`package com.mylifeos.app.shield;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.mylifeos.app.shield.core.BlockLoopGuard;
import com.mylifeos.app.shield.core.ShieldBlockCard;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * [SHIELD-CARD] Fallback host for the Shield block card.
 *
 * The card is normally drawn as an overlay (see BlockEnforcer.presentShield).
 * This activity is only used when no overlay could be drawn. The UI is the
 * exact same {@link ShieldBlockCard}; all launch-loop protection is unchanged.
 */
public class ShieldBlockActivity extends Activity {

    private static final String TAG = "ShieldBlockActivity";

    /** Max times this activity may be (re)launched inside the rolling window before it's a loop. */
    private static final int MAX_LAUNCHES_IN_WINDOW = 3;

    /** Rolling window used to detect relaunch loops. */
    private static final long LAUNCH_WINDOW_MS = 20_000;

    /** Number of synthetic triggers registered against BlockLoopGuard to force it into its
     *  built-in global backoff state (it enters backoff once its internal cap, currently 6,
     *  is exceeded inside its own 15s window). Using a margin above that keeps this resilient
     *  to internal tuning without needing BlockLoopGuard to expose new API. */
    private static final int LOOP_GUARD_DISARM_TRIGGER_COUNT = 8;

    /** Process-wide record of recent launch timestamps for THIS activity — used purely for the
     *  hard loop-breaker below (independent of, but complementary to, BlockLoopGuard). */
    private static final Deque<Long> recentLaunchTimestamps = new ArrayDeque<>();

    /** Shared BlockLoopGuard instance so state (cooldowns/backoff) persists across re-launches
     *  of this activity instead of being reset every time a fresh instance is created. */
    private static volatile BlockLoopGuard sSharedLoopGuard;

    /** Guards against more than one live instance of this activity stacking on top of itself. */
    private static volatile boolean sInstanceActive = false;

    private boolean finishHandled = false;
    /** True only for the instance that set sInstanceActive; a rejected duplicate must not clear it. */
    private boolean ownsInstance = false;
    private String blockedPackage;

    private static synchronized BlockLoopGuard getSharedLoopGuard(Context context) {
        if (sSharedLoopGuard == null) {
            sSharedLoopGuard = new BlockLoopGuard(context.getApplicationContext());
        }
        return sSharedLoopGuard;
    }

    /** True while a block activity is on screen. */
    public static boolean isActive() {
        return sInstanceActive;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ShieldAccessibilityService.dismissBlockingOverlay();

        blockedPackage = getIntent().getStringExtra("BLOCKED_PACKAGE");

        // ============================================================
        // Double-launch guard: if another instance of this activity
        // is already showing, don't stack a second one on top.
        // ============================================================
        if (sInstanceActive) {
            Log.w(TAG, "ShieldBlockActivity already active — ignoring duplicate launch for pkg=" + blockedPackage);
            safeFinish();
            return;
        }

        // ============================================================
        // HARD LOOP-BREAKER
        // If this activity has been launched too many times in a short
        // rolling window (e.g. forceUserToHome() -> onUserLeaveHint() ->
        // accessibility service re-triggers it), stop showing the block
        // screen and disarm blocking for a cooldown period instead.
        // ============================================================
        if (isRelaunchLoop()) {
            Log.w(TAG, "Loop-breaker tripped: ShieldBlockActivity relaunched " + MAX_LAUNCHES_IN_WINDOW
                + "+ times within " + LAUNCH_WINDOW_MS + "ms (pkg=" + blockedPackage
                + "). Skipping block screen and disarming blocking via BlockLoopGuard cooldown.");
            disarmLoopGuardCooldown(blockedPackage);
            safeFinish();
            return;
        }

        sInstanceActive = true;
        ownsInstance = true;

        // Vibration
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(200);
                }
            }
        } catch (Exception ignored) {}

        try {
            Window w = getWindow();
            w.setFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
        } catch (Throwable ignored) {}

        final ShieldBlockCard.Callbacks callbacks = new ShieldBlockCard.Callbacks() {
            @Override public void onHome() { forceUserToHome(); }
            @Override public void onGhost() { dismissAsAccidentalTrigger(); }
        };

        View content;
        try {
            ShieldBlockCard.Spec spec = ShieldBlockCard.Spec.fromIntent(this, getIntent(), true);
            content = ShieldBlockCard.build(this, spec, callbacks);
        } catch (Throwable t) {
            // Never leave the person without a way out because of a rendering bug.
            Log.e(TAG, "Block card failed, using plain fallback", t);
            content = ShieldBlockCard.fallback(this, "Stay focused",
                "This app is blocked right now.", callbacks);
        }
        setContentView(content);
    }

    // ==========================================
    // Loop detection / disarm helpers
    // ==========================================

    private static synchronized boolean isRelaunchLoop() {
        long now = System.currentTimeMillis();
        while (!recentLaunchTimestamps.isEmpty()
            && now - recentLaunchTimestamps.peekFirst() > LAUNCH_WINDOW_MS) {
            recentLaunchTimestamps.pollFirst();
        }
        recentLaunchTimestamps.addLast(now);
        return recentLaunchTimestamps.size() > MAX_LAUNCHES_IN_WINDOW;
    }

    /**
     * Uses BlockLoopGuard's own public API (rather than any new/duplicated cooldown logic) to
     * push it into its built-in global backoff state, effectively disarming further block
     * actions for its BACKOFF_COOLDOWN_MS window.
     */
    private void disarmLoopGuardCooldown(String packageName) {
        try {
            BlockLoopGuard guard = getSharedLoopGuard(this);
            String pkg = packageName != null ? packageName : "unknown";
            for (int i = 0; i < LOOP_GUARD_DISARM_TRIGGER_COUNT; i++) {
                guard.registerTrigger(pkg);
            }
            // Evaluating any of the should*Block methods after exceeding the internal cap causes
            // BlockLoopGuard to enter its own backoff state as a side effect.
            guard.shouldForceHardBlock(pkg);
            Log.w(TAG, "BlockLoopGuard disarmed for cooldown after relaunch-loop detection (pkg=" + pkg + ")");
        } catch (Exception e) {
            Log.e(TAG, "Failed to disarm BlockLoopGuard after loop detection", e);
        }
    }

    private void dismissAsAccidentalTrigger() {
        try {
            if (blockedPackage != null) {
                // Clear escalation state so the user gets a short grace period before this
                // package can trip a hard block again — no offense/trigger is registered.
                getSharedLoopGuard(this).reset(blockedPackage);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register grace period with BlockLoopGuard", e);
        }
        Log.d(TAG, "User dismissed block screen as accidental trigger (pkg=" + blockedPackage + ")");
        forceUserToHome();
    }

    private void forceUserToHome() {
        try {
            Intent startMain = new Intent(Intent.ACTION_MAIN);
            startMain.addCategory(Intent.CATEGORY_HOME);
            startMain.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(startMain);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch home screen", e);
        }
        safeFinish();
    }

    /**
     * Idempotent finish — forceUserToHome(), onUserLeaveHint() and onBackPressed() can all race
     * to finish this activity; make sure we only ever act on the first one.
     */
    private void safeFinish() {
        if (finishHandled) return;
        finishHandled = true;
        if (!isFinishing()) {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        forceUserToHome();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        safeFinish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (ownsInstance) {
            sInstanceActive = false;
            ownsInstance = false;
        }
    }
}
`;

// ---------------------------------------------------------------------------
// Anchored patches
// ---------------------------------------------------------------------------
const PATCHES = [
  // -------------------------------------------------------------- overlay host
  {
    file: `${J}/shield/core/BlockingOverlay.java`,
    edits: [
      {
        find: L(['import android.os.Build;']),
        replace: L(['import android.os.Build;', 'import android.os.Handler;', 'import android.os.Looper;']),
      },
      {
        find: L(['import android.view.Gravity;']),
        replace: L(['import android.view.Gravity;', 'import android.view.KeyEvent;']),
      },
      {
        find: L([
          '        hide();',
          '        try {',
          '            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);',
          '            if (wm == null) return false;',
          '',
          '            LinearLayout root = new LinearLayout(ctx);',
        ]),
        replace: L([
          '        if (!sleepToRise) {',
          '            // ' + MARK + ' Shield blocks always use the shared card (Sleep/Rise path below is untouched).',
          '            return renderCard(ctx, windowType, ShieldBlockCard.Spec.generic(title, message), onHome);',
          '        }',
          '        hide();',
          '        try {',
          '            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);',
          '            if (wm == null) return false;',
          '',
          '            LinearLayout root = new LinearLayout(ctx);',
        ]),
      },
      {
        find: L(['    public static synchronized void hide() {']),
        replace: L([
          '    // ' + MARK + ' ---------------------------------------------------------------',
          '    // Shield block card. Overlay tier 1 (accessibility) and tier 2 (system overlay).',
          '    // ---------------------------------------------------------------------------',
          '    private static final long CARD_FAILSAFE_MS = 30_000L;',
          '    private static final Handler cardHandler = new Handler(Looper.getMainLooper());',
          '',
          '    public static synchronized boolean showCard(',
          '        AccessibilityService service, ShieldBlockCard.Spec spec, Runnable onHome',
          '    ) {',
          '        if (service == null || spec == null) return false;',
          '        return renderCard(service, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, spec, onHome);',
          '    }',
          '',
          '    public static synchronized boolean showCardSystem(',
          '        Context ctx, ShieldBlockCard.Spec spec, Runnable onHome',
          '    ) {',
          '        if (ctx == null || spec == null) return false;',
          '        try {',
          '            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {',
          '                return false;',
          '            }',
          '        } catch (Throwable ignored) {',
          '            return false;',
          '        }',
          '        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O',
          '            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY',
          '            : WindowManager.LayoutParams.TYPE_PHONE;',
          '        return renderCard(ctx.getApplicationContext(), type, spec, onHome);',
          '    }',
          '',
          '    private static boolean renderCard(',
          '        Context ctx, int windowType, ShieldBlockCard.Spec spec, Runnable onHome',
          '    ) {',
          '        hide();',
          '        try {',
          '            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);',
          '            if (wm == null) return false;',
          '',
          '            final ShieldBlockCard.Callbacks cb = new ShieldBlockCard.Callbacks() {',
          '                @Override public void onHome() {',
          '                    hide();',
          '                    if (onHome != null) onHome.run();',
          '                }',
          '                @Override public void onGhost() { onHome(); }',
          '            };',
          '',
          '            View root;',
          '            try {',
          '                root = ShieldBlockCard.build(ctx, spec, cb);',
          '            } catch (Throwable t) {',
          '                root = ShieldBlockCard.fallback(ctx, spec.title, spec.sub, cb);',
          '            }',
          '            root.setFocusableInTouchMode(true);',
          '            root.setOnKeyListener((v, keyCode, event) -> {',
          '                if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {',
          '                    cb.onHome();',
          '                    return true;',
          '                }',
          '                return false;',
          '            });',
          '',
          '            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(',
          '                WindowManager.LayoutParams.MATCH_PARENT,',
          '                WindowManager.LayoutParams.MATCH_PARENT,',
          '                windowType,',
          '                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN',
          '                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,',
          '                PixelFormat.TRANSLUCENT);',
          '            lp.gravity = Gravity.TOP | Gravity.START;',
          '            wm.addView(root, lp);',
          '            activeView = root;',
          '            activeWindowManager = wm;',
          '            try { root.requestFocus(); } catch (Throwable ignored) {}',
          '',
          '            // Safety valve: the card can never stay on screen forever.',
          '            final View shown = root;',
          '            cardHandler.postDelayed(() -> {',
          '                synchronized (BlockingOverlay.class) {',
          '                    if (activeView == shown) hide();',
          '                }',
          '            }, CARD_FAILSAFE_MS);',
          '            return true;',
          '        } catch (Throwable ignored) {',
          '            hide();',
          '            return false;',
          '        }',
          '    }',
          '',
          '    public static synchronized void hide() {',
        ]),
      },
    ],
  },

  // ------------------------------------------------------ enforcement (one place)
  {
    file: `${J}/shield/core/BlockEnforcer.java`,
    edits: [
      {
        find: L([
          '                    boolean shown = launchBlockScreen(ctx, intent, "Shield is protecting your focus",',
          '                        "This app is blocked right now.", false, false, leaveApp);',
          '                    if (!shown) leave(leaveApp);',
        ]),
        replace: L([
          '                    // ' + MARK + ' overlay first; the activity is used only if no overlay can be drawn.',
          '                    presentShield(ctx, intent, leaveApp);',
        ]),
      },
      {
        find: L(['    private static boolean launchBlockScreen(Context ctx, Intent i, String title, String body,']),
        replace: L([
          '    /**',
          '     * ' + MARK + ' Shield block presentation. Strict order, never two at once, no timers:',
          '     *   1. accessibility overlay  (instant; not subject to background-launch limits)',
          '     *   2. system overlay         (needs only "Display over other apps")',
          '     *   3. ShieldBlockActivity    (only when no overlay could be drawn)',
          '     *   4. full-screen notification',
          '     * Sleep to Rise keeps using launchBlockScreen() below, unchanged.',
          '     */',
          '    public static boolean presentShield(Context ctx, Intent blockIntent, Runnable leaveApp) {',
          '        lastBlockAt = System.currentTimeMillis();',
          '        lastBlockedPkg = blockIntent.getStringExtra("BLOCKED_PACKAGE");',
          '',
          '        ShieldBlockCard.Spec spec = null;',
          '        try {',
          '            spec = ShieldBlockCard.Spec.fromIntent(ctx, blockIntent, false);',
          '        } catch (Throwable t) {',
          '            Log.w(TAG, "block card spec failed", t);',
          '        }',
          '',
          '        final Context appCtx = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;',
          '        final Runnable goHome = () -> {',
          '            if (com.mylifeos.app.shield.ShieldAccessibilityService.goHomeViaAccessibility()) return;',
          '            try {',
          '                Intent home = new Intent(Intent.ACTION_MAIN);',
          '                home.addCategory(Intent.CATEGORY_HOME);',
          '                home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);',
          '                appCtx.startActivity(home);',
          '            } catch (Throwable t) {',
          '                Log.w(TAG, "goHome intent rejected", t);',
          '            }',
          '        };',
          '',
          '        if (spec != null) {',
          '            boolean drawn = false;',
          '            try {',
          '                drawn = com.mylifeos.app.shield.ShieldAccessibilityService.showShieldCard(spec, goHome);',
          '                if (!drawn) drawn = BlockingOverlay.showCardSystem(ctx, spec, goHome);',
          '            } catch (Throwable t) {',
          '                Log.w(TAG, "block card overlay failed", t);',
          '            }',
          '            if (drawn) {',
          '                lastError = null;',
          '                leave(leaveApp);',
          '                return true;',
          '            }',
          '        }',
          '',
          '        if (com.mylifeos.app.shield.ShieldAccessibilityService.launchBlockActivity(blockIntent)) {',
          '            lastError = null;',
          '            return true;',
          '        }',
          '        if (canStartActivityFromBackground(ctx)) {',
          '            try {',
          '                ctx.startActivity(blockIntent);',
          '                lastError = null;',
          '                return true;',
          '            } catch (Throwable t) {',
          '                Log.w(TAG, "startActivity for block screen rejected", t);',
          '                lastError = "startActivity rejected: " + t.getMessage();',
          '            }',
          '        }',
          '        boolean shown = showFullScreenFallback(ctx, blockIntent,',
          '            "Shield is protecting your focus", "This app is blocked right now.");',
          '        if (!shown) leave(leaveApp);',
          '        return shown;',
          '    }',
          '',
          '    private static boolean launchBlockScreen(Context ctx, Intent i, String title, String body,',
        ]),
      },
    ],
  },

  // ------------------------------------------------- accessibility service (host)
  {
    file: `${J}/shield/ShieldAccessibilityService.java`,
    edits: [
      {
        find: L(['    public static void dismissBlockingOverlay() { BlockingOverlay.hide(); }']),
        replace: L([
          '    public static void dismissBlockingOverlay() { BlockingOverlay.hide(); }',
          '',
          '    /** ' + MARK + ' Draws the shared Shield block card as an accessibility overlay. */',
          '    public static boolean showShieldCard(com.mylifeos.app.shield.core.ShieldBlockCard.Spec spec, Runnable onHome) {',
          '        ShieldAccessibilityService svc = instance;',
          '        return svc != null && BlockingOverlay.showCard(svc, spec, onHome);',
          '    }',
        ]),
      },
      {
        find: L(['    private String lastBlockedUrl = "";']),
        replace: L([
          '    /** ' + MARK + ' "keyword" for user-defined keywords, otherwise "adult". */',
          '    private volatile String pendingBlockKind = "adult";',
          '    private String lastBlockedUrl = "";',
        ]),
      },
      {
        find: L([
          '            new Handler(Looper.getMainLooper()).postDelayed(',
          '                () -> showBlockScreen(packageName, true), 150);',
          '            return;',
        ]),
        replace: L([
          '            pendingBlockKind = classifyBlockKind(reason);',
          '            new Handler(Looper.getMainLooper()).postDelayed(',
          '                () -> showBlockScreen(packageName, true), 150);',
          '            return;',
        ]),
      },
      {
        find: L([
          '    private void triggerAdultBlock(String reason) {',
          '        triggerAdultBlock(reason, null);',
          '    }',
        ]),
        replace: L([
          '    private void triggerAdultBlock(String reason) {',
          '        triggerAdultBlock(reason, null);',
          '    }',
          '',
          '    /** ' + MARK + ' User-defined keyword reasons all start with "Custom". */',
          '    private static String classifyBlockKind(String reason) {',
          '        if (reason == null) return "adult";',
          '        return reason.toLowerCase(java.util.Locale.ROOT).startsWith("custom") ? "keyword" : "adult";',
          '    }',
          '',
          '    /** ' + MARK + ' Overlay-first; falls back to the activity inside BlockEnforcer.presentShield. */',
          '    private void presentBlock(Intent intent) {',
          '        try {',
          '            com.mylifeos.app.shield.core.BlockEnforcer.presentShield(this, intent, null);',
          '        } catch (Throwable t) {',
          '            Log.w(TAG, "presentShield failed, starting activity", t);',
          '            try { startActivity(intent); } catch (Throwable ignored) {}',
          '        }',
          '    }',
        ]),
      },
      {
        find: L([
          '        intent.putExtra("IS_ADULT_BLOCK", isAdultBlock);',
          '        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |',
          '            Intent.FLAG_ACTIVITY_CLEAR_TOP |',
          '            Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS |',
          '            Intent.FLAG_ACTIVITY_NO_ANIMATION);',
          '        startActivity(intent);',
          '    }',
        ]),
        replace: L([
          '        intent.putExtra("IS_ADULT_BLOCK", isAdultBlock);',
          '        intent.putExtra("BLOCK_KIND", pendingBlockKind);',
          '        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |',
          '            Intent.FLAG_ACTIVITY_CLEAR_TOP |',
          '            Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS |',
          '            Intent.FLAG_ACTIVITY_NO_ANIMATION);',
          '        presentBlock(intent);',
          '    }',
        ]),
      },
      {
        find: L([
          '            intent.putExtra("ESCALATION_REMAINING_MS", remainingMs);',
          '            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |',
          '                Intent.FLAG_ACTIVITY_CLEAR_TOP |',
          '                Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS |',
          '                Intent.FLAG_ACTIVITY_NO_ANIMATION);',
          '            startActivity(intent);',
        ]),
        replace: L([
          '            intent.putExtra("ESCALATION_REMAINING_MS", remainingMs);',
          '            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |',
          '                Intent.FLAG_ACTIVITY_CLEAR_TOP |',
          '                Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS |',
          '                Intent.FLAG_ACTIVITY_NO_ANIMATION);',
          '            presentBlock(intent);',
        ]),
      },
    ],
  },

  // ----------------------------------------------------------- daily limit block
  {
    file: `${J}/shield/ShieldTimerManager.java`,
    edits: [
      {
        find: L([
          '            context.startActivity(intent);',
          '            prefs.incrementBlockedAttempts();',
        ]),
        replace: L([
          '            // ' + MARK + ' overlay first; activity only if no overlay can be drawn.',
          '            com.mylifeos.app.shield.core.BlockEnforcer.presentShield(context, intent,',
          '                () -> { ShieldAccessibilityService.goHomeViaAccessibility(); });',
          '            prefs.incrementBlockedAttempts();',
        ]),
      },
    ],
  },

  // ------------------------------------------------------------ native settings
  {
    file: `${J}/shield/ShieldPreferences.java`,
    edits: [
      {
        find: L([
          'public String getAdultBlockScreenStyle() {',
          '    return prefs.getString("adult_block_style", "focus");',
          '}',
        ]),
        replace: L([
          '// ' + MARK + ' Block card options, synced from the "Block Screen Style" page',
          'public boolean isBlockCountdownEnabled() {',
          '    return prefs.getBoolean("block_countdown_enabled", true);',
          '}',
          'public void setBlockCountdownEnabled(boolean enabled) {',
          '    prefs.edit().putBoolean("block_countdown_enabled", enabled).apply();',
          '}',
          'public String getBlockScreenTheme() {',
          '    return prefs.getString("block_screen_theme", "");',
          '}',
          'public void setBlockScreenTheme(String theme) {',
          '    prefs.edit().putString("block_screen_theme", theme == null ? "" : theme).apply();',
          '}',
          'public String getBlockScreenText() {',
          '    return prefs.getString("block_screen_text", "");',
          '}',
          'public void setBlockScreenText(String text) {',
          '    prefs.edit().putString("block_screen_text", text == null ? "" : text).apply();',
          '}',
          'public String getAdultBlockScreenStyle() {',
          '    return prefs.getString("adult_block_style", "focus");',
          '}',
        ]),
      },
    ],
  },
  {
    file: `${J}/plugins/ShieldPlugin.java`,
    edits: [
      {
        find: L([
          '    public void getAdultFilterScreen(PluginCall call) {',
          '        JSObject ret = new JSObject();',
          '        ret.put("style", preferences.getAdultBlockScreenStyle());',
          '        ret.put("customMessage", preferences.getAdultBlockCustomMessage());',
          '        call.resolve(ret);',
          '    }',
        ]),
        replace: L([
          '    public void getAdultFilterScreen(PluginCall call) {',
          '        JSObject ret = new JSObject();',
          '        ret.put("style", preferences.getAdultBlockScreenStyle());',
          '        ret.put("customMessage", preferences.getAdultBlockCustomMessage());',
          '        call.resolve(ret);',
          '    }',
          '',
          '    // ' + MARK + ' Block Screen Style page -> native block card',
          '    @PluginMethod',
          '    public void updateBlockScreenOptions(PluginCall call) {',
          '        try {',
          '            Boolean countdown = call.getBoolean("countdown");',
          '            if (countdown != null) preferences.setBlockCountdownEnabled(countdown);',
          '            String theme = call.getString("theme");',
          '            if (theme != null) preferences.setBlockScreenTheme(theme);',
          '            String text = call.getString("text");',
          '            if (text != null) preferences.setBlockScreenText(text);',
          '            JSObject ret = new JSObject();',
          '            ret.put("success", true);',
          '            call.resolve(ret);',
          '        } catch (Exception e) {',
          '            call.reject(e.getMessage());',
          '        }',
          '    }',
          '',
          '    @PluginMethod',
          '    public void getBlockScreenOptions(PluginCall call) {',
          '        JSObject ret = new JSObject();',
          '        ret.put("countdown", preferences.isBlockCountdownEnabled());',
          '        ret.put("theme", preferences.getBlockScreenTheme());',
          '        ret.put("text", preferences.getBlockScreenText());',
          '        call.resolve(ret);',
          '    }',
        ]),
      },
    ],
  },

  // ------------------------------------------------------------------- web side
  {
    file: 'src/lib/capacitor/shieldPlugin.ts',
    edits: [
      {
        find: L(['  getAdultFilterScreen(): Promise<{ style: string; customMessage: string }>;']),
        replace: L([
          '  getAdultFilterScreen(): Promise<{ style: string; customMessage: string }>;',
          '  // ' + MARK + ' Block Screen Style -> native block card',
          '  updateBlockScreenOptions(options: {',
          '    countdown?: boolean;',
          '    theme?: string;',
          '    text?: string;',
          '  }): Promise<{ success: boolean }>;',
          '  getBlockScreenOptions(): Promise<{ countdown: boolean; theme: string; text: string }>;',
        ]),
      },
    ],
  },
  {
    file: 'src/components/shield/ShieldBlockScreen.tsx',
    edits: [
      {
        find: L(["import { toast } from 'sonner';"]),
        replace: L([
          "import { toast } from 'sonner';",
          "import { Switch } from '@/components/ui/switch';",
          "import ShieldPlugin from '@/lib/capacitor/shieldPlugin';",
        ]),
      },
      {
        find: L(['  const fileInputRef = useRef<HTMLInputElement>(null);']),
        replace: L([
          '  const fileInputRef = useRef<HTMLInputElement>(null);',
          '',
          '  // ' + MARK + ' 3-second countdown on the block card (on by default)',
          '  const [countdownOn, setCountdownOn] = useState(true);',
          '',
          '  const syncNative = (opts: { countdown?: boolean; theme?: string; text?: string }) => {',
          '    try {',
          '      const plugin: any = ShieldPlugin;',
          "      if (plugin && typeof plugin.updateBlockScreenOptions === 'function') {",
          '        Promise.resolve(plugin.updateBlockScreenOptions(opts)).catch(() => {});',
          '      }',
          '    } catch {}',
          '  };',
          '',
          '  useEffect(() => {',
          '    try {',
          "      const saved = localStorage.getItem('shield_block_countdown');",
          "      const on = saved === null ? true : saved === 'true';",
          '      setCountdownOn(on);',
          '      // Push once so the native card always matches this page.',
          '      syncNative({',
          '        countdown: on,',
          "        theme: localStorage.getItem('shield_block_screen_theme') || undefined,",
          "        text: localStorage.getItem('shield_block_screen_text') || undefined,",
          '      });',
          '    } catch {}',
          '    // eslint-disable-next-line react-hooks/exhaustive-deps',
          '  }, []);',
          '',
          '  const handleCountdownToggle = (on: boolean) => {',
          '    setCountdownOn(on);',
          "    try { localStorage.setItem('shield_block_countdown', String(on)); } catch {}",
          '    syncNative({ countdown: on });',
          '  };',
        ]),
      },
      {
        find: L([
          '    // Also persist to the legacy key used by the native side',
          "    localStorage.setItem('shield_block_screen', id);",
        ]),
        replace: L([
          '    // Also persist to the legacy key used by the native side',
          "    localStorage.setItem('shield_block_screen', id);",
          '    syncNative({ theme: id });',
        ]),
      },
      {
        find: L(["    localStorage.setItem('shield_block_screen_text', newText);"]),
        replace: L([
          "    localStorage.setItem('shield_block_screen_text', newText);",
          '    syncNative({ text: newText });',
        ]),
      },
      {
        find: L([
          '        <div className="h-px bg-border/50 w-full" />',
          '',
          '        <h3 className="text-sm font-bold text-foreground">Choose a theme</h3>',
        ]),
        replace: L([
          '        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">',
          '          <div className="min-w-0">',
          '            <p className="text-sm font-bold text-foreground">3-second countdown</p>',
          '            <p className="text-[10px] text-muted-foreground">',
          '              Show a short countdown on the block card, then close it automatically.',
          '            </p>',
          '          </div>',
          '          <Switch checked={countdownOn} onCheckedChange={handleCountdownToggle} />',
          '        </div>',
          '',
          '        <div className="h-px bg-border/50 w-full" />',
          '',
          '        <h3 className="text-sm font-bold text-foreground">Choose a theme</h3>',
        ]),
      },
    ],
  },
];

// Files that must stay byte-identical (Sleep to Rise / Rise / manifest / enforcement loop).
const UNTOUCHED = [
  `${J}/nighttorise/NightToRiseBlockActivity.java`,
  `${J}/nighttorise/NightToRiseManager.java`,
  `${J}/nighttorise/NightToRiseDecider.java`,
  `${J}/nighttorise/NightToRisePreferences.java`,
  `${J}/nighttorise/GuardTransitionNotifier.java`,
  `${J}/shield/core/ForegroundGuardService.java`,
  `${J}/shield/core/BlockLoopGuard.java`,
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/values/styles.xml',
];

// ---------------------------------------------------------------------------
// Verification (used after install and by --check)
// ---------------------------------------------------------------------------
function stripJava(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      out += '""'; continue;
    }
    out += c;
  }
  return out;
}
function balanced(src) {
  const s = stripJava(src);
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const close = new Set(Object.values(pairs));
  const stack = [];
  for (const ch of s) {
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (close.has(ch)) { if (stack.pop() !== ch) return false; }
  }
  return stack.length === 0;
}

function verify() {
  let failures = 0;
  const check = (cond, okMsg, badMsg) => { if (cond) ok(okMsg); else { bad(badMsg || okMsg); failures++; } };
  const get = (rel) => { try { return readText(rel).text; } catch { return null; } };

  info('\nChecking installed files:');
  const card = get(CARD_PATH);
  check(card && card.includes('public static View build(') && card.includes('static Spec fromIntent') && card.includes('public static View fallback('),
    'ShieldBlockCard.java present and complete', 'ShieldBlockCard.java missing or incomplete');
  check(card && balanced(card), 'ShieldBlockCard.java brackets balanced');

  const act = get(ACTIVITY_PATH);
  check(act && act.includes(MARK) && act.includes('ShieldBlockCard.build(') && act.includes('ownsInstance'),
    'ShieldBlockActivity uses the shared card (+ instance-flag fix)');
  check(act && balanced(act), 'ShieldBlockActivity.java brackets balanced');

  const overlay = get(`${J}/shield/core/BlockingOverlay.java`);
  check(overlay && overlay.includes('showCardSystem') && overlay.includes('renderCard') && overlay.includes('CARD_FAILSAFE_MS'),
    'BlockingOverlay: card tiers + 30s failsafe');
  check(overlay && overlay.includes('if (!sleepToRise)') && overlay.includes('new int[]{0xff321d43'),
    'BlockingOverlay: Sleep/Rise render path still intact');
  check(overlay && balanced(overlay), 'BlockingOverlay.java brackets balanced');

  const enf = get(`${J}/shield/core/BlockEnforcer.java`);
  check(enf && enf.includes('public static boolean presentShield') && enf.includes('presentShield(ctx, intent, leaveApp);'),
    'BlockEnforcer: overlay-first presentShield wired into the Shield app-block branch');
  check(enf && !enf.includes('launchBlockScreen(ctx, intent, "Shield is protecting your focus"'),
    'BlockEnforcer: old 450ms overlay path no longer used for Shield');
  check(enf && enf.includes('launchBlockScreen(ctx, i, "Sleep to Rise"'),
    'BlockEnforcer: Sleep to Rise path untouched');
  check(enf && balanced(enf), 'BlockEnforcer.java brackets balanced');

  const acc = get(`${J}/shield/ShieldAccessibilityService.java`);
  check(acc && acc.includes('showShieldCard') && acc.includes('classifyBlockKind') && acc.includes('BLOCK_KIND'),
    'AccessibilityService: card host + keyword/adult kind');
  check(acc && count(acc, 'presentBlock(intent);') === 2, 'AccessibilityService: both content-block launches go through presentBlock');
  check(acc && balanced(acc), 'ShieldAccessibilityService.java brackets balanced');

  const tm = get(`${J}/shield/ShieldTimerManager.java`);
  check(tm && tm.includes('presentShield(context, intent,'), 'ShieldTimerManager: daily-limit block is overlay-first');
  check(tm && balanced(tm), 'ShieldTimerManager.java brackets balanced');

  const sp = get(`${J}/shield/ShieldPreferences.java`);
  for (const m of ['isBlockCountdownEnabled', 'setBlockCountdownEnabled', 'getBlockScreenTheme', 'setBlockScreenTheme', 'getBlockScreenText', 'setBlockScreenText',
                   'isStrictMode', 'getStartOfDayHour', 'getAdultBlockScreenStyle', 'getAdultBlockCustomMessage']) {
    check(sp && sp.includes(' ' + m + '('), `ShieldPreferences.${m}() exists`);
  }
  check(sp && balanced(sp), 'ShieldPreferences.java brackets balanced');

  const plug = get(`${J}/plugins/ShieldPlugin.java`);
  check(plug && plug.includes('updateBlockScreenOptions') && plug.includes('getBlockScreenOptions'), 'ShieldPlugin: updateBlockScreenOptions / getBlockScreenOptions');
  check(plug && balanced(plug), 'ShieldPlugin.java brackets balanced');

  const ts = get('src/lib/capacitor/shieldPlugin.ts');
  check(ts && ts.includes('updateBlockScreenOptions'), 'shieldPlugin.ts: new bridge methods declared');
  const tsx = get('src/components/shield/ShieldBlockScreen.tsx');
  check(tsx && tsx.includes('countdownOn') && tsx.includes('handleCountdownToggle') && tsx.includes('<Switch'),
    'Block Screen Style page: countdown toggle present');

  if (fs.existsSync(BACKUP_ROOT)) {
    // compare untouched files with the newest backup manifest, if any
    const dirs = fs.readdirSync(BACKUP_ROOT).filter((d) => fs.existsSync(path.join(BACKUP_ROOT, d, 'manifest.json'))).sort();
    if (dirs.length) {
      const man = JSON.parse(fs.readFileSync(path.join(BACKUP_ROOT, dirs[dirs.length - 1], 'manifest.json'), 'utf8'));
      for (const [rel, h] of Object.entries(man.untouched || {})) {
        let cur = null;
        try { cur = sha(fs.readFileSync(abs(rel))); } catch {}
        check(cur === h, `unchanged: ${rel}`, `CHANGED (should not be): ${rel}`);
      }
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Backup / rollback
// ---------------------------------------------------------------------------
function newestBackup() {
  if (!fs.existsSync(BACKUP_ROOT)) return null;
  const dirs = fs.readdirSync(BACKUP_ROOT).filter((d) => fs.existsSync(path.join(BACKUP_ROOT, d, 'manifest.json'))).sort();
  return dirs.length ? path.join(BACKUP_ROOT, dirs[dirs.length - 1]) : null;
}

function rollback(dir) {
  dir = dir || newestBackup();
  if (!dir) { bad('no backup found'); return false; }
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const rel of man.modified) {
    const src = path.join(dir, 'files', ...rel.split('/'));
    fs.copyFileSync(src, abs(rel));
    ok('restored ' + rel);
  }
  for (const rel of man.created) {
    try { fs.unlinkSync(abs(rel)); ok('removed ' + rel); } catch {}
  }
  fs.renameSync(dir, dir + '.rolledback');
  return true;
}

function excludeBackupFromGit() {
  try {
    const ex = path.join(ROOT, '.git', 'info', 'exclude');
    if (fs.existsSync(path.join(ROOT, '.git'))) {
      fs.mkdirSync(path.dirname(ex), { recursive: true });
      const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
      if (!cur.includes('.shield_card_backup')) fs.appendFileSync(ex, '\n.shield_card_backup/\n');
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  info('Shield block card installer');
  info('Project root: ' + ROOT);

  if (!fs.existsSync(abs('android/app/src/main/AndroidManifest.xml')) || !fs.existsSync(abs('src'))) {
    bad('Run this from the project root (the folder that contains "android" and "src").');
    process.exit(1);
  }

  if (ARGS.has('--rollback')) {
    info('\nRolling back:');
    process.exit(rollback() ? 0 : 1);
  }
  if (ARGS.has('--check')) {
    const f = verify();
    info(f === 0 ? '\nAll checks passed.' : `\n${f} check(s) failed.`);
    process.exit(f === 0 ? 0 : 1);
  }

  // ---- plan (in memory only) ----
  const plan = []; // { rel, text, crlf, kind }
  const problems = [];
  const skipped = [];

  for (const p of PATCHES) {
    let cur;
    try { cur = readText(p.file); } catch { problems.push(`missing file: ${p.file}`); continue; }
    let text = cur.text;
    if (text.includes(MARK)) { skipped.push(p.file); continue; }
    let failed = false;
    for (const e of p.edits) {
      const n = count(text, e.find);
      if (n !== 1) {
        problems.push(`${p.file}: expected 1 match, found ${n} for:\n      ` + e.find.split('\n')[0].trim());
        failed = true;
      } else {
        text = text.replace(e.find, () => e.replace);
      }
    }
    if (!failed) plan.push({ rel: p.file, text, crlf: cur.crlf, kind: 'patch' });
  }

  // replaced activity
  try {
    const cur = readText(ACTIVITY_PATH);
    if (cur.text.includes(MARK)) skipped.push(ACTIVITY_PATH);
    else if (!cur.text.includes('sSharedLoopGuard') || !cur.text.includes('buildRegularBlockScreen')) {
      problems.push(`${ACTIVITY_PATH}: does not look like the version this installer was written for`);
    } else plan.push({ rel: ACTIVITY_PATH, text: ACTIVITY_JAVA, crlf: cur.crlf, kind: 'replace' });
  } catch { problems.push(`missing file: ${ACTIVITY_PATH}`); }

  // new card
  let cardExists = fs.existsSync(abs(CARD_PATH));
  if (cardExists) {
    const cur = readText(CARD_PATH);
    if (cur.text !== CARD_JAVA) plan.push({ rel: CARD_PATH, text: CARD_JAVA, crlf: cur.crlf, kind: 'replace' });
    else skipped.push(CARD_PATH);
  } else plan.push({ rel: CARD_PATH, text: CARD_JAVA, crlf: false, kind: 'create' });

  if (problems.length) {
    info('\nNothing was changed. These files do not match what the installer expects:');
    problems.forEach((p) => bad(p));
    info('\nSend me the files listed above and I will adjust the installer.');
    process.exit(1);
  }

  info('\nPlan:');
  skipped.forEach((s) => info('  = already installed: ' + s));
  plan.forEach((p) => info(`  ${p.kind === 'create' ? '+' : '~'} ${p.kind}: ${p.rel}`));

  if (ARGS.has('--dry-run')) { info('\nDry run only. Nothing written.'); process.exit(0); }
  if (!plan.length) {
    info('\nNothing to do.');
    process.exit(verify() === 0 ? 0 : 1);
  }

  // ---- backup ----
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_ROOT, ts);
  const man = { modified: [], created: [], untouched: {} };
  for (const p of plan) {
    if (fs.existsSync(abs(p.rel))) {
      const dest = path.join(dir, 'files', ...p.rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs(p.rel), dest);
      man.modified.push(p.rel);
    } else man.created.push(p.rel);
  }
  for (const rel of UNTOUCHED) {
    try { man.untouched[rel] = sha(fs.readFileSync(abs(rel))); } catch {}
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 2));
  excludeBackupFromGit();
  info('\nBackup saved: ' + path.relative(ROOT, dir));

  // ---- write ----
  info('\nWriting:');
  try {
    for (const p of plan) { writeText(p.rel, p.text, p.crlf); ok(p.rel); }
  } catch (e) {
    bad('write failed: ' + e.message + ' \u2014 rolling back');
    rollback(dir);
    process.exit(1);
  }

  // ---- verify ----
  const failures = verify();
  if (failures) {
    info(`\n${failures} check(s) failed \u2014 rolling everything back.`);
    rollback(dir);
    process.exit(1);
  }

  // ---- optional build ----
  if (ARGS.has('--build')) {
    info('\nCompiling (this can take a few minutes)...');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const g = spawnSync(gradlew, [':app:compileDebugJavaWithJavac', '-q'], { cwd: abs('android'), stdio: 'inherit', shell: process.platform === 'win32' });
    if (g.status !== 0) {
      bad('Java compile FAILED. Fix or run:  node apply_shield_card.mjs --rollback');
      process.exit(2);
    }
    ok('Java compiles');
    const tsc = abs('node_modules/.bin/tsc');
    if (fs.existsSync(tsc)) {
      const t = spawnSync(tsc, ['--noEmit', '-p', 'tsconfig.app.json'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
      if (t.status !== 0) { bad('TypeScript check FAILED. Run --rollback if unsure.'); process.exit(2); }
      ok('TypeScript compiles');
    } else info('  (tsc not found, skipped TypeScript check)');
  }

  info('\nDone. Everything is installed and verified.');
  info('\nNext steps:');
  info('  1. npm run build && npx cap sync android');
  info('  2. Build/install the APK, then test on a real phone (see the test list).');
  info('  Undo anytime:  node apply_shield_card.mjs --rollback');
}

main();
