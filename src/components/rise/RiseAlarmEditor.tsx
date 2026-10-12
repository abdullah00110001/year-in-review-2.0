import { useState, useEffect, useRef } from 'react';

/**
 * formatCountdown — "Xd Yh Zm" / "Yh Zm" / "Zm". Same helper as in Rise.tsx;
 * duplicated locally (rather than a shared import) to keep this patch
 * self-contained and low-risk. See Rise.tsx for the full rationale.
 */
function formatCountdown(diffMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
import { createPortal } from 'react-dom';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  X,
  Camera,
  Calculator,
  QrCode,
  Smartphone,
  Volume2,
  Vibrate,
  ChevronRight,
  Music,
  Bed,
  Tag,
  ImageIcon,
  Trash2,
  Zap,
  Bell,
  Clock,
  Type,
  Footprints,
 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  scheduleRecurringAlarm,
  cancelAlarmByUuid,
  requestAllAlarmPermissions,
  checkAllAlarmPermissions,
} from '@/lib/capacitor/nativeAlarm';
import { canScheduleExactAlarms, openExactAlarmSettings } from '@/lib/capacitor/riseAlarmBridge';
import { readLocalAlarms, writeLocalAlarms } from '@/lib/rise/localAlarms';
import { MissionConfigRouter } from '@/components/rise/missions/MissionConfigPages';
export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export interface MissionConfig {
  difficulty: MissionDifficulty;
  count: number;
  targetBarcode?: string;   // QR/Barcode — scan করে register করা barcode
  photoLocation?: string;   // Photo — location label
  photoDataUrl?: string;    // Photo — reference photo (base64)
  typingPhrase?: string;    // Typing — phrase to type
}

interface AlarmData {
  id?: string;
  alarm_time: string;
  days_of_week: number[];
  alarm_type: string;
  intention: string;
  label: string;
  verification_type: string;
  mission_config?: MissionConfig;
  snooze_limit: number;
  snooze_interval_minutes: number;
  sound_type: string;
  vibration_enabled: boolean;
  volume: number;
  gentle_wakeup_seconds: number;
  is_local?: boolean;
  is_enabled?: boolean;
  wallpaper_url?: string | null;
  extra_loud?: boolean;
  label_reminder?: boolean;
  time_reminder?: boolean;
  ringtone_url?: string | null;
  ringtone_name?: string | null;
  ringtone_id?: string | null;
}

interface RiseAlarmEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AlarmData) => void;
  initialData?: Partial<AlarmData>;
  isEditing?: boolean;
}

const DEFAULT_MISSION_CONFIG: MissionConfig = { difficulty: 'medium', count: 3 };

const DEFAULT_ALARM: AlarmData = {
  alarm_time: '06:00',
  days_of_week: [1, 2, 3, 4, 5],
  alarm_type: 'personal',
  intention: '',
  label: '',
  verification_type: 'math',
  mission_config: DEFAULT_MISSION_CONFIG,
  snooze_limit: 3,
  snooze_interval_minutes: 5,
  sound_type: 'default',
  vibration_enabled: true,
  volume: 80,
  gentle_wakeup_seconds: 30,
  wallpaper_url: null,
  extra_loud: false,
  label_reminder: false,
  time_reminder: false,
  ringtone_url: null,
  ringtone_name: null,
  ringtone_id: null,
};

const MISSIONS = [
  { id: 'math',   name: 'Math',   icon: Calculator },
  { id: 'shake',  name: 'Shake',  icon: Smartphone },
  { id: 'qr',     name: 'QR/Bar', icon: QrCode },
  { id: 'photo',  name: 'Photo',  icon: Camera },
  { id: 'typing', name: 'Typing', icon: Type },
  { id: 'steps',  name: 'Steps',  icon: Footprints },
  { id: 'none',   name: 'None',   icon: X },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ✅ Fix 2: Image compression helpers
async function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas context failed')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressDataUrl(dataUrl: string, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context failed')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function RiseAlarmEditor({
  open,
  onClose,
  onSave,
  initialData,
  isEditing = false,
}: RiseAlarmEditorProps) {
  const [alarm, setAlarm]                   = useState<AlarmData>({ ...DEFAULT_ALARM, ...initialData });
  const [permissionsOk, setPermissionsOk]   = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRingtonePicker, setShowRingtonePicker] = useState(false);
  const [pendingMission, setPendingMission] = useState<string | null>(null);
  const [missionConfigOpen, setMissionConfigOpen]   = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [, forceTick] = useState(0);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [wallpaperLoading, setWallpaperLoading] = useState(false);
  const wallpaperBusyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open) {
      let restored: Partial<AlarmData> | null = null;
      try {
        const raw = sessionStorage.getItem('rise_alarm_editor_draft');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (!initialData?.id || parsed.id === initialData.id)) {
            restored = parsed;
          }
        }
      } catch {}
      const merged: AlarmData = { ...DEFAULT_ALARM, ...initialData, ...(restored ?? {}) };
      // ✅ Fix 3: global per-type config কে fallback হিসেবে রাখো,
      // alarm এর নিজের config থাকলে সেটাই use করো
      if (!merged.mission_config) {
        try {
          const cfgRaw = localStorage.getItem(`rise_mission_cfg_${merged.verification_type}`);
          if (cfgRaw) merged.mission_config = JSON.parse(cfgRaw);
        } catch {}
      }
      setAlarm(merged);
      checkAllAlarmPermissions().then((perms) =>
        setPermissionsOk(perms.notifications && perms.exactAlarm),
      );
    }
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    let sub: any;
    let mounted = true;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        sub = await App.addListener('appStateChange', ({ isActive }) => {
          if (!mounted) return;
          if (!isActive) {
            try { sessionStorage.setItem('rise_alarm_editor_draft', JSON.stringify(alarm)); } catch {}
          }
        });
      } catch {}
    })();
    return () => {
      mounted = false;
      try { sub?.remove?.(); } catch {}
    };
  }, [open, alarm]);

  useEffect(() => {
    if (!open) {
      setShowTimePicker(false);
      setMissionConfigOpen(false);
      try { sessionStorage.removeItem('rise_alarm_editor_draft'); } catch {}
    }
  }, [open]);

  const toggleDay = (day: number) => {
    setAlarm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const setQuickRepeat = (preset: 'daily' | 'weekdays' | 'weekends' | 'once') => {
    const map = {
      daily:    [0, 1, 2, 3, 4, 5, 6],
      weekdays: [1, 2, 3, 4, 5],
      weekends: [0, 6],
      once:     [],
    };
    setAlarm((p) => ({ ...p, days_of_week: map[preset] }));
  };

  const isDaily    = alarm.days_of_week.length === 7;
  const isWeekdays = alarm.days_of_week.length === 5 && [1,2,3,4,5].every((d) => alarm.days_of_week.includes(d));
  const isWeekends = alarm.days_of_week.length === 2 && [0,6].every((d) => alarm.days_of_week.includes(d));

  const getTimeUntil = () => {
    if (!alarm.alarm_time || !alarm.alarm_time.includes(':')) return '';
    const parts = alarm.alarm_time.split(':').map(Number);
    if (parts.some(isNaN)) return '';
    const [h, m] = parts;
    const now    = new Date();
    const selectedDays = alarm.days_of_week;
    let nextDate: Date | null = null;

    if (selectedDays.length === 0) {
      // Once — আজ বা কাল
      const candidate = new Date();
      candidate.setHours(h, m, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      nextDate = candidate;
    } else {
      // ✅ আগামী ৭ দিনের মধ্যে selected day তে কবে পড়ে
      for (let i = 0; i <= 7; i++) {
        const candidate = new Date();
        candidate.setDate(now.getDate() + i);
        candidate.setHours(h, m, 0, 0);
        if (selectedDays.includes(candidate.getDay()) && candidate > now) {
          nextDate = candidate;
          break;
        }
      }
    }

    if (!nextDate) return '';
    const diff = nextDate.getTime() - now.getTime();
    // FIX: same multi-day-gap bug as Rise.tsx's countdown — hrs/mins with no
    // days component overflowed to things like "Rings in 60h 12m" for a
    // weekday-only alarm checked on a Friday night. formatCountdown() below
    // breaks it into days/hours/minutes properly.
    return `Rings in ${formatCountdown(diff)}`;
  };

  const formatDisplayTime = () => {
    if (!alarm.alarm_time || !alarm.alarm_time.includes(':')) return '06:00 AM';
    const parts = alarm.alarm_time.split(':').map(Number);
    if (parts.some(isNaN)) return '06:00 AM';
    const [h, m] = parts;
    const ampm   = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  // Section 0.4 — wallpaper picker.
  // Previously: every failure silently re-triggered a hidden <input type=file>,
  // so the user had to tap several times and got zero feedback. Now there is a
  // single guarded entry point, an explicit permission request, a loading state
  // and a toast on every outcome.
  const applyWallpaperFile = async (file: File) => {
    setWallpaperLoading(true);
    try {
      const compressed = await compressImage(file, 800, 0.7);
      setAlarm((p) => ({ ...p, wallpaper_url: compressed }));
      toast.success('Wallpaper updated');
    } catch {
      toast.error('Could not read that image. Try another one.');
    } finally {
      setWallpaperLoading(false);
    }
  };

  const handleWallpaperSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) { setWallpaperLoading(false); return; }
    await applyWallpaperFile(file);
  };

  const openWebFilePicker = () => {
    setWallpaperLoading(true);
    // If the user dismisses the chooser there is no event, so clear the
    // spinner on the next window focus.
    const clear = () => { setWallpaperLoading(false); window.removeEventListener('focus', clear); };
    window.addEventListener('focus', clear, { once: true });
    wallpaperInputRef.current?.click();
  };

  const pickWallpaper = async () => {
    if (wallpaperBusyRef.current) return; // guard against duplicate taps
    wallpaperBusyRef.current = true;
    try {
      const { isNative } = await import('@/lib/capacitor/platform');
      if (!isNative) { openWebFilePicker(); return; }

      // 1) Android system photo picker — needs NO permission, so it works even
      //    when media access is denied. This is what made wallpaper picking
      //    fail before: we asked for READ_MEDIA_IMAGES and gave up on denial.
      const { pickImageWithSystemPicker } = await import('@/lib/capacitor/nativePhotoPicker');
      const picked = await pickImageWithSystemPicker();
      if (picked.status === 'cancelled') return;
      if (picked.status === 'picked') {
        setWallpaperLoading(true);
        const compressed = await compressDataUrl(picked.dataUrl, 800, 0.7);
        setAlarm((p) => ({ ...p, wallpaper_url: compressed }));
        toast.success('Wallpaper updated');
        return;
      }
      if (picked.status === 'error') {
        console.warn('[Wallpaper] system picker error, falling back', picked.message);
      }

      // 2) Fallback: Capacitor Camera (older devices / picker unavailable).
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

      // Gallery access needs an explicit grant on Android 13+; without this the
      // first taps used to fail silently.
      try {
        const status = await Camera.checkPermissions();
        if (status.photos !== 'granted' && status.photos !== 'limited') {
          const req = await Camera.requestPermissions({ permissions: ['photos'] });
          if (req.photos !== 'granted' && req.photos !== 'limited') {
            toast.error('Photo access is needed to pick a wallpaper. Enable it in app settings.');
            return;
          }
        }
      } catch {
        /* older platforms without a photos permission model — continue */
      }

      setWallpaperLoading(true);
      const photo = await Camera.getPhoto({
        source:       CameraSource.Photos,
        resultType:   CameraResultType.DataUrl,
        quality:      60,
        allowEditing: false,
        width:        800,
      });

      const dataUrl = photo.dataUrl;
      if (!dataUrl || dataUrl.length < 100) {
        toast.error('That image could not be loaded. Try another one.');
        return;
      }
      const compressed = await compressDataUrl(dataUrl, 800, 0.7);
      setAlarm((p) => ({ ...p, wallpaper_url: compressed }));
      toast.success('Wallpaper updated');
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/cancel/i.test(msg)) return;      // user backed out — stay quiet
      console.error('[Wallpaper] pick failed', err);
      toast.error('Could not open the gallery. Please try again.');
    } finally {
      setWallpaperLoading(false);
      wallpaperBusyRef.current = false;
    }
  };

  const handleWallpaperRemove = () => {
    setAlarm((p) => ({ ...p, wallpaper_url: null }));
  };

  const handleSave = async () => {
    if (isSaving) return; // ✅ double-tap block
    setIsSaving(true);
    try {
    if (alarm.days_of_week.length === 0) {
      toast.info('One-time alarm scheduled for the next occurrence.');
    }
    // Section 0.1 — must be awaited: previously this fired-and-forgot, so the
    // schedule call ran before the grant and silently did nothing.
    if (!permissionsOk) {
      await requestAllAlarmPermissions();
      const exact = await canScheduleExactAlarms();
      if (!exact) {
        toast.error('Allow "Alarms & reminders" so this alarm can fire exactly on time.');
        await openExactAlarmSettings();
        return;
      }
    }

    const alarmId = alarm.id || crypto.randomUUID();
    if (isEditing && alarm.id) await cancelAlarmByUuid(alarm.id);

    const days = alarm.days_of_week.length === 0 ? [0,1,2,3,4,5,6] : alarm.days_of_week;

    const scheduled = await scheduleRecurringAlarm(alarmId, alarm.alarm_time, days, {
      title:      alarm.label || 'Rise Alarm',
      body:       alarm.intention || 'Time to wake up!',
      missionType: alarm.verification_type as any,
      extraLoud:  alarm.extra_loud ?? false,
      snoozeMinutes: alarm.snooze_interval_minutes,
      alarmDbId:  undefined,
      soundUri:   alarm.ringtone_url ?? null,
    });

    // Section 0.1 — the bridge swallows native errors and returns false; the UI
    // used to ignore that and report success anyway.
    if (!scheduled) {
      toast.error('The alarm could not be scheduled on the device. Check alarm permissions.');
      return;
    }

    const localAlarms  = [...readLocalAlarms()];
    const updatedAlarm = { ...alarm, id: alarmId, is_local: true, is_enabled: true };

    if (isEditing) {
      const index = localAlarms.findIndex((a: AlarmData) => a.id === alarm.id);
      if (index >= 0) localAlarms[index] = updatedAlarm;
      else localAlarms.push(updatedAlarm);
    } else {
      localAlarms.push(updatedAlarm);
    }

    writeLocalAlarms(localAlarms);
    window.dispatchEvent(new Event('localAlarmsUpdated'));

    toast.success(isEditing ? 'Alarm updated ✓' : 'Alarm set ✓');
    onSave({ ...alarm, id: alarmId, is_local: true });
    onClose();
    } catch (e) {
      console.error('Save failed', e);
      toast.error('Could not save alarm. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent
          side="bottom"
          data-rise-editor-host
          onEscapeKeyDown={(e) => { if (missionConfigOpen || showTimePicker || showRingtonePicker) { e.preventDefault(); setMissionConfigOpen(false); setShowTimePicker(false); setShowRingtonePicker(false); } }}
          className="h-[100dvh] max-h-[100dvh] w-full p-0 border-0 rounded-none flex flex-col gap-0 [&>button]:hidden data-[state=open]:animate-none transform-none bg-background text-foreground sm:max-w-md sm:mx-auto sm:rounded-t-3xl sm:h-[95vh] sm:max-h-[95vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 pt-[max(env(safe-area-inset-top),0.75rem)] bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-10 w-10">
              <X className="h-5 w-5" />
            </Button>
            <SheetTitle className="text-base font-bold">{isEditing ? 'Edit Alarm' : 'New Alarm'}</SheetTitle>
            <div className="w-10" />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 py-4 space-y-4 w-full pb-6">

              {/* Time display */}
              <div className="text-center py-3">
                <Button variant="ghost" aria-label="Choose alarm time"
                  onClick={() => setShowTimePicker(true)}
                  className="h-auto px-2 text-5xl font-black tabular-nums text-foreground hover:text-primary transition-colors active:scale-95"
                >
                  {formatDisplayTime()}
                </Button>
                <p className="text-sm text-primary font-medium mt-1">{getTimeUntil()}</p>
              </div>

              {/* Repeat */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Repeat</Label>
                <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                  <PresetChip active={isDaily}    onClick={() => setQuickRepeat('daily')}>Daily</PresetChip>
                  <PresetChip active={isWeekdays} onClick={() => setQuickRepeat('weekdays')}>Weekdays</PresetChip>
                  <PresetChip active={isWeekends} onClick={() => setQuickRepeat('weekends')}>Weekends</PresetChip>
                  <PresetChip active={alarm.days_of_week.length === 0} onClick={() => setQuickRepeat('once')}>Once</PresetChip>
                </div>
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {DAY_LABELS.map((d, i) => {
                    const active = alarm.days_of_week.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        className={cn(
                          'aspect-square w-full rounded-full text-xs font-bold transition-all flex items-center justify-center',
                          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mission picker */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Wake-up Mission</Label>
                  <span className="text-xs text-muted-foreground">
                    {MISSIONS.find((m) => m.id === alarm.verification_type)?.name}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {MISSIONS.map((m) => {
                    const Icon     = m.icon;
                    const selected = alarm.verification_type === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (m.id === 'none') {
                            setAlarm((p) => ({ ...p, verification_type: 'none' }));
                          } else {
                            setPendingMission(m.id);
                            setMissionConfigOpen(true);
                          }
                        }}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg transition-all border',
                          selected ? 'border-primary bg-primary/10' : 'border-transparent bg-muted hover:bg-muted/70',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="text-[9px] font-medium leading-tight text-center">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sound + vibration */}
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  onClick={() => setShowRingtonePicker(true)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Music className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">Sound</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {alarm.ringtone_name || 'System default'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                <div className="flex items-center gap-3 p-3">
                  <Volume2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <Slider
                    value={[alarm.volume]}
                    onValueChange={([v]) => setAlarm((p) => ({ ...p, volume: v }))}
                    max={100}
                    className="flex-1 min-w-0"
                  />
                  <span className="text-xs text-muted-foreground tabular-nums w-9 text-right shrink-0">
                    {alarm.volume}%
                  </span>
                </div>

                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Vibrate className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">Vibration</span>
                  </div>
                  <Switch
                    checked={alarm.vibration_enabled}
                    onCheckedChange={(v) => setAlarm((p) => ({ ...p, vibration_enabled: v }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Zap className={cn('h-4 w-4 shrink-0', alarm.extra_loud ? 'text-yellow-500' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium">Extra Loud</p>
                      <p className="text-xs text-muted-foreground">Crescendo effect — volume builds up</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!alarm.extra_loud}
                    onCheckedChange={(v) => setAlarm((p) => ({ ...p, extra_loud: v }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Bell className={cn('h-4 w-4 shrink-0', alarm.label_reminder ? 'text-primary' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium">Label Reminder</p>
                      <p className="text-xs text-muted-foreground">Show label text when alarm rings</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!alarm.label_reminder}
                    onCheckedChange={(v) => setAlarm((p) => ({ ...p, label_reminder: v }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Clock className={cn('h-4 w-4 shrink-0', alarm.time_reminder ? 'text-primary' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium">Time Reminder</p>
                      <p className="text-xs text-muted-foreground">Announce current time by voice</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!alarm.time_reminder}
                    onCheckedChange={(v) => setAlarm((p) => ({ ...p, time_reminder: v }))}
                  />
                </div>
              </div>

              {/* Snooze */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Snooze</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Interval</p>
                    <div className="grid grid-cols-3 gap-1">
                      {[3, 5, 10].map((mn) => (
                        <button
                          key={mn}
                          onClick={() => setAlarm((p) => ({ ...p, snooze_interval_minutes: mn }))}
                          className={cn(
                            'h-9 rounded-xl text-xs font-semibold w-full',
                            alarm.snooze_interval_minutes === mn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {mn}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Limit</p>
                    <div className="grid grid-cols-3 gap-1">
                      {[1, 3, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setAlarm((p) => ({ ...p, snooze_limit: n }))}
                          className={cn(
                            'h-9 rounded-xl text-xs font-semibold w-full',
                            alarm.snooze_limit === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          ×{n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Label & intention */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                    <Tag className="h-3 w-3" /> Label
                  </Label>
                  <Input
                    placeholder="কেন উঠছো? (optional)"
                    value={alarm.label}
                    maxLength={50}
                    onChange={(e) => setAlarm((p) => ({ ...p, label: e.target.value.slice(0, 50) }))}
                    className="bg-muted border-0 h-10"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      { label: 'Fajr 🤲', value: 'Fajr prayer 🤲' },
                      { label: 'Gym 💪',  value: 'আজ gym যাবো 💪' },
                      { label: 'Study 📚', value: 'পরীক্ষা আছে 📚' },
                      { label: 'Work 💼', value: 'Early work 💼' },
                      { label: 'Walk 🌿', value: 'Morning walk 🌿' },
                    ].map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setAlarm((p) => ({ ...p, label: s.value }))}
                        className="text-[11px] px-2 py-1 rounded-full bg-muted hover:bg-primary/20 text-foreground/80 transition-colors"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                    Why are you waking up?
                  </Label>
                  <Input
                    placeholder="Fajr prayer and morning study"
                    value={alarm.intention}
                    onChange={(e) => setAlarm((p) => ({ ...p, intention: e.target.value }))}
                    className="bg-muted border-0 h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Shown when the alarm rings.</p>
                </div>
              </div>

              {/* Wallpaper */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ImageIcon className="h-3 w-3" /> Alarm Wallpaper
                </Label>

                {alarm.wallpaper_url ? (
                  <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
                    <img
                      src={alarm.wallpaper_url}
                      alt="Wallpaper preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-3">
                      <button
                        onClick={pickWallpaper}
                        disabled={wallpaperLoading}
                        className="flex items-center gap-1.5 disabled:opacity-60 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-white/30 transition-all"
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> {wallpaperLoading ? 'Loading…' : 'Change'}
                      </button>
                      <button
                        onClick={handleWallpaperRemove}
                        className="flex items-center gap-1.5 bg-red-500/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-red-500/90 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={pickWallpaper}
                    disabled={wallpaperLoading}
                    className="w-full flex flex-col disabled:opacity-60 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                    style={{ height: 120 }}
                  >
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{wallpaperLoading ? 'Opening gallery…' : 'Choose from gallery'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Shown as background when alarm rings</p>
                    </div>
                  </button>
                )}

                <input
                  ref={wallpaperInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleWallpaperSelect}
                />
              </div>

            </div>
          </div>

          {/* Save bar */}
          <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sticky bottom-0">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full h-12 rounded-2xl font-bold text-base disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Alarm' : 'Save Alarm'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showTimePicker && (
        <ScrollTimePicker
          value={alarm.alarm_time}
          onSaveTime={(t) => setAlarm((p) => ({ ...p, alarm_time: t }))}
          onClose={() => setShowTimePicker(false)}
        />
      )}

      {showRingtonePicker && (
        <RingtoneSheet
          selectedId={alarm.ringtone_id ?? undefined}
          onSelect={(uri, name, id) => {
            setAlarm((p) => ({
              ...p,
              ringtone_url:  uri,
              ringtone_name: name,
              ringtone_id:   id,
              sound_type:    id.startsWith('default:') ? 'default' : 'custom',
            }));
            setShowRingtonePicker(false);
          }}
          onClose={() => setShowRingtonePicker(false)}
        />
      )}

      {missionConfigOpen && (
        <MissionConfigRouter
          missionId={pendingMission ?? alarm.verification_type}
          value={pendingMission === alarm.verification_type ? alarm.mission_config ?? DEFAULT_MISSION_CONFIG : DEFAULT_MISSION_CONFIG}
          onSave={(cfg) => {
            try {
              const globalCfg = { difficulty: cfg.difficulty, count: cfg.count };
              localStorage.setItem(`rise_mission_cfg_${alarm.verification_type}`, JSON.stringify(globalCfg));
            } catch {}
            setAlarm((p) => ({ ...p, verification_type: pendingMission ?? p.verification_type, mission_config: cfg }));
            setMissionConfigOpen(false);
          }}
          onClose={() => setMissionConfigOpen(false)}
        />
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PresetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-3 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
      )}
    >
      {children}
    </button>
  );
}

// ─── Clock-dial Time Picker ──────────────────────────────────────────────────
// A round clock face. Tap/drag the hour, it auto-switches to minutes (5-min
// steps, drag snaps to 1 min while held). The knob is the Life OS mark —
// a ring with an upward arrow that always points outward along the hand.

const DIAL = 280;               // px, viewBox size
const R_NUM = 104;              // radius of the numbers
const CX = DIAL / 2;

function ScrollTimePicker({ value, onSaveTime, onClose }: { value: string; onSaveTime: (t: string) => void; onClose: () => void }) {
  const [h24, m0] = value.split(':').map(Number);
  const [hour, setHour] = useState(h24 % 12 || 12);
  const [minute, setMinute] = useState(m0 || 0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(h24 >= 12 ? 'PM' : 'AM');
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastVal = useRef<number | null>(null);

  const angleFromEvent = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    return { deg, dist: Math.hypot(x, y) / (r.width / 2) };
  };

  const apply = (deg: number, fine: boolean) => {
    if (mode === 'hour') {
      const h = Math.round(deg / 30) % 12 || 12;
      if (h !== lastVal.current) { lastVal.current = h; setHour(h); navigator.vibrate?.(4); }
    } else {
      const step = fine ? 1 : 5;
      const mm = (Math.round(deg / (6 * step)) * step) % 60;
      if (mm !== lastVal.current) { lastVal.current = mm; setMinute(mm); navigator.vibrate?.(3); }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    const point = angleFromEvent(e);
    if (!point) return;
    const { deg, dist } = point;
    if (dist < 0.22) return;                 // ignore taps on the centre
    dragging.current = true;
    lastVal.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(deg, false);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const point = angleFromEvent(e);
    if (point) apply(point.deg, mode === 'minute');
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (mode === 'hour') setMode('minute');
  };

  const handleComplete = () => {
    let h = hour % 12;
    if (ampm === 'PM') h += 12;
    onSaveTime(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    onClose();
  };

  const selDeg = mode === 'hour' ? (hour % 12) * 30 : minute * 6;
  const rad = ((selDeg - 90) * Math.PI) / 180;
  const kx = CX + R_NUM * Math.cos(rad);
  const ky = CX + R_NUM * Math.sin(rad);
  const labels = mode === 'hour'
    ? Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 12 : i, deg: i * 30, text: String(i === 0 ? 12 : i) }))
    : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, deg: i * 30, text: String(i * 5).padStart(2, '0') }));
  const isSel = (v: number) => (mode === 'hour' ? v === hour : v === minute);

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-background/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md max-h-[100dvh] overflow-y-auto bg-card text-card-foreground border-t border-border rounded-t-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="bg-muted w-10 h-1 rounded-full" /></div>

        {/* Live preview — tap hour / minute to switch dial mode */}
        <div className="flex items-end justify-center gap-1 pt-2">
          <button onClick={() => setMode('hour')} className={cn('text-5xl font-black tabular-nums rounded-xl px-2 transition-colors', mode === 'hour' ? 'text-primary bg-primary/10' : 'text-foreground')}>
            {String(hour).padStart(2, '0')}
          </button>
          <span className="text-5xl font-black text-muted-foreground pb-0.5">:</span>
          <button onClick={() => setMode('minute')} className={cn('text-5xl font-black tabular-nums rounded-xl px-2 transition-colors', mode === 'minute' ? 'text-primary bg-primary/10' : 'text-foreground')}>
            {String(minute).padStart(2, '0')}
          </button>
          <div className="ml-2 flex flex-col gap-1 pb-1">
            {(['AM', 'PM'] as const).map((p) => (
              <button key={p} onClick={() => setAmpm(p)} className={cn('h-7 w-12 rounded-full text-xs font-bold transition-all', ampm === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-1">
          {mode === 'hour' ? 'Hour' : 'Minute'}
        </p>

        <div className="flex justify-center py-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${DIAL} ${DIAL}`}
            className="w-[min(78vw,300px)] h-auto touch-none select-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => { dragging.current = false; }}
          >
            <defs>
              <linearGradient id="rise-dial-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
            </defs>
            {/* face */}
            <circle cx={CX} cy={CX} r={CX - 4} className="fill-muted/50" />
            <circle cx={CX} cy={CX} r={CX - 4} fill="none" stroke="url(#rise-dial-grad)" strokeWidth="3" opacity="0.5" />
            {/* minute ticks */}
            {Array.from({ length: 60 }, (_, i) => {
              const a = ((i * 6 - 90) * Math.PI) / 180;
              const r1 = CX - 12, r2 = i % 5 === 0 ? CX - 20 : CX - 15;
              return <line key={i} x1={CX + r1 * Math.cos(a)} y1={CX + r1 * Math.sin(a)} x2={CX + r2 * Math.cos(a)} y2={CX + r2 * Math.sin(a)} className="stroke-muted-foreground" strokeOpacity={i % 5 === 0 ? 0.5 : 0.2} strokeWidth="1.5" strokeLinecap="round" />;
            })}
            {/* hand */}
            <line x1={CX} y1={CX} x2={kx} y2={ky} stroke="url(#rise-dial-grad)" strokeWidth="3" strokeLinecap="round" />
            <circle cx={CX} cy={CX} r="5" className="fill-primary" />
            {/* numbers */}
            {labels.map((l) => {
              const a = ((l.deg - 90) * Math.PI) / 180;
              const x = CX + R_NUM * Math.cos(a), y = CX + R_NUM * Math.sin(a);
              return (
                <text key={l.text} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  className={cn('text-[17px] font-bold pointer-events-none transition-colors', isSel(l.v) ? 'fill-primary-foreground' : 'fill-foreground')}>
                  {l.text}
                </text>
              );
            })}
            {/* knob — the Life OS mark, arrow pointing outward along the hand */}
            <g transform={`translate(${kx} ${ky}) rotate(${selDeg})`} className="pointer-events-none" style={{ transition: dragging.current ? 'none' : 'transform 160ms ease-out' }}>
              <circle r="22" className="fill-primary" />
              <circle r="22" fill="none" className="stroke-primary-foreground" strokeOpacity="0.35" strokeWidth="2" />
              {!labels.some((l) => isSel(l.v)) ? (
                <g className="stroke-primary-foreground" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <path d="M-7 -1 L0 -8 L7 -1" /><path d="M0 -8 L0 7" /><path d="M0 7 L5 7" />
                </g>
              ) : null}
            </g>
            {/* re-draw selected number on top of knob when it sits on a label */}
            {labels.filter((l) => isSel(l.v)).map((l) => (
              <text key={'s' + l.text} x={kx} y={ky} textAnchor="middle" dominantBaseline="central" className="text-[17px] font-black fill-primary-foreground pointer-events-none">{l.text}</text>
            ))}
          </svg>
        </div>

        <div className="px-4 pb-4 pt-1 flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-2xl font-semibold">Cancel</Button>
          <Button onClick={handleComplete} className="flex-1 h-12 rounded-2xl font-bold">Set Time</Button>
        </div>
      </div>
    </div>,
    document.querySelector('[data-rise-editor-host]') ?? document.body,
  );
}

// ─── Ringtone Sheet ───────────────────────────────────────────────────────────

import { RingtonePicker as DynamicRingtonePicker } from './RingtonePicker';

function RingtoneSheet({ selectedId, onSelect, onClose }: { selectedId?: string; onSelect: (uri: string, name: string, id: string) => void; onClose: () => void }) {
  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', pointerEvents: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background text-foreground border-t border-border"
        style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', height: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <p className="font-bold text-base">Ringtones</p>
            <p className="text-xs text-muted-foreground">Select your wake-up sound</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <DynamicRingtonePicker selectedId={selectedId} onSelect={(uri, rt) => onSelect(uri, rt.name, rt.id)} />
        </div>
      </div>
    </div>,
    document.querySelector('[data-rise-editor-host]') ?? document.body,
  );
}




