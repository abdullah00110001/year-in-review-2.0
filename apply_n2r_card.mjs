#!/usr/bin/env node
/**
 * apply_n2r_card.mjs
 *
 * Installs a card-only Sleep Guard / Rise Guard block screen (no painted
 * backdrop — only the floating card is visible) for the Sleep to Rise
 * feature. Independent of, and safe to run before or after, apply_shield_card.mjs.
 *
 *   node apply_n2r_card.mjs            install (backup -> patch -> verify)
 *   node apply_n2r_card.mjs --check    only verify what is installed now
 *   node apply_n2r_card.mjs --dry-run  show what would change, write nothing
 *   node apply_n2r_card.mjs --build    install, then run Gradle + tsc checks
 *   node apply_n2r_card.mjs --rollback restore the newest backup from this script
 *
 * Safety model: identical to apply_shield_card.mjs — anchored exact-text
 * edits (nothing written if any anchor fails to match exactly once), a
 * timestamped backup before any write, self-verification after writing,
 * automatic rollback on verify failure, and a byte-hash check that no Shield
 * file or other untouched file was disturbed.
 *
 * Every emergency-unlock / kill-switch / strict-mode / re-check-on-resume
 * behaviour in NightToRiseBlockActivity is left exactly as it was — only the
 * view-building code changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const J = 'android/app/src/main/java/com/mylifeos/app';
const MARK = '[N2R-CARD]';
const BACKUP_ROOT = path.join(ROOT, '.n2r_card_backup');

const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => console.log('  \u2717 ' + m);
const info = (m) => console.log(m);

const abs = (rel) => path.join(ROOT, ...rel.split('/'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const L = (lines) => lines.join('\n');

function readText(rel) {
  const raw = fs.readFileSync(abs(rel)).toString('utf8');
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

const CARD_PATH = `${J}/nighttorise/NightToRiseBlockCard.java`;
const ACTIVITY_PATH = `${J}/nighttorise/NightToRiseBlockActivity.java`;

const CARD_JAVA = String.raw`package com.mylifeos.app.nighttorise;

import android.content.Context;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * [N2R-CARD] Card-only Sleep/Rise block UI.
 *
 * Same idea as Shield's ShieldBlockCard: nothing is painted behind the card —
 * the host (Activity window or overlay) is left fully transparent, so only
 * the floating card is visible over whatever was on screen.
 *
 * This class only builds the view tree and hands back the live widgets the
 * existing NightToRiseBlockActivity already knows how to drive (countdown
 * timer, emergency-unlock button, kill-switch taps, allowed-app chips). No
 * block/safety logic lives here — that all stays in the Activity, unchanged.
 */
public final class NightToRiseBlockCard {

    private NightToRiseBlockCard() {}

    /** Live widgets the caller (the Activity) updates and attaches listeners to. */
    public static final class Handles {
        public final View root;
        public final View content;
        public final TextView pill;
        public final TextView title;
        public final TextView message;
        public final TextView countdown;
        public final View countdownBox;
        public final LinearLayout allowedContainer;
        public final Button home;
        public final Button override;

        Handles(View root, View content, TextView pill, TextView title, TextView message,
                TextView countdown, View countdownBox, LinearLayout allowedContainer, Button home, Button override) {
            this.root = root; this.content = content; this.pill = pill; this.title = title;
            this.message = message; this.countdown = countdown; this.countdownBox = countdownBox;
            this.allowedContainer = allowedContainer; this.home = home; this.override = override;
        }
    }

    private static int blend(int c, int with, float amount) {
        int a = Math.round(Color.alpha(c) * (1 - amount) + Color.alpha(with) * amount);
        int r = Math.round(Color.red(c) * (1 - amount) + Color.red(with) * amount);
        int g = Math.round(Color.green(c) * (1 - amount) + Color.green(with) * amount);
        int b = Math.round(Color.blue(c) * (1 - amount) + Color.blue(with) * amount);
        return Color.argb(a, r, g, b);
    }

    private static int alpha(int c, int a) {
        return Color.argb(a, Color.red(c), Color.green(c), Color.blue(c));
    }

    /** Builds the card. {@code isRise} picks the palette/icon/copy; everything else is generic. */
    public static Handles build(Context ctx, boolean isRise) {
        int a1 = isRise ? 0xFFFB923C : 0xFF6D6BF5;
        int a2 = isRise ? 0xFFF43F5E : 0xFFB39BFF;
        int glow = isRise ? 0xFFFF7A60 : 0xFF8B7CF6;
        int tint = blend(a1, Color.WHITE, 0.7f);
        int cardTop = isRise ? 0xE62B1430 : 0xE6242A55;
        int cardBottom = isRise ? 0xF2170B22 : 0xF2121629;
        int rim = isRise ? 0xFF2B1430 : 0xFF141A3A;
        int colorText = 0xFFF6F7FF;
        int colorText2 = 0xFFA9B0D6;

        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float d = dm.density;
        float em = Math.max(14f * d, Math.min(20f * d, 0.05f * Math.min(dm.widthPixels, dm.heightPixels)));

        FrameLayout root = new FrameLayout(ctx);
        root.setBackgroundColor(Color.TRANSPARENT); // [N2R-CARD] no painted backdrop — card only.
        root.setClickable(true);
        root.setFocusable(true);

        ScrollView scroll = new ScrollView(ctx);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        root.addView(scroll, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout page = new LinearLayout(ctx);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(0, Math.round(em), 0, Math.round(em));
        scroll.addView(page, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        int cardW = Math.round(Math.min(em * 23f, dm.widthPixels - em * 2.2f));
        FrameLayout holder = new FrameLayout(ctx);
        holder.setClipChildren(false);
        holder.setClipToPadding(false);
        page.addView(holder, new LinearLayout.LayoutParams(cardW, LinearLayout.LayoutParams.WRAP_CONTENT));

        int badgeBox = Math.round(em * 5.6f);
        int cardTopMargin = badgeBox / 2;

        LinearLayout content = new LinearLayout(ctx);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(Math.round(em * 1.5f), Math.round(em * 3.1f), Math.round(em * 1.5f), Math.round(em * 1.5f));
        GradientDrawable cardBg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{cardTop, cardBottom});
        cardBg.setCornerRadius(em * 1.9f);
        cardBg.setStroke(Math.max(1, Math.round(d)), alpha(a2, 60));
        content.setBackground(cardBg);
        FrameLayout.LayoutParams contentLp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        contentLp.topMargin = cardTopMargin;
        holder.addView(content, contentLp);

        // badge: soft glow + gradient circle + emoji, centred on the card's top edge
        View badgeView = new View(ctx) {
            @Override protected void onDraw(android.graphics.Canvas c) {
                float cx = getWidth() / 2f, cy = getHeight() / 2f, r = em * 2f;
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setShader(new RadialGradient(cx, cy, r * 1.7f, alpha(glow, 130), alpha(glow, 0), Shader.TileMode.CLAMP));
                c.drawCircle(cx, cy, r * 1.7f, p);
                p.setShader(null);
                p.setColor(rim);
                c.drawCircle(cx, cy, r, p);
                p.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r, a1, a2, Shader.TileMode.CLAMP));
                c.drawCircle(cx, cy, r - em * 0.22f, p);
                p.setShader(null);
                p.setColor(Color.WHITE);
                p.setTextAlign(Paint.Align.CENTER);
                p.setTextSize(em * 1.9f);
                Paint.FontMetrics fm = p.getFontMetrics();
                c.drawText(isRise ? "\u2600" : "\u263E", cx, cy - (fm.ascent + fm.descent) / 2f, p);
            }
        };
        FrameLayout.LayoutParams badgeLp = new FrameLayout.LayoutParams(badgeBox, badgeBox);
        badgeLp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        badgeLp.topMargin = cardTopMargin;
        holder.addView(badgeView, badgeLp);

        // pill: "SLEEP GUARD" / "RISE GUARD"
        TextView pill = new TextView(ctx);
        pill.setText(isRise ? "RISE GUARD" : "SLEEP GUARD");
        pill.setTextColor(tint);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 0.7f);
        pill.setTypeface(Typeface.DEFAULT_BOLD);
        pill.setLetterSpacing(0.08f);
        pill.setPadding(Math.round(em * 0.9f), Math.round(em * 0.45f), Math.round(em * 0.9f), Math.round(em * 0.45f));
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setColor(alpha(Color.WHITE, 18));
        pillBg.setCornerRadius(em * 2f);
        pillBg.setStroke(Math.max(1, Math.round(d)), alpha(Color.WHITE, 26));
        pill.setBackground(pillBg);
        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pillLp.bottomMargin = Math.round(em * 0.8f);
        content.addView(pill, pillLp);

        TextView title = new TextView(ctx);
        title.setTextColor(colorText);
        title.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 1.5f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setIncludeFontPadding(false);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleLp.bottomMargin = Math.round(em * 0.35f);
        content.addView(title, titleLp);

        TextView message = new TextView(ctx);
        message.setTextColor(colorText2);
        message.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 0.92f);
        message.setGravity(Gravity.CENTER);
        message.setLineSpacing(0, 1.3f);
        message.setClickable(true); // kill-switch taps land here, same as before
        LinearLayout.LayoutParams msgLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        msgLp.bottomMargin = Math.round(em * 1.3f);
        content.addView(message, msgLp);

        // countdown block
        LinearLayout cdBox = new LinearLayout(ctx);
        cdBox.setOrientation(LinearLayout.VERTICAL);
        cdBox.setGravity(Gravity.CENTER);
        cdBox.setPadding(Math.round(em * 1f), Math.round(em * 0.8f), Math.round(em * 1f), Math.round(em * 0.8f));
        GradientDrawable cdBg = new GradientDrawable();
        cdBg.setColor(alpha(Color.WHITE, 14));
        cdBg.setCornerRadius(em * 1.1f);
        cdBg.setStroke(Math.max(1, Math.round(d)), alpha(Color.WHITE, 20));
        cdBox.setBackground(cdBg);
        TextView countdown = new TextView(ctx);
        countdown.setTextColor(colorText);
        countdown.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 1.7f);
        countdown.setTypeface(Typeface.DEFAULT_BOLD);
        countdown.setIncludeFontPadding(false);
        cdBox.addView(countdown, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        TextView cdLabel = new TextView(ctx);
        cdLabel.setText(isRise ? "UNTIL APPS UNLOCK" : "UNTIL WAKE-UP");
        cdLabel.setTextColor(colorText2);
        cdLabel.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 0.62f);
        cdLabel.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams cdLabelLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cdLabelLp.topMargin = Math.round(em * 0.2f);
        cdBox.addView(cdLabel, cdLabelLp);
        LinearLayout.LayoutParams cdBoxLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cdBoxLp.bottomMargin = Math.round(em * 1.2f);
        content.addView(cdBox, cdBoxLp);

        // allowed-apps chips container (rows added by the Activity, unchanged logic)
        LinearLayout allowedContainer = new LinearLayout(ctx);
        allowedContainer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams allowedLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        allowedLp.bottomMargin = Math.round(em * 1.2f);
        content.addView(allowedContainer, allowedLp);

        // primary CTA — goes Home (does not lift the block)
        Button home = new Button(ctx);
        home.setText(isRise ? "Return to Home" : "Go Back Home");
        home.setAllCaps(false);
        home.setTypeface(Typeface.DEFAULT_BOLD);
        home.setTextColor(Color.WHITE);
        home.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 1f);
        GradientDrawable homeBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{a1, a2});
        homeBg.setCornerRadius(em * 2.4f);
        home.setBackground(homeBg);
        home.setPadding(0, 0, 0, 0);
        LinearLayout.LayoutParams homeLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, Math.round(em * 3.1f));
        homeLp.bottomMargin = Math.round(em * 0.7f);
        content.addView(home, homeLp);

        // secondary — the real safety valve (emergency unlock / strict wait), kept clearly visible
        Button override = new Button(ctx);
        override.setAllCaps(false);
        override.setTypeface(Typeface.DEFAULT_BOLD);
        override.setTextColor(tint);
        override.setTextSize(TypedValue.COMPLEX_UNIT_PX, em * 0.85f);
        GradientDrawable overrideBg = new GradientDrawable();
        overrideBg.setColor(Color.TRANSPARENT);
        overrideBg.setCornerRadius(em * 2.4f);
        overrideBg.setStroke(Math.max(1, Math.round(d)), alpha(tint, 90));
        override.setBackground(overrideBg);
        override.setPadding(0, 0, 0, 0);
        content.addView(override, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, Math.round(em * 2.7f)));

        content.setAlpha(0f);
        content.setTranslationY(em * 0.6f);
        content.animate().alpha(1f).translationY(0f).setDuration(260)
            .setInterpolator(new DecelerateInterpolator()).start();

        return new Handles(root, content, pill, title, message, countdown, cdBox, allowedContainer, home, override);
    }
}
`;
const ACTIVITY_JAVA = String.raw`package com.mylifeos.app.nighttorise;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.mylifeos.app.shield.ShieldAccessibilityService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * NightToRiseBlockActivity — full-screen lock shown by the accessibility
 * service when the user opens a disallowed app inside a Sleep-to-Rise window.
 *
 * Intent extras:
 *   "message" : String
 *   "endMs"   : long
 *   "strict"  : boolean
 *   "package" : String  (the blocked app, re-checked on resume)
 *   "phase"   : String  ("SLEEP_LOCK" | "RISE_LOCK") — selects icon + accent tint
 *
 * [N2R-CARD] The visuals are the shared card from NightToRiseBlockCard (no
 * painted backdrop — only the card is visible; the window itself is
 * transparent). Every safety behaviour below — kill-switch taps, emergency
 * unlock, strict-mode wait, allowed-app chips, re-check on resume, the
 * swallowed back button — is unchanged from before this visual update.
 */
public class NightToRiseBlockActivity extends Activity {

    public static final String EXTRA_MESSAGE = "message";
    public static final String EXTRA_END_MS  = "endMs";
    public static final String EXTRA_STRICT  = "strict";
    public static final String EXTRA_PACKAGE = "package";
    public static final String EXTRA_PHASE   = "phase";

    private static final int KILL_TAP_COUNT = 7;
    private static final long KILL_TAP_WINDOW_MS = 5000;
    private final List<Long> killTaps = new ArrayList<>();

    private CountDownTimer timer;
    private CountDownTimer strictTimer;
    private String blockedPackage;
    private boolean broke = false;

    private NightToRiseBlockCard.Handles ui;

    private static final Map<String, String> FRIENDLY_NAMES = new HashMap<>();
    static {
        FRIENDLY_NAMES.put("com.android.dialer", "Phone");
        FRIENDLY_NAMES.put("com.google.android.dialer", "Phone");
        FRIENDLY_NAMES.put("com.samsung.android.dialer", "Phone");
        FRIENDLY_NAMES.put("com.android.phone", "Phone");
        FRIENDLY_NAMES.put("com.android.server.telecom", "Phone");
        FRIENDLY_NAMES.put("com.android.contacts", "Contacts");
        FRIENDLY_NAMES.put("com.android.deskclock", "Clock");
        FRIENDLY_NAMES.put("com.google.android.deskclock", "Clock");
        FRIENDLY_NAMES.put("com.sec.android.app.clockpackage", "Clock");
        FRIENDLY_NAMES.put("com.android.emergency", "Emergency");
        FRIENDLY_NAMES.put("com.android.systemui", "System");
        FRIENDLY_NAMES.put("com.android.settings", "Settings");
        FRIENDLY_NAMES.put("org.telegram.messenger", "Telegram");
        FRIENDLY_NAMES.put("com.google.android.apps.messaging", "Messages");
    }

    private String friendlyName(String pkg) {
        String known = FRIENDLY_NAMES.get(pkg);
        if (known != null) return known;
        int lastDot = pkg.lastIndexOf('.');
        String tail = lastDot >= 0 && lastDot < pkg.length() - 1 ? pkg.substring(lastDot + 1) : pkg;
        return tail.length() <= 1 ? pkg : Character.toUpperCase(tail.charAt(0)) + tail.substring(1);
    }

    private void breakLock(NightToRisePreferences prefs) {
        broke = true;
        prefs.recordPendingBreak();
        prefs.clearStrictUnlockRequest();
        goHome();
    }

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_HOME)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }

    private void refreshStrictOverride(NightToRisePreferences prefs, Button override) {
        long req = prefs.strictUnlockRequestedAt();
        if (req <= 0L) {
            override.setEnabled(true);
            override.setText("Request emergency unlock (10 min wait)");
            return;
        }
        long left = NightToRisePreferences.STRICT_UNLOCK_DELAY_MS - (System.currentTimeMillis() - req);
        if (left <= 0L) {
            override.setEnabled(true);
            override.setText("Emergency unlock");
        } else {
            override.setEnabled(false);
            long s = left / 1000;
            override.setText(String.format("Unlock available in %d:%02d", s / 60, s % 60));
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ShieldAccessibilityService.dismissBlockingOverlay();
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );
        // [N2R-CARD] card-only: nothing painted behind it, window stays transparent.
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        bind(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bind(intent);
    }

    private void bind(Intent intent) {
        String message = intent != null ? intent.getStringExtra(EXTRA_MESSAGE) : null;
        long   endMs   = intent != null ? intent.getLongExtra(EXTRA_END_MS, 0L) : 0L;
        boolean strict = intent != null && intent.getBooleanExtra(EXTRA_STRICT, false);
        blockedPackage = intent != null ? intent.getStringExtra(EXTRA_PACKAGE) : null;
        String phase = intent != null ? intent.getStringExtra(EXTRA_PHASE) : null;
        boolean isRise = "RISE_LOCK".equals(phase);

        // [N2R-CARD] (re)build the card fresh for this phase — cheap, and keeps the
        // sleep/rise palette switch (and the icon/copy that go with it) simple and safe.
        ui = NightToRiseBlockCard.build(this, isRise);
        setContentView(ui.root);

        ui.title.setText(isRise ? "Rise with intention" : "Rest now");
        ui.message.setText(message != null ? message
            : (isRise ? "Screens stay closed a little longer." : "Time to rest. Put the phone down."));
        ui.message.setOnClickListener(v -> registerKillSwitchTap());

        final NightToRisePreferences prefs = new NightToRisePreferences(this);
        final NightToRiseManager manager = new NightToRiseManager(this);
        Set<String> available = NightToRiseDecider.effectiveAllowedPackages(manager.snapshot());
        populateAllowedChips(available);

        final Button override = ui.override;

        if (strictTimer != null) { strictTimer.cancel(); strictTimer = null; }

        if (!strict) {
            override.setText("Emergency unlock");
            override.setOnClickListener(v -> breakLock(prefs));
        } else {
            refreshStrictOverride(prefs, override);
            override.setOnClickListener(v -> {
                long req = prefs.strictUnlockRequestedAt();
                long now = System.currentTimeMillis();
                if (req <= 0L) {
                    prefs.requestStrictUnlock();
                    refreshStrictOverride(prefs, override);
                } else if (now - req >= NightToRisePreferences.STRICT_UNLOCK_DELAY_MS) {
                    breakLock(prefs);
                }
            });
            strictTimer = new CountDownTimer(NightToRisePreferences.STRICT_UNLOCK_DELAY_MS + 1000, 1000) {
                @Override public void onTick(long ms) { refreshStrictOverride(prefs, override); }
                @Override public void onFinish() { refreshStrictOverride(prefs, override); }
            }.start();
        }

        TextView countdown = ui.countdown;
        long remaining = Math.max(0, endMs - System.currentTimeMillis());
        if (timer != null) timer.cancel();
        timer = new CountDownTimer(remaining, 1000) {
            @Override public void onTick(long ms) {
                long s = ms / 1000;
                long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
                countdown.setText(h > 0
                    ? String.format("%d:%02d:%02d", h, m, sec)
                    : String.format("%02d:%02d", m, sec));
            }
            @Override public void onFinish() {
                countdown.setText("00:00");
                recheckOrFinish();
            }
        }.start();

        ui.home.setOnClickListener(v -> goHome());
    }

    /** Builds frosted-glass pill chips (3 per row) for the allowed-apps list. */
    private void populateAllowedChips(Set<String> packages) {
        LinearLayout container = ui.allowedContainer;
        container.removeAllViews();

        // Package ids are noise on a lock screen — show de-duplicated, human
        // names and cap the list so the screen stays calm.
        java.util.LinkedHashSet<String> labels = new java.util.LinkedHashSet<>();
        for (String pkg : packages) {
            if (pkg == null || pkg.trim().isEmpty()) continue;
            labels.add(friendlyName(pkg.trim()));
            if (labels.size() >= 6) break;
        }

        LinearLayout row = null;
        int inRow = 0;
        for (String label : labels) {
            if (row == null || inRow >= 3) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER);
                LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                rowLp.topMargin = dp(8);
                container.addView(row, rowLp);
                inRow = 0;
            }
            TextView chip = new TextView(this);
            chip.setText(label);
            chip.setTextSize(11);
            chip.setTextColor(Color.WHITE);
            chip.setPadding(dp(14), dp(7), dp(14), dp(7));
            GradientDrawable pill = new GradientDrawable();
            pill.setColor(Color.parseColor("#26FFFFFF"));
            pill.setStroke(dp(1), Color.parseColor("#40FFFFFF"));
            pill.setCornerRadius(dp(20));
            chip.setBackground(pill);
            LinearLayout.LayoutParams chipLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipLp.setMargins(dp(4), 0, dp(4), 0);
            row.addView(chip, chipLp);
            inRow++;
        }
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }

    private void registerKillSwitchTap() {
        long now = System.currentTimeMillis();
        killTaps.add(now);
        while (!killTaps.isEmpty() && now - killTaps.get(0) > KILL_TAP_WINDOW_MS) {
            killTaps.remove(0);
        }
        if (killTaps.size() >= KILL_TAP_COUNT) {
            new NightToRisePreferences(this).emergencyDisable();
            Toast.makeText(this, "Sleep to Rise turned off", Toast.LENGTH_LONG).show();
            killTaps.clear();
            broke = true;
            goHome();
        }
    }

    private void recheckOrFinish() {
        if (broke) { finish(); return; }
        try {
            NightToRiseManager mgr = new NightToRiseManager(this);
            NightToRiseManager.Decision d =
                mgr.decide(System.currentTimeMillis(), blockedPackage);
            if (d.shouldBlock) {
                Intent again = new Intent(getIntent());
                again.putExtra(EXTRA_MESSAGE, d.message);
                again.putExtra(EXTRA_END_MS, d.endTimeMs);
                again.putExtra(EXTRA_STRICT, mgr.prefs().strictMode());
                again.putExtra(EXTRA_PHASE, d.phase.name());
                bind(again);
                return;
            }
        } catch (Throwable ignored) {}
        finish();
    }

    @Override
    protected void onResume() {
        super.onResume();
        recheckOrFinish();
    }

    @Override public void onBackPressed() { /* swallow */ }

    @Override
    protected void onDestroy() {
        if (timer != null) timer.cancel();
        if (strictTimer != null) strictTimer.cancel();
        super.onDestroy();
    }
}
`;

const PATCHES = [
  {
    file: `${J}/shield/core/BlockingOverlay.java`,
    edits: [
      {
        find: L(['import android.widget.TextView;']),
        replace: L([
          'import android.widget.TextView;',
          '',
          '// ' + MARK + ' card-only Sleep/Rise block, shared with the Activity fallback.',
          'import com.mylifeos.app.nighttorise.NightToRiseBlockCard;',
        ]),
      },
      {
        find: L([
          '            if (wm == null) return false;',
          '',
          '            LinearLayout root = new LinearLayout(ctx);',
        ]),
        replace: L([
          '            if (wm == null) return false;',
          '',
          '            // ' + MARK + ' Sleep/Rise: card-only, nothing painted behind it. The old',
          '            // full-screen gradient path below is left in place, untouched, as the',
          '            // fallback for a Shield-only app block (sleepToRise == false).',
          '            if (sleepToRise) {',
          '                return renderNightCard(ctx, windowType, rise, title, message, onHome);',
          '            }',
          '',
          '            LinearLayout root = new LinearLayout(ctx);',
        ]),
      },
      {
        find: L(['    public static synchronized void hide() {']),
        replace: L([
          '    // ' + MARK + ' -----------------------------------------------------------------',
          '    private static boolean renderNightCard(',
          '        Context ctx, int windowType, boolean rise, String title, String message, Runnable onHome',
          '    ) {',
          '        try {',
          '            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);',
          '            if (wm == null) return false;',
          '',
          '            android.widget.FrameLayout outer = new android.widget.FrameLayout(ctx);',
          '            outer.setClickable(true);',
          '            outer.setFocusable(true);',
          '',
          '            NightToRiseBlockCard.Handles ui = NightToRiseBlockCard.build(ctx, rise);',
          '            if (title != null && !title.isEmpty()) ui.title.setText(title);',
          '            if (message != null && !message.isEmpty()) ui.message.setText(message);',
          '            ui.countdown.setText("");',
          '            ui.countdownBox.setVisibility(View.GONE);',
          '            ui.override.setVisibility(View.GONE);',
          '            ui.home.setOnClickListener(v -> {',
          '                hide();',
          '                if (onHome != null) onHome.run();',
          '            });',
          '            outer.addView(ui.root, new android.widget.FrameLayout.LayoutParams(',
          '                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,',
          '                android.widget.FrameLayout.LayoutParams.MATCH_PARENT));',
          '',
          '            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(',
          '                WindowManager.LayoutParams.MATCH_PARENT,',
          '                WindowManager.LayoutParams.MATCH_PARENT,',
          '                windowType,',
          '                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN',
          '                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,',
          '                PixelFormat.TRANSLUCENT);',
          '            lp.gravity = Gravity.TOP | Gravity.START;',
          '            wm.addView(outer, lp);',
          '            activeView = outer;',
          '            activeWindowManager = wm;',
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
];

const UNTOUCHED = [
  `${J}/nighttorise/NightToRiseManager.java`,
  `${J}/nighttorise/NightToRiseDecider.java`,
  `${J}/nighttorise/NightToRisePreferences.java`,
  `${J}/nighttorise/GuardTransitionNotifier.java`,
  `${J}/shield/core/ForegroundGuardService.java`,
  `${J}/shield/core/BlockLoopGuard.java`,
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/values/styles.xml',
];

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
  check(card && card.includes('public static Handles build(') && card.includes('class Handles'),
    'NightToRiseBlockCard.java present and complete', 'NightToRiseBlockCard.java missing or incomplete');
  check(card && card.includes('setBackgroundColor(Color.TRANSPARENT)') && !card.includes('BackdropView'),
    'NightToRiseBlockCard.java: card-only, no painted backdrop');
  check(card && balanced(card), 'NightToRiseBlockCard.java brackets balanced');

  const act = get(ACTIVITY_PATH);
  check(act && act.includes(MARK) && act.includes('NightToRiseBlockCard.build(') && act.includes('killTaps'),
    'NightToRiseBlockActivity: uses the shared card, kill-switch intact');
  for (const must of ['breakLock(', 'STRICT_UNLOCK_DELAY_MS', 'registerKillSwitchTap', 'recheckOrFinish', 'onBackPressed']) {
    check(act && act.includes(must), `NightToRiseBlockActivity: ${must} preserved`);
  }
  check(act && balanced(act), 'NightToRiseBlockActivity.java brackets balanced');

  const overlay = get(`${J}/shield/core/BlockingOverlay.java`);
  check(overlay && overlay.includes('renderNightCard') && overlay.includes('if (sleepToRise) {'),
    'BlockingOverlay: Sleep/Rise now renders the card-only path');
  check(overlay && overlay.includes('LinearLayout root = new LinearLayout(ctx);'),
    'BlockingOverlay: old Shield-only fallback path left intact');
  check(overlay && balanced(overlay), 'BlockingOverlay.java brackets balanced');

  if (fs.existsSync(BACKUP_ROOT)) {
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
    fs.copyFileSync(path.join(dir, 'files', ...rel.split('/')), abs(rel));
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
      if (!cur.includes('.n2r_card_backup')) fs.appendFileSync(ex, '\n.n2r_card_backup/\n');
    }
  } catch {}
}

function main() {
  info('Sleep/Rise block card installer');
  info('Project root: ' + ROOT);

  if (!fs.existsSync(abs('android/app/src/main/AndroidManifest.xml')) || !fs.existsSync(abs('src'))) {
    bad('Run this from the project root (the folder that contains "android" and "src").');
    process.exit(1);
  }
  if (ARGS.has('--rollback')) { info('\nRolling back:'); process.exit(rollback() ? 0 : 1); }
  if (ARGS.has('--check')) {
    const f = verify();
    info(f === 0 ? '\nAll checks passed.' : `\n${f} check(s) failed.`);
    process.exit(f === 0 ? 0 : 1);
  }

  const plan = [];
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

  try {
    const cur = readText(ACTIVITY_PATH);
    if (cur.text === ACTIVITY_JAVA) skipped.push(ACTIVITY_PATH);
    else if (!cur.text.includes(MARK) && (!cur.text.includes('KILL_TAP_COUNT') || !cur.text.includes('recheckOrFinish'))) {
      problems.push(`${ACTIVITY_PATH}: does not look like the version this installer was written for`);
    } else plan.push({ rel: ACTIVITY_PATH, text: ACTIVITY_JAVA, crlf: cur.crlf, kind: 'replace' });
  } catch { problems.push(`missing file: ${ACTIVITY_PATH}`); }

  if (fs.existsSync(abs(CARD_PATH))) {
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
  if (!plan.length) { info('\nNothing to do.'); process.exit(verify() === 0 ? 0 : 1); }

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
  for (const rel of UNTOUCHED) { try { man.untouched[rel] = sha(fs.readFileSync(abs(rel))); } catch {} }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 2));
  excludeBackupFromGit();
  info('\nBackup saved: ' + path.relative(ROOT, dir));

  info('\nWriting:');
  try {
    for (const p of plan) { writeText(p.rel, p.text, p.crlf); ok(p.rel); }
  } catch (e) {
    bad('write failed: ' + e.message + ' \u2014 rolling back');
    rollback(dir);
    process.exit(1);
  }

  const failures = verify();
  if (failures) {
    info(`\n${failures} check(s) failed \u2014 rolling everything back.`);
    rollback(dir);
    process.exit(1);
  }

  if (ARGS.has('--build')) {
    info('\nCompiling (this can take a few minutes)...');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const g = spawnSync(gradlew, [':app:compileDebugJavaWithJavac', '-q'], { cwd: abs('android'), stdio: 'inherit', shell: process.platform === 'win32' });
    if (g.status !== 0) { bad('Java compile FAILED. Fix or run:  node apply_n2r_card.mjs --rollback'); process.exit(2); }
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
  info('  Undo anytime:  node apply_n2r_card.mjs --rollback');
}

main();
