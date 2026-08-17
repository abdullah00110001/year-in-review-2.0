# Sleep to Rise production completion

## Goal
Make Sleep to Rise a real Android enforcement flow—not a visual-only feature—while fixing alarm reliability, the white launch screen, wallpaper selection, app picking, and the requested UI defaults/naming.

## Implementation

### 1. Make blocked apps stay blocked
- Remove the current one-shot suppression that only opens the block screen once per package.
- On every blocked app foreground event, immediately leave the blocked app and open the native Sleep to Rise block activity.
- Re-check the previously blocked package when the block activity closes/resumes so returning through Recents or relaunching cannot bypass protection.
- Keep safety exemptions for Life OS, Phone, Dialer, Emergency, Clock, system UI, and the alarm ring screen.
- Keep the block activity stable without creating activity stacks or an intentional cooldown that disables enforcement.
- Apply the same repeat-safe behavior to ordinary Shield blocked apps where the same one-screen bypass exists.

### 2. Complete native Sleep to Rise enforcement
- Harden preference parsing and enforcement for both modes:
  - Blocklist: only selected installed apps are denied during Sleep/Rise windows.
  - Allowlist: every non-safety app is denied except selected allowed apps.
- Enforce Sleep Guard from the configured pre-sleep start through the active Rise alarm.
- Enforce Rise Guard from alarm trigger through the configured post-rise duration.
- Persist active alarm/window state across app restarts and device reboot.
- Keep strict mode’s 10-minute emergency wait persistent and sync emergency breaks back to streak logs.
- Record blocked attempts through the existing Sleep to Rise event/log path without adding a new schema.

### 3. Real installed-app picker
- Replace typed/custom fake package entries in Blocking with the native installed-app picker.
- Show real launcher icon, app name, and package name.
- Save exactly the package IDs returned by Android and never show dummy apps on Android.
- Put “Blocked Apps” directly in Setup alongside Sleep Guard and Rise Guard; selected apps can be removed and reselected.

### 4. Fix Rise alarm production path
- Make native scheduling report failure instead of returning success when AlarmManager could not schedule.
- Persist complete recurring alarm shot data in native storage so BootReceiver can restore it with title, UUID, sound, loudness, and future weekday occurrence after reboot/package update.
- Reschedule recurring weekly alarms after each trigger rather than letting each weekday shot become one-time forever.
- Keep `setAlarmClock` as the primary path and `setExactAndAllowWhileIdle` as the verified fallback.
- Preserve ringing state until the mission/dismiss action; do not clear it just because the React ring screen mounted.

### 5. Remove the white alarm page
- Add a dedicated native alarm launch theme with the final dark/warm background and no white splash.
- Route full-screen alarm intents directly into the ring experience while the sound service starts independently.
- Keep the WebView loading surface opaque and visually matching the ring screen until React is ready.

### 6. Fix wallpaper selection and persistence
- Use the Android system photo picker on supported versions, with Capacitor gallery fallback where needed.
- Avoid requesting obsolete photo permissions when the system picker does not require them.
- Persist the compressed wallpaper with the alarm record and verify edit/save round trips retain it.
- Render the wallpaper immediately on the ring screen with loading, cancel, success, and failure states.

### 7. Requested UI behavior and naming
- Rename all user-visible “Night to Rise” / “Night-to-Rise” copy to “Sleep to Rise” without renaming internal APIs/storage keys that would break existing users.
- Make **Insights** the default tab.
- Setup order: **Sleep Guard**, **Rise Guard**, **Blocked Apps**, then schedule/protection.
- Preserve the existing app font, color theme, and the rest of Life OS unchanged.

## Verification
- Run focused TypeScript checks and Android unit/Gradle tests through the project harness.
- Verify the web UI at mobile width: Insights opens first, naming is correct, Setup picker flow works, wallpaper survives save/edit, and no unrelated screens change.
- Add native tests for midnight rollover, blocklist/allowlist decisions, safety exemptions, strict unlock timing, and recurring alarm next-occurrence calculations.
- Provide physical-device checks for: repeated blocked-app relaunch/Recents bypass, screen-off alarm, reboot restoration, sound ramp, and wallpaper ring screen.

## Native handoff
After pulling these changes, run `npm install`, `npm run build`, then `npx cap sync android`; test on a physical Android device with Accessibility, Exact Alarm, Notifications, and battery exemption enabled.
