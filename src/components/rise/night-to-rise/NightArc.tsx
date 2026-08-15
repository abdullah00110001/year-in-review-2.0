/**
 * NightArc — the signature visualization for Sleep to Rise.
 *
 * A thin gradient arc spans the whole night: moon (target sleep time) on the
 * left, sun (rise alarm) on the right. A glowing dot marks the current time
 * and travels along the arc in real time. Below it, two small pills describe
 * what happens next ("Sleep in 2h 10m" / "Rise Guard active — 18m left").
 */

import { useEffect, useMemo, useState } from 'react';
import { computeNightWindows, describeStatus, formatClock, parseHM } from './timeMath';

interface NightArcProps {
  /** "HH:MM" target sleep time. */
  sleepTime: string;
  /** "HH:MM" rise alarm time, or null when none is set. */
  riseTime: string | null;
  /** Minutes the lock starts before the target sleep time. */
  lockBeforeMin: number;
  /** Minutes the lock stays on after the alarm. */
  lockAfterMin: number;
  phase: string;
}

const W = 320;
const H = 132;
const ARC_Y = 116;
const ARC_TOP = 26;

/** Point on the quadratic arc for t in [0,1]. */
function arcPoint(t: number) {
  const p0 = { x: 24, y: ARC_Y };
  const p1 = { x: W / 2, y: ARC_TOP - 44 };
  const p2 = { x: W - 24, y: ARC_Y };
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function NightArc({ sleepTime, riseTime, lockBeforeMin, lockAfterMin, phase }: NightArcProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  // Section 0.2 — all timing comes from the one shared, midnight-safe model.
  const windows = useMemo(
    () => computeNightWindows({ sleepTime, riseTime, lockBeforeMin, lockAfterMin, now }),
    [sleepTime, riseTime, lockBeforeMin, lockAfterMin, now],
  );

  const inWindowNow = windows.inNight;
  const t = inWindowNow ? windows.nightProgress : 0;
  const dot = useMemo(() => arcPoint(t), [t]);

  const { primary, secondary } = useMemo(() => describeStatus(windows, phase), [windows, phase]);

  const dawn = phase === 'rise-lock';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={primary}>
        <defs>
          <linearGradient id="n2r-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.5" />
            <stop offset="45%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--warning))" />
          </linearGradient>
          <radialGradient id="n2r-dot">
            <stop offset="0%" stopColor="hsl(var(--foreground))" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </radialGradient>
        </defs>

        <path
          d={`M 24 ${ARC_Y} Q ${W / 2} ${ARC_TOP - 44} ${W - 24} ${ARC_Y}`}
          fill="none"
          stroke="url(#n2r-arc)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Moon — start of the night */}
        <circle cx="24" cy={ARC_Y} r="9" fill="hsl(var(--card))" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
        <path d="M 27 112 a 5 5 0 1 1 -5 -5 a 4 4 0 0 0 5 5 z" fill="hsl(var(--muted-foreground))" />

        {/* Sun — end of the night */}
        <circle cx={W - 24} cy={ARC_Y} r="9" fill="hsl(var(--card))" stroke="hsl(var(--warning))" strokeWidth="1.5" />
        <circle cx={W - 24} cy={ARC_Y} r="4" fill="hsl(var(--warning))" />

        {/* Current time marker */}
        {inWindowNow && (
          <g style={{ transition: 'transform 1.5s ease' }}>
            <circle cx={dot.x} cy={dot.y} r="14" fill="url(#n2r-dot)" opacity="0.45" />
            <circle cx={dot.x} cy={dot.y} r="4.5" fill={dawn ? 'hsl(var(--warning))' : 'hsl(var(--foreground))'} />
          </g>
        )}
      </svg>

      <div className="mt-1 flex items-center justify-between px-1">
        <span className="n2r-mono text-[11px] n2r-muted">{formatClock(parseHM(sleepTime))}</span>
        <span className="n2r-mono text-[11px] n2r-muted">{riseTime ? formatClock(parseHM(riseTime)) : 'No alarm'}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="n2r-pill" data-tone={dawn ? 'dawn' : undefined}>{primary}</span>
        <span className="n2r-pill">{secondary}</span>
      </div>
    </div>
  );
}

export default NightArc;
