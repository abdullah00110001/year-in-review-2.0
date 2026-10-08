package com.mylifeos.app.nighttorise;

import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.alpha;
import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.drawCottage;
import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.drawHills;

import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;

import com.mylifeos.app.nighttorise.NightToRiseBlockCard.Rng;

/**
 * ============================================================================
 * [N2R-RISE-SCENES] RISE GUARD CARD (3 of 3) — everything about the Rise card.
 * ============================================================================
 *
 * Pictures:
 *   0 default — original sunrise over pink hills with a cottage (unchanged)
 *   1 meadow  — soft green morning field with a rising sun and mist
 *   2 peaks   — golden sunrise behind layered mountains
 *
 * To add another picture:
 *   1) append its key to KEYS (never reorder),
 *   2) add a case in draw() and in the palette methods,
 *   3) write  private static void sceneXxx(Canvas c, int w, int h)  below.
 * All scenes are static (drawn once into a cached bitmap) — no animation.
 * ============================================================================
 */
final class NightToRiseRiseScenes {

    private NightToRiseRiseScenes() {}

    /** Saved keys. Index == theme id. Never reorder; only append. */
    static final String[] KEYS = {"default", "meadow", "peaks"};
    static final int COUNT = KEYS.length;

    /** Turns a saved key into a theme id. Unknown/old values -> default (0). */
    static int themeFromKey(String key) {
        if (key == null) return NightToRiseBlockCard.THEME_DEFAULT;
        for (int i = 0; i < KEYS.length; i++) if (KEYS[i].equals(key)) return i;
        return NightToRiseBlockCard.THEME_DEFAULT;
    }

    /** Builds the complete Rise Guard card on the shared card shell. */
    static NightToRiseBlockCard.Handles build(android.content.Context ctx, int theme) {
        final int t = (theme < 0 || theme >= COUNT) ? NightToRiseBlockCard.THEME_DEFAULT : theme;
        NightToRiseBlockCard.Style st = new NightToRiseBlockCard.Style();
        st.pillText = "RISE GUARD";
        st.icon = "\u2600";             // ☀
        st.countdownLabel = "Unlocks in";
        st.endLabel = "Lock ends";
        st.accent1 = accent1(t);
        st.accent2 = accent2(t);
        st.cardBottom = cardBottom(t);
        st.fallback = fallback(t);
        st.scene = (c, w, h) -> draw(c, w, h, t);
        return NightToRiseBlockCard.buildShell(ctx, st);
    }

    static void draw(Canvas c, int w, int h, int theme) {
        switch (theme) {
            case NightToRiseBlockCard.THEME_MEADOW: sceneMeadow(c, w, h); break;
            case NightToRiseBlockCard.THEME_PEAKS:  scenePeaks(c, w, h); break;
            default:                                sceneDefault(c, w, h); break;
        }
    }

    // ---- per-scene palette: button gradient, card bottom colour, flat fallback ----
    static int accent1(int t) {
        switch (t) { case 1: return 0xFF34D399; case 2: return 0xFFF59E0B; default: return 0xFFFB923C; }
    }
    static int accent2(int t) {
        switch (t) { case 1: return 0xFF0EA5A4; case 2: return 0xFFEA580C; default: return 0xFFF43F5E; }
    }
    static int cardBottom(int t) {
        switch (t) { case 1: return 0xFF0B1A16; case 2: return 0xFF1A1020; default: return 0xFF170B22; }
    }
    static int fallback(int t) {
        switch (t) { case 1: return 0xFF1F4A3C; case 2: return 0xFF4A2A3A; default: return 0xFF4A2242; }
    }

    // ------------------------------------------------------------------
    // 0 · DEFAULT — original rise scene, untouched
    // ------------------------------------------------------------------
    private static void sceneDefault(Canvas c, int w, int h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setShader(new LinearGradient(0, 0, 0, h,
            new int[]{0xFF23123F, 0xFF6A2C6E, 0xFFD1506A, 0xFFF7955A, 0xFFFFC47D},
            new float[]{0f, 0.36f, 0.62f, 0.82f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // sun + rays, low on the horizon
        float sx = w * 0.5f, sy = h * 0.72f, sr = Math.max(14f, h * 0.15f);
        p.setShader(new RadialGradient(sx, sy, h * 0.95f,
            alpha(0xFFFFE9A8, 140), alpha(0xFFFFE9A8, 0), Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        Paint ray = new Paint(Paint.ANTI_ALIAS_FLAG);
        ray.setColor(0xFFFFF0B8);
        double rl = h * 0.95;
        for (int i = 0; i < 11; i++) {
            double a1 = Math.toRadians(i * 360.0 / 11), a2 = a1 + 0.07;
            ray.setAlpha(i % 2 == 0 ? 60 : 36);
            Path path = new Path();
            path.moveTo(sx, sy);
            path.lineTo((float) (sx + Math.cos(a1) * rl), (float) (sy + Math.sin(a1) * rl));
            path.lineTo((float) (sx + Math.cos(a2) * rl), (float) (sy + Math.sin(a2) * rl));
            path.close();
            c.drawPath(path, ray);
        }

        p.setShader(new RadialGradient(sx, sy, sr * 1.5f, alpha(0xFFFFE9A8, 90), alpha(0xFFFFE9A8, 0), Shader.TileMode.CLAMP));
        c.drawCircle(sx, sy, sr * 1.5f, p);
        p.setShader(null);
        p.setShader(new RadialGradient(sx - sr * 0.3f, sy - sr * 0.3f, sr * 1.3f, 0xFFFFF6CF, 0xFFFFA03E, Shader.TileMode.CLAMP));
        c.drawCircle(sx, sy, sr, p);
        p.setShader(null);

        // a few soft clouds
        Rng r = new Rng(5);
        Paint cloud = new Paint(Paint.ANTI_ALIAS_FLAG);
        cloud.setColor(0xFFFFD9C4);
        float[][] clouds = {{0.14f, 0.28f, 0.3f}, {0.6f, 0.2f, 0.3f}, {0.4f, 0.42f, 0.22f}};
        for (float[] cl : clouds) {
            float cx = w * cl[0], cy = h * cl[1], cw = w * cl[2], ch = cw * 0.3f;
            cloud.setAlpha(80);
            RectF rc = new RectF(cx, cy, cx + cw, cy + ch);
            c.drawRoundRect(rc, ch / 2f, ch / 2f, cloud);
            c.drawCircle(cx + cw * 0.32f, cy + ch * 0.1f, ch * 0.9f, cloud);
            c.drawCircle(cx + cw * 0.58f, cy, ch * 1.2f, cloud);
        }

        // a couple of simple birds
        Paint bird = new Paint(Paint.ANTI_ALIAS_FLAG);
        bird.setStyle(Paint.Style.STROKE);
        bird.setStrokeWidth(Math.max(1.2f, h * 0.006f));
        bird.setStrokeCap(Paint.Cap.ROUND);
        bird.setColor(0xFF3B1740);
        bird.setAlpha(160);
        float[][] birds = {{0.12f, 0.36f}, {0.2f, 0.42f}};
        for (float[] b : birds) {
            float bx = w * b[0], by = h * b[1], bw = w * 0.05f;
            Path bp = new Path();
            bp.moveTo(bx, by);
            bp.quadTo(bx + bw * 0.25f, by - bw * 0.35f, bx + bw * 0.5f, by);
            bp.quadTo(bx + bw * 0.75f, by - bw * 0.35f, bx + bw, by);
            c.drawPath(bp, bird);
        }

        drawHills(c, w, h, 0xFF8D3A6B, 0xFF65284F);
        drawCottage(c, w * 0.12f, h * 0.845f, h * 0.1f, 0xFF3B1740, false);
    }

    // ------------------------------------------------------------------
    // 1 · MEADOW — green field, misty sun, gentle grass waves
    // ------------------------------------------------------------------
    private static void sceneMeadow(Canvas c, int w, int h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        // sky: pale blue to warm cream at the horizon
        p.setShader(new LinearGradient(0, 0, 0, h,
            new int[]{0xFF7DB9D8, 0xFFBFE0E6, 0xFFFFE7B8},
            new float[]{0f, 0.5f, 0.75f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // sun with soft halo
        float sx = w * 0.7f, sy = h * 0.5f, sr = Math.max(12f, h * 0.11f);
        p.setShader(new RadialGradient(sx, sy, sr * 4f, alpha(0xFFFFF4C8, 170), alpha(0xFFFFF4C8, 0), Shader.TileMode.CLAMP));
        c.drawCircle(sx, sy, sr * 4f, p);
        p.setShader(null);
        p.setColor(0xFFFFF1B0);
        c.drawCircle(sx, sy, sr, p);

        // mist band
        p.setColor(alpha(0xFFFFFFFF, 70));
        c.drawRect(0, h * 0.6f, w, h * 0.68f, p);

        // three layers of rolling grass
        int[] cols = {0xFF8FCB7E, 0xFF5BA661, 0xFF2F7A4A};
        float[] base = {0.66f, 0.76f, 0.88f};
        for (int i = 0; i < 3; i++) {
            Path path = new Path();
            float y = h * base[i];
            path.moveTo(0, y);
            path.cubicTo(w * 0.3f, y - h * 0.08f, w * 0.6f, y + h * 0.06f, w, y - h * 0.04f);
            path.lineTo(w, h); path.lineTo(0, h); path.close();
            p.setColor(cols[i]);
            c.drawPath(path, p);
        }

        // small flowers in the front field
        Rng r = new Rng(11);
        Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 18; i++) {
            float fx = (float) (r.next() * w), fy = h * (0.9f + (float) r.next() * 0.08f);
            f.setColor(i % 3 == 0 ? 0xFFFFF7D6 : 0xFFFFC1D0);
            c.drawCircle(fx, fy, Math.max(1.5f, h * 0.008f), f);
        }
    }

    // ------------------------------------------------------------------
    // 2 · PEAKS — golden sunrise behind layered mountains
    // ------------------------------------------------------------------
    private static void scenePeaks(Canvas c, int w, int h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new LinearGradient(0, 0, 0, h,
            new int[]{0xFF2B1B4A, 0xFF9A3F5E, 0xFFF29A4A, 0xFFFFD08A},
            new float[]{0f, 0.4f, 0.65f, 0.8f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // sun peeking between the peaks
        float sx = w * 0.42f, sy = h * 0.62f, sr = Math.max(14f, h * 0.14f);
        p.setShader(new RadialGradient(sx, sy, sr * 3.5f, alpha(0xFFFFE2A0, 160), alpha(0xFFFFE2A0, 0), Shader.TileMode.CLAMP));
        c.drawCircle(sx, sy, sr * 3.5f, p);
        p.setShader(null);
        p.setColor(0xFFFFE9B5);
        c.drawCircle(sx, sy, sr, p);

        // mountain layers, back (light) to front (dark)
        int[] cols = {0xFFB4587A, 0xFF7A3460, 0xFF3D1B3F};
        float[][] peaks = {
            {0f, 0.62f, 0.18f, 0.42f, 0.34f, 0.58f, 0.62f, 0.36f, 0.82f, 0.55f, 1f, 0.45f},
            {0f, 0.72f, 0.24f, 0.55f, 0.46f, 0.7f, 0.72f, 0.52f, 1f, 0.68f},
            {0f, 0.86f, 0.3f, 0.72f, 0.58f, 0.84f, 0.84f, 0.74f, 1f, 0.82f},
        };
        for (int i = 0; i < peaks.length; i++) {
            float[] pk = peaks[i];
            Path path = new Path();
            path.moveTo(0, h);
            for (int j = 0; j < pk.length; j += 2) path.lineTo(w * pk[j], h * pk[j + 1]);
            path.lineTo(w, h); path.close();
            p.setColor(cols[i]);
            c.drawPath(path, p);
        }

        // a pair of birds
        Paint bird = new Paint(Paint.ANTI_ALIAS_FLAG);
        bird.setStyle(Paint.Style.STROKE);
        bird.setStrokeCap(Paint.Cap.ROUND);
        bird.setStrokeWidth(Math.max(1.2f, h * 0.006f));
        bird.setColor(alpha(0xFF2B1B4A, 170));
        float[][] birds = {{0.7f, 0.28f}, {0.78f, 0.33f}};
        for (float[] b : birds) {
            float bx = w * b[0], by = h * b[1], bw = w * 0.045f;
            Path bp = new Path();
            bp.moveTo(bx, by);
            bp.quadTo(bx + bw * 0.25f, by - bw * 0.35f, bx + bw * 0.5f, by);
            bp.quadTo(bx + bw * 0.75f, by - bw * 0.35f, bx + bw, by);
            c.drawPath(bp, bird);
        }
    }
}
