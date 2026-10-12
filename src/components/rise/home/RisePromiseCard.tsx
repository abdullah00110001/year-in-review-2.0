/**
 * RisePromiseCard — the Rise home "promise to yourself".
 * One composition: the Life OS mark (ring + rising arrow) holds the alarm time,
 * the intention reads as a sentence, and Commit is a press-and-hold that fills
 * the logo ring. Empty state invites placing the first sunrise.
 * Uses only semantic tokens so every theme stays correct.
 */
import { useEffect, useRef, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  time: string | null;          // "HH:mm"
  countdown: string | null;
  intention?: string | null;
  missionLabel?: string | null;
  onCreate: () => void;
  onCommit: () => void;
}

const HOLD_MS = 1200;
const R = 70;
const C = 2 * Math.PI * R;

function fmt(t: string) {
  const [h, m] = t.split(':').map(Number);
  return { hm: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ap: h >= 12 ? 'PM' : 'AM' };
}

export function RisePromiseCard({ time, countdown, intention, missionLabel, onCreate, onCommit }: Props) {
  const [hold, setHold] = useState(0);       // 0..1
  const [done, setDone] = useState(false);
  const raf = useRef<number>();
  const start = useRef(0);

  const stop = () => { if (raf.current) cancelAnimationFrame(raf.current); if (!done) setHold(0); };
  const begin = () => {
    if (done) return;
    start.current = performance.now();
    const tick = (n: number) => {
      const p = Math.min(1, (n - start.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) { setDone(true); navigator.vibrate?.(30); onCommit(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  useEffect(() => { if (done) { const t = setTimeout(() => { setDone(false); setHold(0); }, 2500); return () => clearTimeout(t); } }, [done]);

  const f = time ? fmt(time) : null;
  const fill = done ? 1 : hold;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
      {/* dawn wash rising from the bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-primary/15 via-primary/5 to-transparent" />

      <div className="relative px-6 pt-6 pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {f ? 'My promise for tomorrow' : 'No sunrise placed yet'}
        </p>

        {/* the mark */}
        <button
          type="button"
          onClick={f ? undefined : onCreate}
          className="relative mx-auto mt-4 block h-[180px] w-[180px] select-none"
          aria-label={f ? `Alarm at ${f.hm} ${f.ap}` : 'Set your first alarm'}
        >
          <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="90" cy="90" r={R} fill="none" className="stroke-muted" strokeWidth="8" />
            <circle
              cx="90" cy="90" r={R} fill="none" className="stroke-primary"
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - fill)}
              style={{ transition: hold === 0 ? 'stroke-dashoffset 300ms ease-out' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg viewBox="-12 -12 24 24" className={cn('h-6 w-6 mb-1', f ? 'text-primary' : 'text-muted-foreground animate-bounce')}>
              <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M-6 -1 L0 -7 L6 -1" /><path d="M0 -7 L0 6" /><path d="M0 6 L4.5 6" />
              </g>
            </svg>
            {f ? (
              <>
                <span className="text-4xl font-black tabular-nums leading-none text-foreground">{f.hm}</span>
                <span className="mt-1 text-xs font-bold text-muted-foreground">{f.ap}</span>
              </>
            ) : (
              <span className="flex items-center gap-1 text-sm font-bold text-primary"><Plus className="h-4 w-4" />Place it</span>
            )}
          </div>
        </button>

        {f && countdown && (
          <p className="mt-2 text-center text-xs text-muted-foreground">rings in <span className="font-semibold text-foreground tabular-nums">{countdown}</span></p>
        )}

        {/* the promise sentence */}
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-background/60 px-4 py-3">
          {f ? (
            <p className="text-sm leading-relaxed text-foreground">
              I'll rise at <b>{f.hm} {f.ap}</b>
              {intention ? <> for <b className="text-primary">{intention}</b></> : <> — <button onClick={onCreate} className="font-semibold text-primary underline-offset-2 hover:underline">add why</button></>}
              {missionLabel && <span className="text-muted-foreground"> and prove it with {missionLabel.toLowerCase()}</span>}.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              What will tomorrow's you thank you for? <button onClick={onCreate} className="font-semibold text-primary">Set tonight's intention</button>
            </p>
          )}
        </div>

        {/* hold to commit */}
        <button
          type="button"
          disabled={!f}
          onPointerDown={begin}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
          className="relative mt-4 h-14 w-full overflow-hidden rounded-full bg-secondary font-bold text-secondary-foreground select-none touch-none disabled:opacity-50"
        >
          <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${fill * 100}%` }} />
          <span className={cn('relative flex items-center justify-center gap-2', fill > 0.5 && 'text-primary-foreground')}>
            {done ? <><Check className="h-5 w-5" />Committed</> : f ? 'Hold to commit to tomorrow' : 'Set an alarm to commit'}
          </span>
        </button>
      </div>
    </section>
  );
}

export default RisePromiseCard;
