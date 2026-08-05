import { useEffect, useState } from "react";
import { Play, Plus, Ban, Globe, Type, Clapperboard, ChevronRight, Zap } from "lucide-react";
import { APP_USAGE, PROFILES, SCREEN_TIME_MINUTES, fmt } from "@/lib/focus-data";
import { Ring, SectionTitle } from "./ui";

const DURATIONS = [5, 15, 30, 60];

export function HomeScreen() {
  const [selected, setSelected] = useState(15);
  const [remaining, setRemaining] = useState<number | null>(null);
  const total = selected * 60;

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      setRemaining(null);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const pct = remaining === null ? 0 : ((total - remaining) / total) * 100;
  const clock =
    remaining === null
      ? `${selected} min`
      : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  const quick = [
    { icon: Ban, label: "Apps Blocked", value: 4, tone: "var(--coral)" },
    { icon: Globe, label: "Sites Blocked", value: 12, tone: "var(--primary)" },
    { icon: Type, label: "Keywords", value: 7, tone: "var(--grape)" },
    { icon: Clapperboard, label: "Reels & Shorts", value: "ON", tone: "var(--cyan)" },
  ];

  return (
    <div className="screen-enter space-y-8 pb-4">
      {/* Hero */}
      <section className="relative -mt-6 overflow-hidden rounded-t-[2.5rem] bg-background px-5 pt-8">
        <div className="relative overflow-hidden rounded-[2rem] flow-gradient p-6 lift">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rotate-12 rounded-[2rem] border border-white/30" />
          <div className="pointer-events-none absolute -bottom-14 left-10 h-32 w-32 rounded-full bg-white/15" />
          <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/75">
            Welcome back
          </p>
          <h2 className="mt-1 text-4xl font-black leading-[1.05] tracking-tight text-white">
            Good
            <br />
            Afternoon
          </h2>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                Today's screen time
              </p>
              <p className="text-2xl font-black text-white">{fmt(SCREEN_TIME_MINUTES)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              Shield Active
            </span>
          </div>
        </div>
      </section>

      {/* Take a break — skewed */}
      <section className="px-5">
        <div className="relative -skew-y-2 overflow-hidden rounded-[2rem] night-gradient p-6 lift">
          <div className="pointer-events-none absolute inset-0 dotgrid text-white/10" />
          <div className="skew-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-cyan">
              Take a break
            </p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-white">
              Pause the shield
            </h3>
            <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5">
              <button
                onClick={() => setRemaining(remaining === null ? total : null)}
                className="tap relative grid h-[124px] w-[124px] shrink-0 place-items-center rounded-full"
                style={{ background: "var(--gradient-flow)" }}
              >
                <span className="absolute inset-[6px] rounded-full bg-navy" />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(var(--cyan) ${pct * 3.6}deg, transparent 0deg)`,
                    mask: "radial-gradient(circle, transparent 54px, black 55px)",
                    WebkitMask: "radial-gradient(circle, transparent 54px, black 55px)",
                  }}
                />
                <span className="relative flex flex-col items-center text-white">
                  <Play size={18} fill="currentColor" />
                  <span className="mt-1 text-sm font-black tabular-nums">{clock}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky">
                    {remaining === null ? "Start break" : "Tap to stop"}
                  </span>
                </span>
              </button>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setSelected(d);
                      setRemaining(null);
                    }}
                    className={`tap rounded-2xl px-3 py-3 text-sm font-bold ${
                      selected === d
                        ? "bg-white text-navy"
                        : "glass-dark text-white/80"
                    }`}
                  >
                    {d === 60 ? "1 hr" : `${d} min`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Profiles */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Presets" title="Profiles" />
        <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {PROFILES.map((p) => (
            <button
              key={p.name}
              className="tap relative w-40 shrink-0 snap-start overflow-hidden rounded-[1.75rem] bg-card p-4 text-left lift"
            >
              <span
                className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20"
                style={{ background: p.tone }}
              />
              <span
                className="grid h-10 w-10 place-items-center rounded-2xl text-white"
                style={{ background: p.tone }}
              >
                <Zap size={18} />
              </span>
              <p className="mt-3 text-base font-black text-navy">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.apps} apps blocked</p>
            </button>
          ))}
          <button className="tap grid w-40 shrink-0 snap-start place-items-center rounded-[1.75rem] border-2 border-dashed border-primary/40 bg-primary/5 text-primary">
            <span className="flex flex-col items-center gap-1">
              <Plus size={22} />
              <span className="text-xs font-bold uppercase tracking-widest">New</span>
            </span>
          </button>
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Control" title="Quick actions" />
        <div className="space-y-3 px-5">
          {quick.map((q, i) => (
            <button
              key={q.label}
              className="tap grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[1.5rem] bg-card p-4 text-left lift"
              style={{ marginLeft: i % 2 ? 14 : 0 }}
            >
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.1rem] text-white"
                style={{ background: q.tone }}
              >
                <q.icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-black leading-none text-navy">{q.value}</span>
                <span className="block truncate text-xs font-medium text-muted-foreground">
                  {q.label}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>

      {/* Top apps preview */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Today" title="Most used" />
        <div className="space-y-2 px-5">
          {APP_USAGE.slice(0, 4).map((a) => (
            <div key={a.pkg} className="rounded-2xl bg-card p-3 lift">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <p className="truncate text-sm font-bold text-navy">{a.name}</p>
                <p className="text-sm font-black text-primary">{fmt(a.minutes)}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(a.minutes / (APP_USAGE[0]?.minutes ?? 1)) * 100}%`,
                    background: "var(--gradient-flow)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
