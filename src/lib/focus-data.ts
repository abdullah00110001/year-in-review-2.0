export type AppUsage = {
  name: string;
  pkg: string;
  minutes: number;
  tone: string;
};

export const SCREEN_TIME_MINUTES = 324; // 5h 24m

export const APP_USAGE: AppUsage[] = [
  { name: "YouTube", pkg: "com.google.android.youtube", minutes: 123, tone: "var(--coral)" },
  { name: "Telegram", pkg: "org.telegram.messenger", minutes: 94, tone: "var(--primary)" },
  { name: "Claude", pkg: "com.anthropic.claude", minutes: 32, tone: "var(--grape)" },
  { name: "Alarmy", pkg: "com.alarmy.app", minutes: 17, tone: "var(--cyan)" },
  { name: "Messenger", pkg: "com.facebook.orca", minutes: 14, tone: "var(--sky)" },
  { name: "Chrome", pkg: "com.android.chrome", minutes: 13, tone: "var(--primary)" },
  { name: "WhatsApp", pkg: "com.whatsapp", minutes: 12, tone: "var(--cyan)" },
  { name: "DeepSeek", pkg: "com.deepseek.chat", minutes: 11, tone: "var(--grape)" },
];

export const WEEKLY_TREND = [
  { day: "Mon", score: 42 },
  { day: "Tue", score: 55 },
  { day: "Wed", score: 38 },
  { day: "Thu", score: 61 },
  { day: "Fri", score: 47 },
  { day: "Sat", score: 68 },
  { day: "Sun", score: 50 },
];

export const TIMELINE = [
  { label: "Morning", minutes: 62 },
  { label: "Midday", minutes: 88 },
  { label: "Afternoon", minutes: 104 },
  { label: "Evening", minutes: 70 },
];

export const PROFILES = [
  { name: "Deep Work", apps: 12, tone: "var(--primary)" },
  { name: "Study", apps: 8, tone: "var(--grape)" },
  { name: "Night", apps: 15, tone: "var(--navy)" },
];

export const MEMBERS = [
  { name: "You", initial: "M", status: "SLEEPING", note: "Not risen yet" },
  { name: "Ayan", initial: "A", status: "ACTIVE", note: "Focus 42m" },
  { name: "Nabila", initial: "N", status: "ACTIVE", note: "Focus 18m" },
  { name: "Rehan", initial: "R", status: "IDLE", note: "Break until 4pm" },
];

export function fmt(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
