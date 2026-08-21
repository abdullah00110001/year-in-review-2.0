/**
 * NightToRiseGuard — global full-screen overlay shown whenever the Night-to-Rise
 * lock window is active. Mounted once at the App root.
 *
 * FIX: this used to compute `phase`/`endTime` purely in JS from localStorage
 * (useNightToRise -> computeNightWindows, reading local_alarms), completely
 * decoupled from the native decider that actually drives the block screen
 * shown over OTHER apps (NightToRiseManager/Decider, fed from a different
 * alarm source — RiseAlarmStore via riseAlarmMs()). That meant this overlay
 * could show "Rest now" purely because its own clock math thought it was
 * sleep time, while the native side — the only thing that can actually block
 * a third-party app — disagreed (or vice versa: native could be enforcing
 * with zero visible indication in-app).
 *
 * Now this polls nightToRiseBridge.getStatus() (real native truth) as the
 * primary source of phase/endTimeMs. The old local computation is kept ONLY
 * as a fallback for web/iOS (where there is no native enforcement to ask) or
 * if the native call fails for some reason — so behavior never gets worse
 * than before, but on Android with the plugin available, this overlay now
 * can never show a lock state that native enforcement isn't also applying.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, Smartphone, ShieldOff, Flame, Sparkles, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNightToRise } from './useNightToRise';
import { useNightToRiseStreak } from './useNightToRiseStreak';
import { nightToRiseBridge, type NativeLockStatus } from '@/lib/capacitor/nightToRiseBridge';
import { STRICT_UNLOCK_DELAY_MS } from './types';
import { cn } from '@/lib/utils';

function readNextAlarmTime(): string | null {
  try {
    const raw = localStorage.getItem('local_alarms');
    if (!raw) return null;
    const list = JSON.parse(raw) as Array<{ enabled?: boolean; time?: string }>;
    const found = list.find((a) => a.enabled && a.time);
    return found?.time ?? null;
  } catch { return null; }
}

/** Native phase ('SLEEP_LOCK') -> the local phase strings this component already uses ('sleep-lock'). */
function mapNativePhase(p: NativeLockStatus['phase']): 'off' | 'armed' | 'sleep-lock' | 'rise-lock' | 'paused' | 'inactive-day' {
  switch (p) {
    case 'SLEEP_LOCK': return 'sleep-lock';
    case 'RISE_LOCK': return 'rise-lock';
    case 'PAUSED': return 'paused';
    case 'INACTIVE_DAY': return 'inactive-day';
    case 'ARMED': return 'armed';
    default: return 'off';
  }
}

const EXEMPT_ROUTES = ['/rise/ring', '/auth', '/reset-password'];
const STRICT_REQUEST_KEY = 'night_to_rise_strict_request_at';
/** How often to re-check real native enforcement state. */
const STATUS_POLL_MS = 3000;

export function NightToRiseGuard() {
  const { pathname } = useLocation();
  const [alarmTime, setAlarmTime] = useState<string | null>(readNextAlarmTime);
  const { config, status: localStatus } = useNightToRise(alarmTime);
  const { streak, recordBreak, recordCleanNight } = useNightToRiseStreak();
  const [now, setNow] = useState(new Date());
  const [overridden, setOverridden] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [strictRequestedAt, setStrictRequestedAt] = useState<number | null>(() => {
    const raw = localStorage.getItem(STRICT_REQUEST_KEY);
    const n = raw ? Number(raw) : 0;
    return n > 0 ? n : null;
  });

  // ---- NEW: real native status, polled ----
  const [nativeStatus, setNativeStatus] = useState<NativeLockStatus | null>(null);
  const [nativeStatusTried, setNativeStatusTried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await nightToRiseBridge.getStatus();
        if (!cancelled) {
          setNativeStatus(s);
          setNativeStatusTried(true);
        }
      } catch {
        if (!cancelled) setNativeStatusTried(true);
      }
    };
    void poll();
    const t = setInterval(poll, STATUS_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'local_alarms') setAlarmTime(readNextAlarmTime());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Pick up breaks that happened on the NATIVE block screen.
  useEffect(() => {
    const checkPendingBreak = async () => {
      const broke = await nightToRiseBridge.consumePendingBreak();
      if (broke) recordBreak();
    };
    void checkPendingBreak();

    const onVisibility = () => {
      if (!document.hidden) void checkPendingBreak();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [recordBreak]);

  const isExempt = EXEMPT_ROUTES.some((r) => pathname.startsWith(r));

  // ---- FIX: prefer native truth over the local JS computation ----
  // If we have a native status reading (Android, plugin call succeeded),
  // use it. Otherwise (web/iOS, or the native call hasn't resolved / failed)
  // fall back to the old local computation so nothing regresses there.
  const useNative = nativeStatus !== null;
  const phase = useNative ? mapNativePhase(nativeStatus!.phase) : localStatus.phase;

  const isLocked = (phase === 'sleep-lock' || phase === 'rise-lock') && !isExempt && !overridden;

  // When phase transitions off after a lock, record a clean night.
  useEffect(() => {
    if (phase === 'armed' || phase === 'off' || phase === 'inactive-day') {
      if (alarmTime) recordCleanNight();
    }
  }, [phase, alarmTime, recordCleanNight]);

  // Reset override + strict request when the window ends.
  useEffect(() => {
    if (!isLocked) {
      setOverridden(false);
      setShowPin(false);
      setPinInput('');
      setStrictRequestedAt(null);
      try { localStorage.removeItem(STRICT_REQUEST_KEY); } catch { /* noop */ }
    }
  }, [isLocked]);

  const message = phase === 'sleep-lock' ? config.sleepBlockMessage : config.riseBlockMessage;

  // ---- FIX: endTime comes straight from native when available, instead of
  // being independently recomputed here (which was the other half of the
  // desync — this component used to guess the sleep window's end from
  // sleepTime + a hardcoded 30 min, ignoring the user's actual configured
  // sleepLockMinutesBefore/riseLockMinutesAfter that native uses). ----
  const endTime = useMemo(() => {
    if (useNative && nativeStatus!.endTimeMs > 0) {
      return new Date(nativeStatus!.endTimeMs);
    }
    // Fallback: old local estimate (web/iOS or native status unavailable).
    if (phase === 'sleep-lock') {
      const [h, m] = config.sleepTime.split(':').map(Number);
      const end = new Date();
      end.setHours(h, m + 30, 0, 0);
      if (end < now) end.setDate(end.getDate() + 1);
      return end;
    }
    if (phase === 'rise-lock' && alarmTime) {
      const [h, m] = alarmTime.split(':').map(Number);
      const end = new Date();
      end.setHours(h, m + config.riseLockMinutesAfter, 0, 0);
      if (end < now) end.setDate(end.getDate() + 1);
      return end;
    }
    return null;
  }, [useNative, nativeStatus, phase, alarmTime, config, now]);

  const remaining = endTime ? Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000)) : 0;
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const countdown = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${mm}:${String(ss).padStart(2, '0')}`;

  // ---- Strict mode: 10 minute delayed emergency unlock ----
  const strictWaitMs = strictRequestedAt
    ? Math.max(0, strictRequestedAt + STRICT_UNLOCK_DELAY_MS - now.getTime())
    : STRICT_UNLOCK_DELAY_MS;
  const strictReady = strictRequestedAt !== null && strictWaitMs === 0;
  const strictWaitLabel = `${Math.floor(strictWaitMs / 60000)}:${String(Math.floor((strictWaitMs % 60000) / 1000)).padStart(2, '0')}`;

  const requestStrictUnlock = useCallback(() => {
    const ts = Date.now();
    setStrictRequestedAt(ts);
    try { localStorage.setItem(STRICT_REQUEST_KEY, String(ts)); } catch { /* noop */ }
  }, []);

  const canOverrideNow = !config.strictMode || strictReady;

  const handleEmergencyUnlock = () => {
    if (!canOverrideNow) return;
    let storedPin: string | null = null;
    try { storedPin = localStorage.getItem('app_lock_pin'); } catch { /* noop */ }
    if (storedPin && pinInput !== storedPin) return;
    recordBreak();
    setOverridden(true);
    try { localStorage.removeItem(STRICT_REQUEST_KEY); } catch { /* noop */ }
  };

  // Don't flash a stale local-computed lock screen before the first native
  // status reply arrives on Android — wait one tick, then fall back if it
  // never arrives (e.g. web/iOS, where nativeStatusTried stays true but
  // nativeStatus stays null forever, which correctly routes to the local
  // fallback above).
  if (!nativeStatusTried) return null;
  if (!isLocked) return null;

  const dawn = phase === 'rise-lock';

  return (
    <div className="n2r fixed inset-0 z-[200] flex flex-col overflow-y-auto" data-phase={phase}>
      {dawn ? (
        <div
          className="n2r-dawn-glow pointer-events-none absolute -bottom-32 left-1/2 h-96 w-[130%] -translate-x-1/2 rounded-full bg-warning/30 blur-3xl"
        />
      ) : (
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[120%] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        />
      )}

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div
          className={cn(
            'mb-6 flex h-16 w-16 items-center justify-center rounded-3xl',
            dawn ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary',
          )}
        >
          <Lock className="h-7 w-7" />
        </div>

        <h1 className="n2r-display text-3xl leading-tight">{dawn ? 'Ease into the day' : 'Rest now'}</h1>
        <p className="mt-3 max-w-sm text-base text-muted-foreground">{message}</p>

        <div className="mt-8">
          <div className="text-overline">Ends in</div>
          <div className="n2r-mono mt-2 text-5xl font-bold">{countdown}</div>
        </div>

        {config.showStreakOnBlock && streak > 0 && (
          <div className="n2r-pill mt-6" data-tone="dawn">
            <Flame className="n2r-flame h-4 w-4" /> {streak} night{streak === 1 ? '' : 's'} protected
          </div>
        )}

        {config.allowedApps.length > 0 && (
          <div className="mt-8 w-full max-w-sm">
            <div className="mb-2 text-overline">Still available</div>
            <div className="flex flex-wrap justify-center gap-2">
              {config.allowedApps.map((a) => (
                <span key={a.id} className="n2r-pill">
                  <Smartphone className="h-3 w-3" /> {a.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative px-6 pb-9">
        {config.strictMode && !strictReady ? (
          strictRequestedAt === null ? (
            <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
              <div className="n2r-pill">
                <ShieldOff className="h-3 w-3" /> Strict mode is on
              </div>
              <button
                onClick={requestStrictUnlock}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Request emergency unlock (10 min wait)
              </button>
            </div>
          ) : (
            <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
              <div className="n2r-pill">
                <Hourglass className="h-3 w-3" /> Unlock available in{' '}
                <span className="n2r-mono font-semibold">{strictWaitLabel}</span>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Take the ten minutes. Most urges are gone by then.
              </p>
            </div>
          )
        ) : showPin ? (
          <div className="mx-auto max-w-xs space-y-2">
            <input
              type="password"
              inputMode="numeric"
              placeholder="Emergency PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="n2r-mono w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setShowPin(false); setPinInput(''); }}>Cancel</Button>
              <Button className="flex-1" onClick={handleEmergencyUnlock}>Unlock</Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Unlocking now starts your streak over. That's alright.
            </p>
          </div>
        ) : (
          <button
            onClick={() => setShowPin(true)}
            className="mx-auto block text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Emergency unlock
          </button>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Phone and emergency calls are always reachable.
        </p>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-overline opacity-60">
          <Sparkles className="h-3 w-3" /> Sleep to Rise
        </div>
      </div>
    </div>
  );
}
