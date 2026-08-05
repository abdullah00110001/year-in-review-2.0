import { useState } from "react";
import { LayoutGrid, Zap, FileText, BarChart3, Users, Settings } from "lucide-react";
import { TopBar } from "@/components/focus/ui";
import { HomeScreen } from "@/components/focus/HomeScreen";
import { ModesScreen } from "@/components/focus/ModesScreen";
import { ReportsScreen } from "@/components/focus/ReportsScreen";
import { StatsScreen } from "@/components/focus/StatsScreen";
import { GroupsScreen } from "@/components/focus/GroupsScreen";
import { GroupDetailScreen } from "@/components/focus/GroupDetailScreen";
import { SettingsScreen } from "@/components/focus/SettingsScreen";

const TABS = [
  { key: "home", label: "Home", icon: LayoutGrid },
  { key: "modes", label: "Modes", icon: Zap },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "groups", label: "Groups", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function FocusShieldApp() {
  const [tab, setTab] = useState<TabKey>("home");
  const [group, setGroup] = useState<string | null>(null);

  const title = group ?? "Focus Shield";
  const subtitle = group ? "Accountability group" : "Digital Wellbeing";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <TopBar
        title={title}
        subtitle={subtitle}
        onBack={group ? () => setGroup(null) : undefined}
      />

      <main className="flex-1 pb-32">
        {group ? (
          <GroupDetailScreen key={group} name={group} />
        ) : (
          <div key={tab}>
            {tab === "home" && <HomeScreen />}
            {tab === "modes" && <ModesScreen />}
            {tab === "reports" && <ReportsScreen />}
            {tab === "stats" && <StatsScreen />}
            {tab === "groups" && <GroupsScreen onOpen={(n) => setGroup(n)} />}
            {tab === "settings" && <SettingsScreen />}
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-4">
        <div className="rounded-full p-[2px]" style={{ background: "var(--gradient-flow)" }}>
          <div className="flex items-stretch justify-between rounded-full bg-navy px-2 py-2">
            {TABS.map((t) => {
              const active = !group && tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setGroup(null);
                    setTab(t.key);
                  }}
                  className="tap relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-full py-1.5"
                  aria-label={t.label}
                  aria-current={active}
                >
                  <t.icon
                    size={19}
                    className="transition-transform duration-300"
                    style={{
                      color: active ? "var(--cyan)" : "rgba(255,255,255,.55)",
                      transform: active ? "translateY(-2px) scale(1.12)" : "none",
                      filter: active ? "drop-shadow(0 0 8px var(--cyan))" : "none",
                    }}
                  />
                  <span
                    className="text-[8.5px] font-bold uppercase tracking-wide"
                    style={{ color: active ? "#fff" : "rgba(255,255,255,.5)" }}
                  >
                    {t.label}
                  </span>
                  <span
                    className="h-[3px] rounded-full transition-all duration-300"
                    style={{
                      width: active ? 18 : 0,
                      background: "var(--gradient-flow)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
