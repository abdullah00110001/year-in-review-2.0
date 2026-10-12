import { useEffect, useRef, useState } from 'react';
import { Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isNative } from '@/lib/capacitor/platform';

/** Steps needed for a step mission: rounds × per-difficulty steps. */
export function requiredStepsFor(count = 3, difficulty: string = 'medium') {
  const per = difficulty === 'hard' ? 40 : difficulty === 'easy' ? 10 : 20;
  return Math.max(1, count) * per;
}

interface Props {
  onComplete: () => void;
  requiredSteps: number;
}

/**
 * Walk-to-dismiss. Counts steps from the phone's motion sensor (no native
 * plugin needed): a step is a rise of total acceleration above the walking
 * threshold followed by a drop back, at a human walking rhythm. Fast shaking
 * (faster than ~4 steps/second) is ignored so the user really has to walk.
 */
export function StepMission({ onComplete, requiredSteps }: Props) {
  const [steps, setSteps] = useState(0);
  const [sensorOk, setSensorOk] = useState<boolean | null>(null);
  const done = useRef(false);
  const stepsRef = useRef(0);

  const addStep = () => {
    if (done.current) return;
    stepsRef.current += 1;
    setSteps(stepsRef.current);
    try { navigator.vibrate?.(15); } catch { /* noop */ }
    if (stepsRef.current >= requiredSteps) {
      done.current = true;
      setTimeout(onComplete, 500);
    }
  };

  useEffect(() => {
    let smooth = 9.8;
    let above = false;
    let lastStep = 0;
    let gotEvent = false;

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      gotEvent = true;
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      smooth = smooth * 0.8 + mag * 0.2;
      const now = Date.now();
      if (!above && smooth > 11.2) {
        above = true;
      } else if (above && smooth < 9.6) {
        above = false;
        const gap = now - lastStep;
        if (gap > 280 && gap < 2500) addStep();
        else if (gap >= 2500) lastStep = now; // first step after a pause only primes
        lastStep = now;
      }
    };

    const start = async () => {
      const DM: any = (window as any).DeviceMotionEvent;
      try {
        if (DM?.requestPermission) {
          const r = await DM.requestPermission();
          if (r !== 'granted') { setSensorOk(false); return; }
        }
      } catch { /* noop */ }
      window.addEventListener('devicemotion', onMotion);
      setTimeout(() => setSensorOk(gotEvent), 2500);
    };
    void start();
    return () => window.removeEventListener('devicemotion', onMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = Math.min(100, (steps / requiredSteps) * 100);
  const r = 90;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex min-h-full shrink-0 flex-col bg-background p-6 text-foreground">
      <div className="mt-4 flex items-center gap-3">
        <div className="rounded-2xl bg-primary/20 p-3">
          <Footprints className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Step Mission</h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div>
          <h3 className="mb-2 text-3xl font-black tracking-wide">GET UP & WALK</h3>
          <p className="text-foreground/50">Hold your phone and walk {requiredSteps} steps.</p>
        </div>

        <div className="relative h-56 w-56">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={r} stroke="currentColor" strokeWidth="12" fill="none" className="text-foreground/10" />
            <circle
              cx="100" cy="100" r={r} stroke="currentColor" strokeWidth="12" fill="none" strokeLinecap="round"
              className="text-primary transition-all duration-200"
              strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-black tabular-nums">{steps}</span>
            <span className="text-sm text-foreground/50">/ {requiredSteps} steps</span>
          </div>
        </div>

        {sensorOk === false && (
          <p className="max-w-xs break-words text-sm text-primary">
            Motion sensor not responding. Keep the app open and walk — or use the button below if your phone has no sensor.
          </p>
        )}
      </div>

      {(!isNative || sensorOk === false) && (
        <Button variant="outline" className="h-12 border-border/20 bg-muted/5 text-foreground" onClick={addStep}>
          Count a step manually
        </Button>
      )}
    </div>
  );
}
