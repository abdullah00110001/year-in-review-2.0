import { useState } from "react";
import { Search, Plus, Users, Target, Globe, ChevronRight } from "lucide-react";
import { SectionTitle } from "./ui";

const GROUPS = [
  { name: "test", members: 1, progress: 88, goal: "Rise before 6am", tone: "var(--primary)" },
  { name: "Deep Work Club", members: 24, progress: 71, goal: "4h focus daily", tone: "var(--grape)" },
  { name: "No Reels Gang", members: 9, progress: 54, goal: "Zero short-form", tone: "var(--coral)" },
];

export function GroupsScreen({ onOpen }: { onOpen: (name: string) => void }) {
  const [q, setQ] = useState("");
  const list = GROUPS.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="screen-enter space-y-7 pb-4">
      <section className="sticky top-0 z-20 -mt-6 rounded-t-[2.5rem] bg-background px-5 pb-3 pt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div className="rounded-full p-[2px]" style={{ background: "var(--gradient-flow)" }}>
            <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3">
              <Search size={18} className="shrink-0 text-primary" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search groups..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <button
            className="tap grid h-12 w-12 shrink-0 place-items-center rounded-full text-white lift"
            style={{ background: "var(--gradient-flow)" }}
            aria-label="Create group"
          >
            <Plus size={22} />
          </button>
        </div>
      </section>

      <SectionTitle eyebrow="Accountability" title="My groups" />

      <section className="space-y-3 px-5">
        {list.map((g) => (
          <button
            key={g.name}
            onClick={() => onOpen(g.name)}
            className="tap relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-[1.5rem] bg-card py-4 pl-5 pr-4 text-left lift"
          >
            <span className="absolute inset-y-3 left-0 w-1.5 rounded-r-full" style={{ background: g.tone }} />
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.1rem] text-white"
              style={{ background: g.tone }}
            >
              <Users size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black text-navy">{g.name}</span>
              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Target size={12} className="shrink-0" /> {g.goal}
              </span>
              <span
                className="mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-black text-white"
                style={{ background: "var(--gradient-flow)" }}
              >
                {g.progress}% ON TRACK · {g.members} member{g.members > 1 ? "s" : ""}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
        {list.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No groups match “{q}”.</p>
        )}
      </section>

      <SectionTitle eyebrow="Explore" title="Discover" />
      <section className="px-5">
        <div className="relative grid h-44 place-items-center overflow-hidden rounded-[1.75rem] flow-gradient lift">
          <div className="pointer-events-none absolute inset-0 dotgrid text-white/25" />
          <div className="relative flex flex-col items-center text-white">
            <Globe size={30} />
            <p className="mt-2 text-sm font-black uppercase tracking-[0.2em]">Public groups soon</p>
            <p className="text-xs text-white/75">We're curating communities for you</p>
          </div>
        </div>
      </section>
    </div>
  );
}
