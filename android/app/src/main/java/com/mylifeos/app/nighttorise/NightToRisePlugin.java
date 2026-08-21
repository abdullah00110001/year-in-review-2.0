package com.mylifeos.app.nighttorise;

import android.content.Context;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NightToRisePlugin — JS bridge for syncing Night-to-Rise config + rise alarm
 * time into SharedPreferences so the accessibility service can enforce the lock.
 *
 * JS side: registerPlugin<…>('NightToRise')
 *   - setConfig({ json: string })
 *   - setRiseAlarm({ epochMillis: number })
 *   - consumePendingBreak() -> { broke: boolean }
 *   - getStatus() -> NativeLockStatus   [FIX: was declared on the TS side
 *     (nightToRiseBridge.ts) and called from NightToRiseGuard, but never
 *     actually implemented here — every call silently failed and returned
 *     null. This is why the in-app "Rest now" overlay's phase was always
 *     computed locally in JS instead of reflecting real native enforcement.]
 */
@CapacitorPlugin(name = "NightToRise")
public class NightToRisePlugin extends Plugin {

    @PluginMethod
    public void setConfig(PluginCall call) {
        String json = call.getString("json");
        if (json == null) { call.reject("json required"); return; }
        try {
            new NightToRisePreferences(getContext()).saveJsonConfig(json);
            ForegroundGuardService.kick(getContext());
            call.resolve();
        } catch (Exception t) {
            call.reject("setConfig failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void setRiseAlarm(PluginCall call) {
        long ms = call.getLong("epochMillis", 0L);
        new NightToRisePreferences(getContext()).saveRiseAlarmMillis(ms);
        call.resolve();
    }

    @PluginMethod
    public void consumePendingBreak(PluginCall call) {
        boolean broke = new NightToRisePreferences(getContext()).consumePendingBreak();
        JSObject ret = new JSObject();
        ret.put("broke", broke);
        call.resolve(ret);
    }

    /**
     * NEW: real native enforcement state, matching NativeLockStatus on the TS
     * side exactly:
     *   { enabled, phase, locking, endTimeMs, accessibilityEnabled }
     *
     * We deliberately probe with a package name that can never match the
     * self-package exemption, the allowlist, or any hardcoded safe package —
     * decide()'s safe-package check treats null/empty as "safe" (so it would
     * always report ARMED regardless of the real window), and a real
     * foreground package could itself be on the allowlist (also always
     * reporting ARMED). A private-use probe string guarantees the returned
     * phase reflects the actual sleep/rise window, not whatever happens to
     * be in the foreground at the moment this is called.
     */
    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        NightToRiseManager mgr = new NightToRiseManager(ctx);
        NightToRiseManager.Decision d =
            mgr.decide(System.currentTimeMillis(), "__n2r_status_probe__");

        JSObject ret = new JSObject();
        ret.put("enabled", mgr.prefs().isEnabled());
        ret.put("phase", d.phase.name());
        ret.put("locking", d.shouldBlock);
        ret.put("endTimeMs", d.endTimeMs);
        ret.put("accessibilityEnabled", isAccessibilityServiceEnabled(ctx));
        call.resolve(ret);
    }

    private boolean isAccessibilityServiceEnabled(Context ctx) {
        try {
            String enabled = Settings.Secure.getString(
                ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null || enabled.isEmpty()) return false;
            String target = ctx.getPackageName() + "/"
                + com.mylifeos.app.shield.ShieldAccessibilityService.class.getName();
            for (String s : enabled.split(":")) {
                if (s.equalsIgnoreCase(target)) return true;
            }
            return false;
        } catch (Throwable t) {
            return false;
        }
    }
}
