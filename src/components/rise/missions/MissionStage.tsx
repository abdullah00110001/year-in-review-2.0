/**
 * MissionStage — the animated "stage" at the top of every wake-up challenge
 * setup page. Each mission gets its own living illustration that loops a tiny
 * demo of what the real challenge feels like (counter ticks, scan sweeps,
 * a caret typing…). Everything sits on a dawn wash rising from the bottom —
 * the same "rise" visual world as the Rise home Promise card.
 * Semantic tokens only, so every theme renders correctly.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { cn } from '@/lib/utils';

export type MissionKind = 'math' | 'shake' | 'steps' | 'qr' | 'photo' | 'typing';

interface Props {
  kind: MissionKind;
  /** Big number the demo counts up to (shakes, steps…). */
  target?: number;
  headline: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Loops 0 → target, used by the illustrations' demo counters. */
function useDemoCounter(target: number, ms = 2600) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const step = Math.max(1, Math.round(target / 24));
    const tick = Math.max(40, ms / Math.max(1, target / step));
    const id = window.setInterval(() => setN((v) => (v + step > target ? 0 : v + step)), tick);
    return () => clearInterval(id);
  }, [target, ms]);
  return n;
}

function Ring({ p }: { p: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" className="stroke-muted" strokeWidth="5" />
      <circle cx="60" cy="60" r={r} fill="none" className="stroke-primary" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 120ms linear' }} />
    </svg>
  );
}

function ShakeArt({ target }: { target: number }) {
  const n = useDemoCounter(target);
  return (
    <div className="relative h-36 w-36">
      <Ring p={n / target} />
      <motion.div className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: [-14, 14, -14], x: [-4, 4, -4] }} transition={{ duration: 0.35, repeat: Infinity }}>
        <div className="h-16 w-10 rounded-xl border-[3px] border-primary bg-card flex items-end justify-center pb-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        </div>
      </motion.div>
      {[-1, 1].map((s) => (
        <motion.span key={s} className="absolute top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-primary/50"
          style={{ left: s < 0 ? 18 : undefined, right: s > 0 ? 18 : undefined }}
          animate={{ opacity: [0.2, 1, 0.2], scaleY: [0.6, 1, 0.6] }} transition={{ duration: 0.35, repeat: Infinity, delay: s > 0 ? 0.17 : 0 }} />
      ))}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-black tabular-nums text-primary-foreground">{n}/{target}</span>
    </div>
  );
}

function StepsArt({ target }: { target: number }) {
  const n = useDemoCounter(target, 3200);
  return (
    <div className="relative h-44 w-full max-w-[260px]">
      <svg viewBox="0 0 260 120" className="absolute inset-0 h-full w-full">
        <path d="M10 110 Q130 -20 250 110" fill="none" className="stroke-muted" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      </svg>
      {Array.from({ length: 7 }, (_, i) => {
        const t = (i + 0.5) / 7;
        const x = 10 + 240 * t;
        const y = (1 - t) * (1 - t) * 110 + 2 * (1 - t) * t * -20 + t * t * 110;
        const lit = n / target >= t;
        return (
          <motion.span key={i} className={cn('absolute h-4 w-2.5 rounded-full transition-colors', lit ? 'bg-primary' : 'bg-muted-foreground/25')}
            style={{ left: `${(x / 260) * 100}%`, top: `${(y / 120) * 100}%`, rotate: `${(t - 0.5) * 80}deg`, translateY: i % 2 ? 6 : -6 }}
            animate={lit ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.4 }} />
        );
      })}
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="text-3xl font-black tabular-nums text-foreground">{n}</span>
        <span className="text-sm font-bold text-muted-foreground"> / {target} steps</span>
      </div>
    </div>
  );
}

function QrArt() {
  return (
    <div className="relative h-36 w-36 rounded-3xl border-2 border-dashed border-primary/40 p-4">
      <div className="grid h-full w-full grid-cols-5 grid-rows-5 gap-1">
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={cn('rounded-sm', [0, 1, 3, 4, 5, 9, 12, 15, 19, 20, 21, 23, 24, 7, 17].includes(i) ? 'bg-foreground/80' : 'bg-muted')} />
        ))}
      </div>
      <motion.span className="absolute inset-x-2 h-0.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
        animate={{ top: ['12%', '88%', '12%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  );
}

function PhotoArt() {
  return (
    <div className="relative h-36 w-28">
      {['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl',
        'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-xl', 'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-xl'].map((c) => (
        <motion.span key={c} className={cn('absolute h-7 w-7 border-primary', c)}
          animate={{ scale: [1, 0.86, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
      ))}
      <motion.div className="absolute inset-3 rounded-lg bg-primary/10"
        animate={{ opacity: [0, 0, 1, 0] }} transition={{ duration: 1.8, repeat: Infinity, times: [0, 0.6, 0.65, 1] }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="-12 -12 24 24" className="h-8 w-8 text-primary">
          <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M-6 -1 L0 -7 L6 -1" /><path d="M0 -7 L0 6" /><path d="M0 6 L4.5 6" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function TypingArt({ phrase }: { phrase: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v >= phrase.length + 8 ? 0 : v + 1)), 90);
    return () => clearInterval(id);
  }, [phrase]);
  const shown = phrase.slice(0, Math.min(i, phrase.length));
  return (
    <div className="w-full border-l-2 border-primary pl-4">
    <p className="min-h-[3.5rem] break-words text-left text-2xl font-black leading-relaxed text-foreground">
      <span>{shown}</span>
      <span className="text-muted-foreground/40">{phrase.slice(shown.length)}</span>
      <motion.span className="ml-0.5 inline-block h-6 w-0.5 translate-y-1 bg-primary" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
    </p>
    <div aria-hidden="true" className="mt-5 flex justify-start gap-1.5">{'RISE'.split('').map((key) => <span key={key} className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-xs font-bold text-muted-foreground">{key}</span>)}</div>
    </div>
  );
}

function MathArt({ children }: { children?: ReactNode }) {
  return <div className="flex flex-col items-center">{children}</div>;
}

export function MissionStage({ kind, target = 30, headline, sub, children, className }: Props) {
  return (
    <MotionConfig reducedMotion="user">
    <section data-mission-stage={kind} className={cn('relative w-full shrink-0 overflow-hidden px-3 pb-6 pt-6', className)}>
      <div className="relative flex flex-col items-center">
        <div className="flex min-h-[9rem] w-full items-center justify-center">
          {kind === 'shake' && <ShakeArt target={target} />}
          {kind === 'steps' && <StepsArt target={target} />}
          {kind === 'qr' && <QrArt />}
          {kind === 'photo' && <PhotoArt />}
          {kind === 'typing' && <TypingArt phrase={typeof headline === 'string' ? headline : 'I am awake'} />}
          {kind === 'math' && <MathArt>{children}</MathArt>}
        </div>
        {kind !== 'typing' && <h3 className="mt-4 text-center text-xl font-black text-foreground">{headline}</h3>}
        {sub && <p className="mt-1 text-center text-sm text-muted-foreground">{sub}</p>}
        {kind !== 'math' && children}
      </div>
    </section>
    </MotionConfig>
  );
}

export default MissionStage;
