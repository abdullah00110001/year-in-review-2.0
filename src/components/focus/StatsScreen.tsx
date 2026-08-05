import { WEEKLY_TREND } from "@/lib/focus-data";
import { Ring, SectionTitle } from "./ui";
import { Clock, TrendingUp, Flame } from "lucide-react";

export function StatsScreen() {
  const max = 100;
  const pts = WEEKLY_TREND.map((d, i) => {
    const x = (i / (WEEKLY_TREND.length - 1)) * 300;
    const y = 120 - (d.score / max) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="screen-enter space-y-7 pb-4">
      <section className="relative -mt-6 rounded-t-[2.5rem] bg-background px-5 pt-8">
        <div className="relative overflow-hidden rounded-[2rem] night-gradient p-6 text-center lift">
          <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-grape/40 blur-3xl" />
          <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-cyan">
            Discipline score
          </p>
          <div className="mt-4 flex justify-center">
            <Ring value={50} size={172} stroke={16} label="50" sub="Average" dark />
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-white">
            <Flame size={16} className="text-coral" />
            <span className="text-sm font-bold">3 day streak</span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {[...Array(7)].map((_, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-full"
                style={{ background: i < 3 ? "var(--gradient-flow)" : "rgba(255,255,255,.15)" }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Balance" title="Focus vs saved" />
        <div className="px-5">
          <div className="rounded-[1.75rem] bg-card p-5 lift">
            <Compare icon={Clock} label="Total focus time" value="2h 40m" pct={62} tone="var(--primary)" />
            <div className="mt-5" />
            <Compare icon={TrendingUp} label="Time saved" value="1h 35m" pct={38} tone="var(--cyan)" />
          </div>
        </div>
      </section>

      {/* Weekly trend */}
      <section className="space-y-3">
        <SectionTitle eyebrow="7 days" title="Weekly trend" />
        <div className="px-5">
          <div className="overflow-hidden rounded-[1.75rem] bg-card p-5 lift">
            <svg viewBox="0 0 300 140" className="w-full">
              <defs>
                <linearGradient id="fillTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--grape)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="lineTrend" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="50%" stopColor="var(--grape)" />
                  <stop offset="100%" stopColor="var(--cyan)" />
                </linearGradient>
              </defs>
              <polygon points={`0,140 ${pts} 300,140`} fill="url(#fillTrend)" />
              <polyline
                points={pts}
                fill="none"
                stroke="url(#lineTrend)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {WEEKLY_TREND.map((d, i) => {
                const x = (i / (WEEKLY_TREND.length - 1)) * 300;
                const y = 120 - (d.score / max) * 100;
                return <circle key={d.day} cx={x} cy={y} r="4" fill="white" stroke="var(--primary)" strokeWidth="3" />;
              })}
            </svg>
            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {WEEKLY_TREND.map((d) => (
                <span key={d.day}>{d.day}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Compare({
  icon: Icon,
  label,
  value,
  pct,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  pct: number;
  tone: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: tone }}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 text-lg font-black text-navy">{value}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone}, var(--grape))` }}
        />
      </div>
    </div>
  );
}
