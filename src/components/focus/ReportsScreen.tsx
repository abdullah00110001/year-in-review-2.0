import { useState } from "react";
import { APP_USAGE, SCREEN_TIME_MINUTES, TIMELINE, fmt } from "@/lib/focus-data";
import { SectionTitle } from "./ui";

const RANGES = ["Daily", "Weekly", "Monthly"] as const;

export function ReportsScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("Daily");
  const mult = range === "Daily" ? 1 : range === "Weekly" ? 6.4 : 27;
  const apps = APP_USAGE.map((a) => ({ ...a, minutes: Math.round(a.minutes * mult) }));
  const max = Math.max(...apps.map((a) => a.minutes));
  const totalTimeline = TIMELINE.reduce((s, t) => s + t.minutes, 0);

  return (
    <div className="screen-enter space-y-7 pb-4">
      <section className="relative -mt-6 rounded-t-[2.5rem] bg-background px-5 pt-6">
        <div className="flex gap-1 rounded-full bg-card p-1.5 lift">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`tap flex-1 rounded-full py-2.5 text-sm font-bold ${
                r === range ? "text-white" : "text-muted-foreground"
              }`}
              style={r === range ? { background: "var(--gradient-flow)" } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Screen time" title={fmt(Math.round(SCREEN_TIME_MINUTES * mult))} />
        <div className="px-5">
          <div className="relative overflow-hidden rounded-[1.75rem] night-gradient p-5 lift">
            <div className="pointer-events-none absolute inset-0 dotgrid text-white/10" />
            <div className="relative space-y-4">
              {TIMELINE.map((t, i) => (
                <div key={t.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="flex w-16 shrink-0 flex-col text-[10px] font-bold uppercase tracking-widest text-sky">
                    {t.label}
                  </span>
                  <span className="relative h-2.5 min-w-0 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${(t.minutes / totalTimeline) * 100 * 2.2}%`,
                        background: "var(--gradient-flow)",
                        transition: `width .7s ${i * 90}ms cubic-bezier(.22,1,.36,1)`,
                      }}
                    />
                  </span>
                  <span className="shrink-0 text-xs font-black tabular-nums text-white">
                    {fmt(Math.round(t.minutes * mult))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stat badges */}
      <section className="grid grid-cols-2 gap-3 px-5">
        <Badge label="Blocked" value={`${Math.round(18 * mult)}`} tone="var(--coral)" />
        <Badge label="Clean streak" value="3d" tone="var(--cyan)" />
        <Badge label="Score" value="19" tone="var(--grape)" />
        <Badge label="Interrupts" value={`${Math.round(42 * mult)}`} tone="var(--primary)" />
      </section>

      {/* Bubble viz */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Distribution" title="App bubbles" />
        <div className="px-5">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-[1.75rem] bg-card p-5 lift">
            {apps.map((a) => {
              const size = 44 + (a.minutes / max) * 78;
              return (
                <div
                  key={a.pkg}
                  className="tap grid shrink-0 place-items-center rounded-full text-center"
                  style={{
                    width: size,
                    height: size,
                    background: `color-mix(in oklab, ${a.tone} 22%, white)`,
                    border: `2px solid ${a.tone}`,
                  }}
                >
                  <span className="px-1">
                    <span
                      className="block text-[10px] font-black leading-tight"
                      style={{ color: "var(--navy)" }}
                    >
                      {a.name}
                    </span>
                    <span className="block text-[9px] font-semibold text-muted-foreground">
                      {fmt(a.minutes)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gradient vertical bars */}
      <section className="space-y-3">
        <SectionTitle eyebrow="Top apps" title="By usage" />
        <div className="px-5">
          <div className="flex items-end gap-2 overflow-x-auto rounded-[1.75rem] bg-card p-5 lift [scrollbar-width:none]">
            {apps.map((a, i) => (
              <div key={a.pkg} className="flex w-12 shrink-0 flex-col items-center gap-2">
                <span className="text-[10px] font-black text-navy">{fmt(a.minutes)}</span>
                <span
                  className="w-full rounded-t-xl"
                  style={{
                    height: `${28 + (a.minutes / max) * 130}px`,
                    background: `linear-gradient(180deg, ${a.tone}, var(--primary))`,
                    transition: `height .6s ${i * 60}ms`,
                  }}
                />
                <span className="w-full truncate text-center text-[9px] font-semibold text-muted-foreground">
                  {a.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Badge({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-card p-4 lift">
      <span
        className="absolute -right-5 -top-5 h-16 w-16 rotate-45"
        style={{ background: tone, opacity: 0.18 }}
      />
      <p className="text-3xl font-black leading-none text-navy">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: tone }}>
        {label}
      </p>
    </div>
  );
}
