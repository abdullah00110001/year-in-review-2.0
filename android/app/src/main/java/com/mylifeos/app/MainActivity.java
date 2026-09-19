package com.mylifeos.app;

import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.mylifeos.app.plugins.PureShieldPlugin;
import com.mylifeos.app.plugins.ShieldPlugin;
import com.mylifeos.app.plugins.RiseAlarmPlugin;
import com.mylifeos.app.plugins.BarcodeScannerPlugin;
import com.mylifeos.app.plugins.NativeRingtonePickerPlugin;
import com.mylifeos.app.rise.state.AlarmStateManager;

import com.mylifeos.app.plugins.AppUpdatePlugin;
import com.mylifeos.app.plugins.PhotoPickerPlugin;
public class MainActivity extends BridgeActivity {
  private static MainActivity instance;

  /**
   * NEW: true whenever MainActivity is actually visible/resumed. This is the
   * single source of truth AlarmRecoveryReceiver.forceRingScreenForeground()
   * now checks before doing anything — previously it unconditionally re-sent
   * a deep-link intent to MainActivity every ~6 seconds while an alarm rang,
   * even while MainActivity was already open and the user was mid-mission,
   * which remounted the React ring screen and wiped mission progress
   * (solvedCount etc.) every cycle. If the app is already visible, there is
   * nothing to "force to foreground" — skip entirely.
   */
  public static volatile boolean isForeground = false;

  // ──────────────────────────────────────────
  // Rise mission anti-escape watchdog
  // ──────────────────────────────────────────
  // FIX: This used to live in RiseRingActivity's onPause(), but that fired on
  // EVERY pause — including the pause RiseRingActivity itself caused by
  // handing off to MainActivity — so it kept resetting the in-progress
  // mission every ~5s (React ring screen remounted, solvedCount lost).
  //
  // onUserLeaveHint() is the correct signal here: Android calls it ONLY when
  // the user explicitly presses Home / Recents / a similar "leave the app"
  // gesture — never as a side effect of our own startActivity() calls. So
  // this can't be falsely triggered by internal navigation the way the old
  // onPause()-based check could.
  //
  // The re-bring intent below carries no deep-link data/extras, so
  // handleAlarmIntent() below is a no-op for it and the React router never
  // re-navigates — the existing WebView (and its in-progress mission state)
  // is just brought back to the front untouched.
  private final Handler reBringHandler = new Handler(Looper.getMainLooper());
  private Runnable reBringRunnable;
  private static final long RE_BRING_DELAY_MS = 3000;

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    if (!AlarmStateManager.isRinging(this)) return; // no mission in progress — let the user leave normally

    if (reBringRunnable != null) reBringHandler.removeCallbacks(reBringRunnable);
    reBringRunnable = () -> {
      if (!AlarmStateManager.isRinging(this)) return; // mission finished in the meantime — don't re-bring
      Log.d("MainActivity", "User tried to leave during an active Rise mission — re-bringing");
      try {
        Intent bring = new Intent(this, MainActivity.class);
        bring.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(bring);
      } catch (Throwable t) {
        Log.e("MainActivity", "re-bring failed", t);
      }
    };
    reBringHandler.postDelayed(reBringRunnable, RE_BRING_DELAY_MS);
  }

  private void cancelReBring() {
    if (reBringRunnable != null) {
      reBringHandler.removeCallbacks(reBringRunnable);
      reBringRunnable = null;
    }
  }

  /** True when this launch is an alarm ring launch (deep link or extra). */
  private static boolean isAlarmLaunch(Intent intent) {
    if (intent == null) return false;
    if (intent.getBooleanExtra("RISE_ALARM_RING", false)) return true;
    if (intent.hasExtra("ALARM_ID")) return true;
    Uri d = intent.getData();
    return d != null && d.toString().contains("/rise/ring/");
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 🌑 Remove the white alarm page: swap in the opaque dark/warm alarm theme
    // BEFORE the window is created so no white splash is ever drawn.
    boolean alarmLaunch = isAlarmLaunch(getIntent());
    if (alarmLaunch) {
      try { setTheme(R.style.AppTheme_AlarmLaunch); } catch (Throwable ignored) {}
    }
    // Register plugins defensively — one failure must not crash the whole app
    try { registerPlugin(ShieldPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "ShieldPlugin register failed", t); }
    try { registerPlugin(RiseAlarmPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "RiseAlarmPlugin register failed", t); }
    try { registerPlugin(PureShieldPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "PureShieldPlugin register failed", t); }
    try { registerPlugin(BarcodeScannerPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "BarcodeScannerPlugin register failed", t); }
    try { registerPlugin(NativeRingtonePickerPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "NativeRingtonePickerPlugin register failed", t); }
    try { registerPlugin(com.mylifeos.app.nighttorise.NightToRisePlugin.class); } catch (Throwable t) { Log.e("MainActivity", "NightToRisePlugin register failed", t); }
    try { registerPlugin(PhotoPickerPlugin.class); } catch (Throwable t) { Log.e("MainActivity", "PhotoPickerPlugin register failed", t); }
    try { registerPlugin(AppUpdatePlugin.class); } catch (Throwable t) { Log.e("MainActivity", "AppUpdatePlugin register failed", t); }
    super.onCreate(savedInstanceState);
    instance = this;
    // Make sure blocking enforcement + its status notification are running.
    try { com.mylifeos.app.shield.core.ForegroundGuardService.sync(this); }
    catch (Throwable t) { Log.e("MainActivity", "guard sync failed", t); }
    // 🔔 Create FCM wake-up notification channel before push payload arrives
    try { ensureWakeUpChannel(); } catch (Throwable t) { Log.e("MainActivity", "ensureWakeUpChannel failed", t); }
    // Keep the WebView loading surface opaque and matching the ring screen
    // until React paints, instead of the default white page background.
    if (alarmLaunch) {
      try {
        int bg = 0xFF120C10;
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(bg));
        if (getBridge() != null && getBridge().getWebView() != null) {
          getBridge().getWebView().setBackgroundColor(bg);
        }
      } catch (Throwable t) { Log.e("MainActivity", "alarm surface tint failed", t); }
    }
    // 🔥 Handle first launch intent
    try { handleAlarmIntent(getIntent()); } catch (Throwable t) { Log.e("MainActivity", "handleAlarmIntent failed", t); }
  }

  private void ensureWakeUpChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    // Delete legacy channel so we can recreate with alarm-grade sound + DND bypass.
    try { nm.deleteNotificationChannel("wakeup_channel"); } catch (Throwable ignored) {}
    NotificationChannel ch = new NotificationChannel(
      "wakeup_channel",
      "Wake-up calls",
      NotificationManager.IMPORTANCE_HIGH
    );
    ch.setDescription("Wake-up requests from your group — rings like an alarm");
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[]{0, 600, 300, 600, 300, 600});
    ch.enableLights(true);
    ch.setBypassDnd(true);
    ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
    AudioAttributes attrs = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();
    android.net.Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
    if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
    ch.setSound(alarmUri, attrs);
    ch.setShowBadge(true);
    nm.createNotificationChannel(ch);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent); // 👈 এইটাই Deep Link + সব হ্যান্ডেল করে
    setIntent(intent);
    handleAlarmIntent(intent);
  }

  private void handleAlarmIntent(Intent intent) {
    if (intent == null) return;
    // 🔥 Deep link case
    Uri data = intent.getData();
    if (data != null && "capacitor".equals(data.getScheme())) {
      enableLockScreenTakeover();
      Log.d("RiseAlarm", "Deep link received: " + data.toString());
      return;
    }
    // 🔥 Fallback (old system or extra)
    if (intent.hasExtra("ALARM_ID")) {
      enableLockScreenTakeover();
      String alarmId = intent.getStringExtra("ALARM_ID");
      if (alarmId == null) {
        alarmId = String.valueOf(intent.getIntExtra("ALARM_ID", -1));
      }
      // 🔥 Save for React fallback
      android.content.SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
      prefs.edit().putString("ringing_alarm_id", alarmId).apply();
      Log.d("RiseAlarm", "Alarm via extra ID: " + alarmId);
    }
    // NOTE: our own re-bring intent (see onUserLeaveHint above) has neither
    // a "capacitor" scheme nor an ALARM_ID extra, so it falls through here
    // as a no-op — no navigation, no React state reset.
  }

  private void enableLockScreenTakeover() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
      KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
      if (km != null) {
        km.requestDismissKeyguard(this, null);
      }
    } else {
      getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      );
    }
  }

  public static void disableLockScreenTakeover() {
    if (instance != null) {
      instance.runOnUiThread(() -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          instance.setShowWhenLocked(false);
          instance.setTurnScreenOn(false);
        }
        instance.getWindow().clearFlags(
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
      });
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    isForeground = true; // NEW
    // Mission finished (or user genuinely came back) — no need to re-bring anymore.
    cancelReBring();
  }

  @Override
  public void onPause() {
    super.onPause();
    isForeground = false; // NEW
  }

  @Override
  public void onDestroy() {
    isForeground = false; // NEW
    cancelReBring();
    super.onDestroy();
  }
}
