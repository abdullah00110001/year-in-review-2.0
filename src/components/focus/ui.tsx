import { Shield, Bell, ChevronLeft } from "lucide-react";

export function Ring({
  value,
  size = 132,
  stroke = 12,
  label,
  sub,
  dark = false,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  sub?: string;
  dark?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="55%" stopColor="var(--grape)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={dark ? "rgba(255,255,255,.14)" : "var(--border)"}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#ring-${label.replace(/\W/g, "")})`}
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(value, 100)) / 100}
          style={{ transition: "stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-black tracking-tight"
          style={{ color: dark ? "#fff" : "var(--navy)" }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: dark ? "rgba(255,255,255,.6)" : "var(--muted-foreground)" }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
            {eyebrow}
          </p>
        )}
        <h2 className="truncate text-2xl font-black tracking-tight text-navy">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack?: (() => void) | undefined;
}) {
  return (
    <header className="relative overflow-hidden night-gradient px-5 pb-10 pt-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-grape/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-cyan/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 dotgrid text-white/10" />
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <button
          onClick={onBack}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-2xl glass-dark text-white"
          aria-label={onBack ? "Back" : "Shield"}
        >
          {onBack ? <ChevronLeft size={20} /> : <Shield size={20} />}
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black uppercase tracking-[0.14em] text-white">
            {title}
          </h1>
          <p className="truncate text-xs font-medium text-sky">{subtitle}</p>
        </div>
        <button
          className="tap relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl glass-dark text-white"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-coral" />
        </button>
      </div>
    </header>
  );
}
