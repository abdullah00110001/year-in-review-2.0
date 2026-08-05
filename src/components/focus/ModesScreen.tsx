import { useState } from "react";
import { Brain, Moon, Lock, TriangleAlert } from "lucide-react";
import { Ring, SectionTitle } from "./ui";

export function ModesScreen() {
  const [focus, setFocus] = useState(false);
  const [sleep, setSleep] = useState(true);
  const [strict, setStrict] = useState(false);

  const score = 30 + (focus ? 25 : 0) + (sleep ? 20 : 0) + (strict ? 25 : 0);

  return (
    <div className="screen-enter space-y-7 pb-4">
      <section className="relative -mt-6 rounded-t-[2.5rem] bg-background px-5 pt-8">
        <div className="relative overflow-hidden rounded-[2rem] night-gradient p-6 lift">
          <div className="pointer-events-none absolute -left-10 -bottom-12 h-44 w-44 rounded-full bg-primary/30 blur-3xl" />
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5">
            <Ring value={score} label={`${score}`} sub="Discipline" dark />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan">
                Quick modes
              </p>
              <p className="mt-1 text-lg font-black leading-tight text-white">
                Your shield is {strict ? "locked" : sleep || focus ? "guarding" : "resting"}
              </p>
              <p className="mt-2 text-xs text-sky">
                {100 - score > 0
                  ? `${100 - score} points to Absolute Mode`
                  : "Absolute Mode unlocked"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionTitle eyebrow="Toggle" title="Modes" />

      <section className="space-y-5 px-5">
        <ModeBlock
          icon={Brain}
          tone="var(--primary)"
          title="Focus Mode"
          desc="Customized blocking enabled"
          active={focus}
          onToggle={() => !strict && setFocus((v) => !v)}
          offset={0}
        >
          <div className="mt-4 flex gap-1.5">
            {[...Array(14)].map((_, i) => (
              <span
                key={i}
                className="h-8 w-1 rounded-full"
                style={{
                  background: focus ? "var(--gradient-flow)" : "var(--border)",
                  height: `${12 + ((i * 7) % 22)}px`,
                  opacity: focus ? 1 : 0.6,
                  transition: `all .4s ${i * 30}ms`,
                }}
              />
            ))}
          </div>
        </ModeBlock>

        <ModeBlock
          icon={Moon}
          tone="var(--grape)"
          title="Sleep Mode"
          desc="Custom block list active"
          active={sleep}
          onToggle={() => !strict && setSleep((v) => !v)}
          offset={16}
        />

        <div
          className={`relative overflow-hidden rounded-[1.75rem] p-5 lift ${
            strict ? "bg-coral text-white" : "bg-card"
          }`}
        >
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-[1.1rem] ${
                strict ? "bg-white/20 text-white" : "bg-coral/12 text-coral"
              }`}
            >
              <Lock size={20} />
            </span>
            <span className="min-w-0">
              <span
                className={`block truncate text-lg font-black ${strict ? "text-white" : "text-navy"}`}
              >
                Strict Mode
              </span>
              <span
                className={`block truncate text-xs ${strict ? "text-white/80" : "text-muted-foreground"}`}
              >
                Irreversible until tomorrow
              </span>
            </span>
            <Switch on={strict} onClick={() => setStrict((v) => !v)} tone="var(--coral)" />
          </div>
          <div
            className={`mt-4 flex items-start gap-2 rounded-2xl px-3 py-2 text-xs font-medium ${
              strict ? "bg-white/15 text-white" : "bg-coral/10 text-coral"
            }`}
          >
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <p>When enabled, you cannot disable Shield or change modes until tomorrow.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ModeBlock({
  icon: Icon,
  tone,
  title,
  desc,
  active,
  onToggle,
  offset,
  children,
}: {
  icon: typeof Brain;
  tone: string;
  title: string;
  desc: string;
  active: boolean;
  onToggle: () => void;
  offset: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] bg-card p-5 lift"
      style={{ marginRight: offset }}
    >
      <span
        className="absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-15"
        style={{ background: tone }}
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.1rem] text-white"
          style={{ background: active ? tone : "var(--muted)", color: active ? "#fff" : "var(--muted-foreground)" }}
        >
          <Icon size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-black text-navy">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{desc}</span>
        </span>
        <Switch on={active} onClick={onToggle} tone={tone} />
      </div>
      {children}
      <span
        className="mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{
          background: active ? `color-mix(in oklab, ${tone} 15%, transparent)` : "var(--muted)",
          color: active ? tone : "var(--muted-foreground)",
        }}
      >
        {active ? "Active" : "Off"}
      </span>
    </div>
  );
}

function Switch({ on, onClick, tone }: { on: boolean; onClick: () => void; tone: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className="tap relative h-8 w-14 shrink-0 rounded-full transition-colors"
      style={{ background: on ? tone : "var(--border)" }}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all"
        style={{ left: on ? 30 : 4 }}
      />
    </button>
  );
}
