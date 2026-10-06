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
 * [N2R-RISE-SCENES] Every Rise Guard picture lives here.
 *
 * Right now there is only the original sunrise scene (theme 0). To add more later:
 *   1) bump COUNT,
 *   2) add a case in draw(), accent1(), accent2(), cardBottom(), fallback(),
 *   3) write a  private static void sceneXxx(Canvas c, int w, int h)  below
 *      (the Pen helper in NightToRiseBlockCard is available, same as in the Sleep file).
 *
 * Theme 0 must stay as it is. All scenes are static — no animation here.
 */
final class NightToRiseRiseScenes {

    private NightToRiseRiseScenes() {}

    static final int COUNT = 1; // 0 default

    static void draw(Canvas c, int w, int h, int theme) {
        switch (theme) {
            default: sceneDefault(c, w, h); break;
        }
    }

    // ---- per-scene palette: CTA gradient, card bottom colour, flat fallback ----
    static int accent1(int theme)    { return 0xFFFB923C; }
    static int accent2(int theme)    { return 0xFFF43F5E; }
    static int cardBottom(int theme) { return 0xFF170B22; }
    static int fallback(int theme)   { return 0xFF4A2242; }

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
}
