/**
 * CardArtworkPicker — choose the picture shown on the native Sleep / Rise
 * block card. Keys must match KEYS in NightToRiseSleepScenes.java /
 * NightToRiseRiseScenes.java. Previews are simple gradients of each scene.
 */
import { cn } from '@/lib/utils';

type Option = { key: string; name: string; preview: string };

const SLEEP: Option[] = [
  { key: 'default', name: 'Moon cottage', preview: 'linear-gradient(180deg,#0B1030,#2A2F6B 60%,#3A3F7A)' },
  { key: 'lake', name: 'Still lake', preview: 'linear-gradient(180deg,#0A1226,#14224A 55%,#4F6BFF)' },
  { key: 'cabin', name: 'Warm cabin', preview: 'linear-gradient(180deg,#0B1520,#17293B 60%,#F59E3B)' },
  { key: 'harbor', name: 'Harbor', preview: 'linear-gradient(180deg,#0A1422,#12233F 60%,#5FB0C9)' },
];
const RISE: Option[] = [
  { key: 'default', name: 'Sunrise hills', preview: 'linear-gradient(180deg,#23123F,#D1506A 60%,#FFC47D)' },
  { key: 'meadow', name: 'Meadow', preview: 'linear-gradient(180deg,#7DB9D8,#FFE7B8 60%,#2F7A4A)' },
  { key: 'peaks', name: 'Golden peaks', preview: 'linear-gradient(180deg,#2B1B4A,#F29A4A 60%,#3D1B3F)' },
];

export function CardArtworkPicker({
  kind, value, disabled, onChange,
}: { kind: 'sleep' | 'rise'; value?: string; disabled?: boolean; onChange: (key: string) => void }) {
  const opts = kind === 'sleep' ? SLEEP : RISE;
  const current = opts.some((o) => o.key === value) ? value : 'default';
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Block card picture</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {opts.map((o) => {
          const active = o.key === current;
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(o.key)}
              className={cn(
                'overflow-hidden rounded-lg border text-left transition disabled:opacity-50',
                active ? 'border-primary ring-2 ring-primary' : 'border-border',
              )}
            >
              <div className="h-14 w-full" style={{ background: o.preview }} />
              <p className="truncate px-2 py-1 text-xs">{o.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
