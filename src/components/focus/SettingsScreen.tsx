import { useState } from "react";
import {
  Bell,
  ShieldCheck,
  Moon,
  Fingerprint,
  Palette,
  CircleHelp,
  ChevronDown,
} from "lucide-react";
import { SectionTitle } from "./ui";

type Item = { label: string; desc: string; icon: typeof Bell; key: string; tone: string };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Protection",
    items: [
      { key: "shield", label: "Shield always on", desc: "Keep blocking active in background", icon: ShieldCheck, tone: "var(--primary)" },
      { key: "uninstall", label: "Uninstall lock", desc: "Require PIN to remove app", icon: Fingerprint, tone: "var(--coral)" },
    ],
  },
  {
    title: "Experience",
    items: [
      { key: "alerts", label: "Nudges & alerts", desc: "Gentle reminders when you drift", icon: Bell, tone: "var(--grape)" },
      { key: "night", label: "Night dimming", desc: "Soften the UI after sunset", icon: Moon, tone: "var(--navy)" },
      { key: "motion", label: "Gradient motion", desc: "Animated backgrounds", icon: Palette, tone: "var(--cyan)" },
    ],
  },
];

export function SettingsScreen() {
  const [on, setOn] = useState<Record<string, boolean>>({
    shield: true,
    uninstall: false,
    alerts: true,
    night: false,
    motion: true,
  });
  const [open, setOpen] = useState<string | null>("Protection");

  return (
    <div className="screen-enter space-y-6 pb-4">
      <section className="relative -mt-6 rounded-t-[2.5rem] bg-background px-5 pt-8">
        <div className="relative overflow-hidden rounded-[2rem] flow-gradient p-6 lift">
          <div className="pointer-events-none absolute -right-8 -bottom-10 h-36 w-36 rounded-full bg-white/15" />
          <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/75">Account</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-white">Settings</h2>
          <p className="mt-2 text-xs text-white/80">Tune Focus Shield to your rhythm</p>
        </div>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-3">
          <button
            onClick={() => setOpen(open === s.title ? null : s.title)}
            className="tap flex w-full items-center justify-between px-5"
          >
            <SectionTitle eyebrow="Section" title={s.title} />
            <ChevronDown
              size={20}
              className={`shrink-0 text-primary transition-transform ${open === s.title ? "rotate-180" : ""}`}
            />
          </button>
          {open === s.title && (
            <div className="space-y-3 px-5">
              {s.items.map((it, i) => (
                <div
                  key={it.key}
                  className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-[1.5rem] bg-card p-4 lift"
                  style={{ marginLeft: i % 2 ? 12 : 0 }}
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-[1rem] text-white"
                    style={{ background: it.tone }}
                  >
                    <it.icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-navy">{it.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.desc}</span>
                  </span>
                  <button
                    role="switch"
                    aria-checked={!!on[it.key]}
                    aria-label={it.label}
                    onClick={() => setOn((p) => ({ ...p, [it.key]: !p[it.key] }))}
                    className="tap relative h-8 w-14 shrink-0 rounded-full transition-colors"
                    style={{ background: on[it.key] ? it.tone : "var(--border)" }}
                  >
                    <span
                      className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all"
                      style={{ left: on[it.key] ? 30 : 4 }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="px-5">
        <div className="flex items-center gap-3 rounded-[1.5rem] night-gradient p-5 lift">
          <CircleHelp size={20} className="shrink-0 text-cyan" />
          <div className="min-w-0">
            <p className="text-sm font-black text-white">Help & support</p>
            <p className="truncate text-xs text-sky">Focus Shield · LifeOS v2.0</p>
          </div>
        </div>
      </section>
    </div>
  );
}
