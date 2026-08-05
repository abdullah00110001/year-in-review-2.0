import { useState } from "react";
import { Megaphone, Users, CalendarDays, BarChart3, UserPlus, MessageCircle } from "lucide-react";
import { MEMBERS } from "@/lib/focus-data";

const TABS = [
  { key: "home", label: "Home", icon: Users },
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "rankings", label: "Rankings", icon: BarChart3 },
  { key: "invite", label: "Invite", icon: UserPlus },
  { key: "chat", label: "Chat", icon: MessageCircle },
] as const;

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "var(--cyan)",
  SLEEPING: "var(--grape)",
  IDLE: "var(--coral)",
};

export function GroupDetailScreen({ name }: { name: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("home");
  const active = MEMBERS.filter((m) => m.status === "ACTIVE").length;

  return (
    <div className="screen-enter space-y-6 pb-4">
      <section className="relative -mt-6 rounded-t-[2.5rem] bg-background px-5 pt-7">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.3rem] text-white lift"
            style={{ background: "var(--gradient-flow)" }}
          >
            <Users size={24} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-3xl font-black tracking-tight text-navy">{name}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {active} active · {MEMBERS.length} members
            </span>
          </span>
        </div>

        <button className="tap mt-5 flex w-full items-center gap-3 rounded-[1.5rem] night-gradient px-5 py-4 text-left lift">
          <Megaphone size={20} className="shrink-0 text-cyan" />
          <span className="min-w-0">
            <span className="block text-sm font-black text-white">Group discussion</span>
            <span className="block truncate text-xs text-sky">Tap to open today's thread</span>
          </span>
        </button>
      </section>

      <section className="px-5">
        <div className="flex flex-wrap gap-3">
          {MEMBERS.map((m, i) => (
            <div
              key={m.name}
              className="relative flex w-[calc(50%-6px)] flex-col items-center overflow-hidden rounded-[1.5rem] bg-card p-4 text-center lift"
              style={{ marginTop: i % 2 ? 16 : 0 }}
            >
              <span
                className="absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-15"
                style={{ background: STATUS_TONE[m.status] }}
              />
              <span
                className="grid h-14 w-14 place-items-center rounded-full text-lg font-black text-white"
                style={{ background: "var(--gradient-flow)" }}
              >
                {m.initial}
              </span>
              <p className="mt-2 text-sm font-black text-navy">{m.name}</p>
              <p className="text-[11px] text-muted-foreground">{m.note}</p>
              <span
                className="mt-2 rounded-full px-2.5 py-1 text-[9px] font-black tracking-[0.16em] text-white"
                style={{ background: STATUS_TONE[m.status] }}
              >
                {m.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5">
        <div className="flex gap-1 rounded-full bg-card p-1.5 lift">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tap flex flex-1 flex-col items-center gap-1 rounded-full py-2 text-[9px] font-bold uppercase tracking-wider ${
                tab === t.key ? "text-white" : "text-muted-foreground"
              }`}
              style={tab === t.key ? { background: "var(--gradient-flow)" } : undefined}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "home" && (
          <div className="relative mt-4 grid h-40 place-items-center overflow-hidden rounded-[1.5rem] border-2 border-dashed border-primary/30 bg-primary/5">
            <div className="pointer-events-none absolute inset-0 dotgrid text-primary/20" />
            <p className="relative text-sm font-bold text-primary">
              {TABS.find((t) => t.key === tab)?.label} coming to this group
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
