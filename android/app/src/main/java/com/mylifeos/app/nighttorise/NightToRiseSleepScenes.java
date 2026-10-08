package com.mylifeos.app.nighttorise;

import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.alpha;
import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.drawCottage;
import static com.mylifeos.app.nighttorise.NightToRiseBlockCard.drawHills;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Shader;

import com.mylifeos.app.nighttorise.NightToRiseBlockCard.Pen;
import com.mylifeos.app.nighttorise.NightToRiseBlockCard.Rng;
import com.mylifeos.app.nighttorise.NightToRiseBlockCard.Rnd;

/**
 * [N2R-SLEEP-SCENES] Every Sleep Guard picture lives here.
 *
 * To add a new one:
 *   1) bump COUNT and add a THEME_* id in NightToRiseBlockCard,
 *   2) add a case in draw(), accent1(), accent2(), cardBottom(), fallback(),
 *   3) write a  private static void sceneXxx(Canvas c, int w, int h)  below.
 *
 * Theme 0 is the original cottage-under-the-moon scene and must stay as it is.
 * All scenes are static (drawn once into a cached bitmap) — no animation here.
 */
final class NightToRiseSleepScenes {

    private NightToRiseSleepScenes() {}

    static final int COUNT = 4; // 0 default, 1 lake, 2 cabin, 3 harbor

    // ------------------------------------------------------------------
    // [N2R-SLEEP-CARD] Stable artwork keys saved in preferences.
    // Index in this array == theme id. Never reorder; only append.
    // ------------------------------------------------------------------
    static final String[] KEYS = {"default", "lake", "cabin", "harbor"};

    /** Turns a saved key into a theme id. Unknown/old values -> default (0). */
    static int themeFromKey(String key) {
        if (key == null) return NightToRiseBlockCard.THEME_DEFAULT;
        for (int i = 0; i < KEYS.length; i++) if (KEYS[i].equals(key)) return i;
        return NightToRiseBlockCard.THEME_DEFAULT;
    }

    /**
     * Builds the complete Sleep Guard card: label, moon icon, stat labels,
     * colours and the chosen picture, on the shared card shell.
     */
    static NightToRiseBlockCard.Handles build(android.content.Context ctx, int theme) {
        final int t = (theme < 0 || theme >= COUNT) ? NightToRiseBlockCard.THEME_DEFAULT : theme;
        NightToRiseBlockCard.Style st = new NightToRiseBlockCard.Style();
        st.pillText = "SLEEP GUARD";
        st.icon = "\u263E";            // ☾
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
            case NightToRiseBlockCard.THEME_LAKE:   sceneLake(c, w, h); break;
            case NightToRiseBlockCard.THEME_CABIN:  sceneCabin(c, w, h); break;
            case NightToRiseBlockCard.THEME_HARBOR: sceneHarbor(c, w, h); break;
            default:                                sceneDefault(c, w, h); break;
        }
    }

    // ---- per-scene palette: CTA gradient, card bottom colour, flat fallback ----
    static int accent1(int theme) {
        switch (theme) {
            case NightToRiseBlockCard.THEME_LAKE:   return 0xFF4F6BFF;
            case NightToRiseBlockCard.THEME_CABIN:  return 0xFFF59E3B;
            case NightToRiseBlockCard.THEME_HARBOR: return 0xFF3F7FB8;
            default:                                return 0xFF6D6BF5;
        }
    }

    static int accent2(int theme) {
        switch (theme) {
            case NightToRiseBlockCard.THEME_LAKE:   return 0xFF7FB2FF;
            case NightToRiseBlockCard.THEME_CABIN:  return 0xFFD9622B;
            case NightToRiseBlockCard.THEME_HARBOR: return 0xFF5FB0C9;
            default:                                return 0xFFB39BFF;
        }
    }

    static int cardBottom(int theme) {
        switch (theme) {
            case NightToRiseBlockCard.THEME_LAKE:   return 0xFF0A1226;
            case NightToRiseBlockCard.THEME_CABIN:  return 0xFF0B1520;
            case NightToRiseBlockCard.THEME_HARBOR: return 0xFF0A1422;
            default:                                return 0xFF121629;
        }
    }

    static int fallback(int theme) {
        switch (theme) {
            case NightToRiseBlockCard.THEME_LAKE:   return 0xFF14224A;
            case NightToRiseBlockCard.THEME_CABIN:  return 0xFF17293B;
            case NightToRiseBlockCard.THEME_HARBOR: return 0xFF12233F;
            default:                                return 0xFF151A3A;
        }
    }

    // ------------------------------------------------------------------
    // 0 · DEFAULT — original sleep scene, untouched
    // ------------------------------------------------------------------
    private static void sceneDefault(Canvas c, int w, int h) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        // sky
        p.setShader(new LinearGradient(0, 0, 0, h,
            new int[]{0xFF060924, 0xFF141A55, 0xFF2B2470}, new float[]{0f, 0.6f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // soft nebula glow, top-right
        p.setShader(new RadialGradient(w * 0.82f, h * 0.18f, w * 0.65f,
            alpha(0xFF7C5CF0, 70), alpha(0xFF7C5CF0, 0), Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // stars
        Rng r = new Rng(7);
        p.setColor(Color.WHITE);
        for (int i = 0; i < 34; i++) {
            float x = r.next() * w, y = r.next() * h * 0.62f;
            float rad = 0.6f + r.next() * 1.1f;
            p.setAlpha(90 + (int) (r.next() * 120));
            c.drawCircle(x, y, rad, p);
        }
        p.setAlpha(255);

        // moon (crescent), upper area
        float mr = Math.max(16f, h * 0.17f);
        float mx = w * 0.62f, my = h * 0.32f;
        p.setShader(new RadialGradient(mx, my, mr * 3.2f,
            alpha(0xFFFFF2C8, 110), alpha(0xFFCFC2FF, 0), Shader.TileMode.CLAMP));
        c.drawCircle(mx, my, mr * 3.2f, p);
        p.setShader(null);

        int save = c.saveLayer(mx - mr, my - mr, mx + mr, my + mr, null);
        p.setShader(new LinearGradient(mx - mr, my - mr, mx + mr, my + mr,
            0xFFFFFBE6, 0xFFE9DCA8, Shader.TileMode.CLAMP));
        c.drawCircle(mx, my, mr, p);
        p.setShader(null);
        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OUT));
        c.drawCircle(mx + mr * 0.42f, my - mr * 0.22f, mr * 0.86f, p);
        p.setXfermode(null);
        c.restoreToCount(save);

        // hills (two layers) + cottage
        drawHills(c, w, h, 0xFF101340, 0xFF232A55);
        drawCottage(c, w * 0.13f, h * 0.885f, h * 0.1f, 0xFF0A0C2E, true);
    }

    // ------------------------------------------------------------------
    // 1 · LAKE — moon, ridges, mist, moon-path on water, pines on the shore
    // ------------------------------------------------------------------
    private static void sceneLake(Canvas c, int w, int h) {
        Pen s = new Pen(c, w, h);
        float H = s.H;
        Rnd r = new Rnd(11);
        float yS = H * 0.64f;

        s.vGrad(0, yS + 2, new int[]{0xFF060B20, 0xFF14224A, 0xFF2C4573}, new float[]{0f, .55f, 1f});
        s.stars(r, 70, 0, H * 0.5f, .35f, 1.1f);

        float my = H * 0.26f;
        s.glow(252, my, 80, 0xFFCFDCFF, 120);
        s.circle(252, my, 16, 0xFFF2F0E4);
        s.circle(246, my - 4, 3.6f, 0x99D6D3C2);
        s.circle(257, my + 5, 2.8f, 0x8CD6D3C2);
        s.circle(259, my - 7, 2f, 0x80D6D3C2);

        s.ridge(r, H * 0.52f, H * 0.20f, .55f, 0xFF101C3E);
        s.ridge(r, H * 0.60f, H * 0.10f, .50f, 0xFF0A1331);

        s.vGrad(yS, H, new int[]{0xFF1C2F5B, 0xFF050A1B}, null);
        s.blob(180, yS, 210, 6, 0xFFAEBFE6, 70, 6);

        // moon path on the water
        s.blob(252, yS + H * 0.2f, 14, H * 0.2f, 0xFF9DB4EE, 50, 6);
        int rows = 12;
        for (int i = 0; i < rows; i++) {
            float y = yS + 4 + i * (H * 0.3f / rows);
            float wv = (30 - i * 1.8f) * (.7f + r.next() * .6f);
            s.blob(252 + (r.next() - .5f) * 6, y, Math.max(2f, wv / 2f), .9f, 0xFFE8ECFF, Math.max(24, 190 - i * 12), .8f);
        }
        for (int i = 0; i < 5; i++) {
            s.waveLine(yS + 8 + i * (H * 0.06f), 0x1A8CAAE6, 1.6f, .8f);
        }

        // shore + pines
        Path land = new Path();
        float sc = s.sc;
        land.moveTo(0, H * 0.74f * sc);
        land.cubicTo(30 * sc, H * 0.68f * sc, 70 * sc, H * 0.74f * sc, 104 * sc, H * 0.90f * sc);
        land.lineTo(104 * sc, H * sc);
        land.lineTo(0, H * sc);
        land.close();
        Paint lp = new Paint(Paint.ANTI_ALIAS_FLAG);
        lp.setColor(0xFF03060F);
        c.drawPath(land, lp);
        s.pine(12, H * 0.76f, H * 0.62f, 32, 0xFF03060F);
        s.pine(40, H * 0.80f, H * 0.44f, 24, 0xFF03060F);
        s.pine(66, H * 0.86f, H * 0.34f, 20, 0xFF03060F);
        s.pine(92, H * 0.92f, H * 0.24f, 15, 0xFF03060F);
        s.blob(60, H * 0.88f, 90, 5, 0xFF8FA6D8, 30, 3);
    }

    // ------------------------------------------------------------------
    // 2 · CABIN — snowed-in cabin, warm window, faint moon behind cloud
    // ------------------------------------------------------------------
    private static void sceneCabin(Canvas c, int w, int h) {
        Pen s = new Pen(c, w, h);
        float H = s.H;
        float sc = s.sc;
        Rnd r = new Rnd(52);
        float cb = H * 0.76f; // cabin ground line

        s.vGrad(0, H, new int[]{0xFF070F1A, 0xFF17293B, 0xFF2D4559}, new float[]{0f, .6f, 1f});
        s.stars(r, 34, 0, H * 0.4f, .35f, .9f);
        s.circle(74, H * 0.20f, 11, 0xE6E2E9F2);
        s.blob(66, H * 0.24f, 60, 5, 0xFF8EA6C2, 140, 3);
        s.blob(104, H * 0.18f, 46, 4, 0xFF8EA6C2, 100, 3);

        s.ridge(r, H * 0.50f, H * 0.18f, .55f, 0xFF22364D);
        s.ridge(r, H * 0.58f, H * 0.09f, .50f, 0xFF182A3F);

        // snow ground
        Path snow = new Path();
        snow.moveTo(0, H * 0.70f * sc);
        snow.quadTo(90 * sc, H * 0.62f * sc, 190 * sc, H * 0.68f * sc);
        snow.quadTo(280 * sc, H * 0.74f * sc, 360 * sc, H * 0.66f * sc);
        snow.lineTo(360 * sc, H * sc);
        snow.lineTo(0, H * sc);
        snow.close();
        Paint sp = new Paint(Paint.ANTI_ALIAS_FLAG);
        sp.setShader(new LinearGradient(0, H * 0.62f * sc, 0, H * sc, 0xFF86A2BF, 0xFF2F4761, Shader.TileMode.CLAMP));
        c.drawPath(snow, sp);

        // back pines with a thin snow rim on the left edge
        float[][] bp = {{120, 0.72f, 0.36f, 18}, {148, 0.70f, 0.28f, 14}, {316, 0.72f, 0.38f, 20}, {338, 0.74f, 0.30f, 15}};
        for (float[] p : bp) {
            s.pine(p[0] - 1.2f, H * p[1] - 1f, H * p[2], p[3], 0x8C6D8AA6);
            s.pine(p[0], H * p[1], H * p[2], p[3], 0xFF0D1F2A);
        }

        // warm light spilling onto the snow
        s.blob(232, cb + 5, 66, H * 0.09f, 0xFFFFAA46, 150, 8);

        // chimney + smoke
        s.rect(244, cb - 42, 251, cb - 20, 0xFF1D1612);
        s.rect(243, cb - 45, 252, cb - 42, 0xFFDFEAF5);
        s.blob(248, cb - 50, 5, 5, 0xFFC6D3E0, 70, 3);
        s.blob(252, cb - 61, 7, 7, 0xFFC6D3E0, 50, 3);
        s.blob(259, cb - 74, 9, 9, 0xFFC6D3E0, 32, 3);

        // body + log lines
        s.rect(204, cb - 22, 256, cb, 0xFF2B1B14);
        for (float y = cb - 18; y < cb; y += 4) s.line(204, y, 256, y, 0xFF170D09, .8f);

        // roof + snow cap
        s.poly(0xFF16212C, 198, cb - 20, 230, cb - 47, 262, cb - 20);
        s.poly(0xFFE2ECF6, 195, cb - 19, 230, cb - 50, 265, cb - 19, 258, cb - 22, 230, cb - 44, 202, cb - 22);

        // window + door
        s.glow(220, cb - 11, 18, 0xFFFFB04D, 120);
        s.rect(214, cb - 16, 226, cb - 6, 0xFFFFC462);
        s.line(220, cb - 16, 220, cb - 6, 0xFF5A3318, 1f);
        s.line(214, cb - 11, 226, cb - 11, 0xFF5A3318, 1f);
        s.rect(214, cb - 6, 226, cb - 4, 0xE6E2ECF6);
        s.rect(236, cb - 16, 245, cb, 0xFF1A0F0A);
        s.blob(230, cb + 1, 38, 3, 0xFFDFEAF5, 90, 1f);

        // foreground pines
        s.pine(22, H + 4, H * 0.78f, 34, 0xFF050C13);
        s.pine(54, H + 6, H * 0.52f, 26, 0xFF050C13);
        s.pine(338, H + 5, H * 0.62f, 32, 0xFF050C13);

        // snowfall, frozen in place
        for (int i = 0; i < 64; i++) {
            float x = r.next() * 370f - 5f, y = r.next() * (H - 6);
            float rad = .5f + (float) Math.pow(r.next(), 2) * 1.8f;
            s.circle(x, y, rad, Color.argb(100 + (int) (r.next() * 130), 255, 255, 255));
        }
    }

    // ------------------------------------------------------------------
    // 3 · HARBOR — lighthouse beam over dark water, small boat with a lantern
    // ------------------------------------------------------------------
    private static void sceneHarbor(Canvas c, int w, int h) {
        Pen s = new Pen(c, w, h);
        float H = s.H;
        float sc = s.sc;
        Rnd r = new Rnd(79);
        float hz = H * 0.60f;
        float tb = H * 0.84f;  // tower base
        float tt = H * 0.34f;  // tower top
        float ly = tt - 10f;   // lantern centre

        s.vGrad(0, hz + 2, new int[]{0xFF040913, 0xFF12233F, 0xFF2D5075}, new float[]{0f, .55f, 1f});
        s.stars(r, 56, 0, H * 0.42f, .3f, 1f);
        s.blob(70, H * 0.25f, 70, 5, 0xFF9DB6D8, 30, 5);
        s.blob(200, H * 0.36f, 90, 4, 0xFF9DB6D8, 36, 5);
        s.blob(320, H * 0.18f, 60, 4, 0xFF9DB6D8, 26, 5);

        s.ridge(r, hz - 2, H * 0.05f, .5f, 0xFF0A1626);
        s.vGrad(hz + 1, H, new int[]{0xFF1B3A5A, 0xFF050C18}, null);
        s.blob(180, hz + 1, 200, 3, 0xFF8FB4DA, 64, 3);
        for (int i = 0; i < 9; i++) {
            s.waveLine(hz + 6 + i * (H * 0.36f / 9f), 0x2496BEE6, 1.4f + r.next() * 1.4f, .8f);
        }

        // beam, its glint on the water, and a short counter-beam
        s.blob(130, hz + H * 0.2f, 130, 4, 0xFFFFECAA, 40, 3);
        s.blob(90, hz + H * 0.3f, 70, 3, 0xFFFFECAA, 30, 3);
        s.beam(284, ly, -40, ly - 26, ly + 26, 0xFFFFECAA, 150, 3);
        s.beam(284, ly, 350, ly - 12, ly + 12, 0xFFFFECAA, 90, 3);

        // little fishing boat with a lantern
        float bx = 112, by = hz + H * 0.2f;
        s.blob(bx, by + 12, 5, 12, 0xFFFFD27A, 55, 2);
        s.poly(0xFF02050A, bx - 16, by, bx + 16, by, bx + 11, by + 6, bx - 11, by + 6);
        s.rect(bx - 2, by - 7, bx + 7, by, 0xFF02050A);
        s.line(bx - 8, by - 19, bx - 8, by, 0xFF02050A, 1.1f);
        s.glow(bx - 8, by - 19, 8, 0xFFFFD27A, 110);
        s.circle(bx - 8, by - 19, 1.6f, 0xFFFFE2A0);

        // tower (gradient body, two dark-red bands, shaded right side)
        Path tower = new Path();
        tower.moveTo(268 * sc, (tb + 8) * sc);
        tower.lineTo(276 * sc, tt * sc);
        tower.lineTo(292 * sc, tt * sc);
        tower.lineTo(300 * sc, (tb + 8) * sc);
        tower.close();
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setShader(new LinearGradient(268 * sc, 0, 300 * sc, 0,
            new int[]{0xFF9AA8BD, 0xFF5B6A80, 0xFF1A2331}, new float[]{0f, .5f, 1f}, Shader.TileMode.CLAMP));
        c.drawPath(tower, tp);
        c.save();
        c.clipPath(tower);
        float span = tb - tt;
        s.rect(260, tt + span * 0.28f, 306, tt + span * 0.28f + span * 0.15f, 0xFF8A2C33);
        s.rect(260, tt + span * 0.60f, 306, tt + span * 0.60f + span * 0.15f, 0xFF8A2C33);
        s.rect(260, tt, 306, tb + 8, 0x40000000);
        c.restore();

        // rock + foam at the base
        Path rock = new Path();
        rock.moveTo(232 * sc, H * sc);
        rock.lineTo(244 * sc, (tb + 4) * sc);
        rock.quadTo(262 * sc, (tb - 8) * sc, 286 * sc, tb * sc);
        rock.quadTo(310 * sc, (tb - 2) * sc, 322 * sc, (tb + 10) * sc);
        rock.lineTo(338 * sc, H * sc);
        rock.close();
        Paint rp = new Paint(Paint.ANTI_ALIAS_FLAG);
        rp.setColor(0xFF04070D);
        c.drawPath(rock, rp);
        s.blob(285, tb + 10, 52, 3, 0xFFC8DCF2, 50, 1f);

        // gallery, lantern room, roof, glow
        s.rect(270, tt - 4, 298, tt, 0xFF0B111B);
        s.glow(284, ly, 40, 0xFFFFE49A, 170);
        s.rect(277, tt - 16, 291, tt - 4, 0xFFFFEAA8);
        s.poly(0xFF0B111B, 275, tt - 16, 284, tt - 26, 293, tt - 16);
        s.circle(284, tt - 27.5f, 1.6f, 0xFF0B111B);

        s.ridge(r, H * 0.97f, H * 0.03f, .5f, 0xFF02050A);
    }
}
