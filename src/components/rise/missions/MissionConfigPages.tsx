/**
 * MissionConfigPages — Alarmy style mission configuration
 * ─────────────────────────────────────────────────────────
 * প্রতিটা mission এর জন্য আলাদা full-screen config page।
 * Live preview সহ। Generic sheet নেই।
 *
 * Exports:
 *   <MissionConfigRouter> — mission type অনুযায়ী সঠিক page দেখায়
 *
 * Props:
 *   missionId  — 'math' | 'shake' | 'qr' | 'photo' | 'typing'
 *   value      — current MissionConfig
 *   onSave     — (cfg: MissionConfig) => void
 *   onClose    — () => void
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, Camera, RefreshCw, Check, Calculator, QrCode, Smartphone, Type, Footprints, Minus, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { isNative } from '@/lib/capacitor/platform';
import { lightImpact, mediumImpact, selectionChanged, successNotification, errorNotification } from '@/lib/capacitor/nativeHaptics';
import { cn } from '@/lib/utils';
import { MathMission } from '@/components/rise/missions/MathMission';
import { ShakeMission } from '@/components/rise/missions/ShakeMission';
import { BarcodeMission } from '@/components/rise/missions/BarcodeMission';
import { PhotoMission } from '@/components/rise/missions/PhotoMission';
import { TypingMission } from '@/components/rise/missions/TypingMission';
import { StepMission, requiredStepsFor } from '@/components/rise/missions/StepMission';
import { MissionStage } from '@/components/rise/missions/MissionStage';

/* ─── Types ────────────────────────────────────────────── */
export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export interface MissionConfig {
  difficulty: MissionDifficulty;
  count: number;
  targetBarcode?: string;
  photoLocation?: string;
  photoDataUrl?: string;   // ← registered reference photo
  typingPhrase?: string;   // ← phrase to type
}

/* ─── Router ────────────────────────────────────────────── */
interface RouterProps {
  missionId: string;
  value: MissionConfig;
  onSave: (cfg: MissionConfig) => void;
  onClose: () => void;
}

export function MissionConfigRouter({ missionId, value, onSave, onClose }: RouterProps) {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex h-[100dvh] flex-col overflow-hidden overscroll-contain bg-background text-foreground">
      {missionId === 'math'  && <MathConfigPage    value={value} onSave={onSave} onClose={onClose} />}
      {missionId === 'shake' && <ShakeConfigPage   value={value} onSave={onSave} onClose={onClose} />}
      {(missionId === 'qr' || missionId === 'barcode') && <QrConfigPage value={value} onSave={onSave} onClose={onClose} />}
      {missionId === 'photo' && <PhotoConfigPage   value={value} onSave={onSave} onClose={onClose} />}
      {missionId === 'typing' && <TypingConfigPage value={value} onSave={onSave} onClose={onClose} />}
      {missionId === 'steps' && <StepsConfigPage value={value} onSave={onSave} onClose={onClose} />}
    </div>,
    document.body,
  );
}

/* ─── Shared primitives ─────────────────────────────────── */

/**
 * Single close/back control only — the previous version rendered an extra `X`
 * on the right which duplicated the left control and confused users.
 */
function ConfigHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  const handle = () => { void lightImpact(); (onBack ?? onClose)(); };
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handle}
        aria-label={onBack ? 'Back' : 'Close'}
        className="h-10 w-10 rounded-full bg-muted active:scale-95"
      >
        {onBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
      </Button>
      <div>
        <span className="block text-base font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">Wake-up challenge</span>
      </div>
    </div>
  );
}

// Repetitions — a row of rising bars; tap one to set the count.
function CountPicker({ value, onChange, max = 10, label = 'times' }: { value: number; onChange: (n: number) => void; max?: number; label?: string }) {
  const set = (n: number) => { void selectionChanged(); onChange(Math.min(max, Math.max(1, n))); };
  return (
    <div className="rounded-[1.5rem] border border-border bg-card p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-sm font-bold">Rounds</p>
          <p className="text-xs text-muted-foreground">How many {label} before it stops</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Fewer rounds"><Minus className="h-4 w-4" /></Button>
          <span className="w-8 text-center text-3xl font-black tabular-nums text-primary">{value}</span>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => set(value + 1)} disabled={value >= max} aria-label="More rounds"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex items-end justify-between gap-1" role="radiogroup" aria-label="Rounds">
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1, on = n <= value;
          return (
            <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n}`} onClick={() => set(n)}
              className="flex h-11 flex-1 items-end justify-center">
              <span className={cn('w-full max-w-[22px] rounded-full transition-all duration-200', on ? 'bg-primary' : 'bg-muted')}
                style={{ height: `${14 + (n / max) * 26}px`, opacity: on ? 0.45 + (n / max) * 0.55 : 1 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Difficulty — three "intensity" tiles; bars rise like the sun.
const DIFF_META: Record<MissionDifficulty, { name: string; hint: string; bars: number }> = {
  easy:   { name: 'Gentle', hint: 'Easy',   bars: 1 },
  medium: { name: 'Steady', hint: 'Medium', bars: 2 },
  hard:   { name: 'Fierce', hint: 'Hard',   bars: 3 },
};
function DifficultySlider({ value, onChange }: { value: MissionDifficulty; onChange: (d: MissionDifficulty) => void }) {
  const levels: MissionDifficulty[] = ['easy', 'medium', 'hard'];
  return (
    <div className="rounded-[1.5rem] border border-border bg-card p-4">
      <p className="text-sm font-bold">Intensity</p>
      <p className="mb-3 text-xs text-muted-foreground">How hard tomorrow-you has to work</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
        {levels.map((level) => {
          const m = DIFF_META[level], on = value === level;
          return (
            <button key={level} type="button" role="radio" aria-checked={on}
              onClick={() => { void selectionChanged(); onChange(level); }}
              className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3 transition-all active:scale-95',
                on ? 'border-primary bg-primary/10' : 'border-transparent bg-muted')}>
              <span className="flex h-7 items-end gap-1">
                {[1, 2, 3].map((b) => (
                  <span key={b} className={cn('w-2 rounded-full transition-colors', b <= m.bars ? (on ? 'bg-primary' : 'bg-muted-foreground/60') : 'bg-muted-foreground/20')}
                    style={{ height: `${b * 8 + 4}px` }} />
                ))}
              </span>
              <span className={cn('text-sm font-black', on ? 'text-primary' : 'text-foreground')}>{m.name}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Bottom action buttons
function ActionButtons({ onPreview, onComplete, previewLabel = 'Preview' }: { onPreview?: () => void; onComplete: () => void; previewLabel?: string }) {
  return (
    <div className="flex shrink-0 gap-3 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-sm">
      {onPreview && (
        <Button
          type="button"
          variant="outline"
          onClick={() => { void lightImpact(); onPreview(); }}
          className="h-12 flex-1 font-bold"
        >
          {previewLabel}
        </Button>
      )}
      <Button
        type="button"
        onClick={() => { void mediumImpact(); onComplete(); }}
        className="h-12 flex-1 font-bold"
      >
        Save
      </Button>
    </div>
  );
}

/**
 * Full-screen mission PREVIEW — this is the only place a keypad / typing input
 * is shown. The setup screens stay clean (no live keyboard), matching the real
 * alarm-ring experience.
 */
function PreviewShell({ title, onExit, children }: { title: string; onExit: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => { void lightImpact(); onExit(); }}
          aria-label="Exit preview"
          className="h-10 w-10 rounded-full bg-muted"
        >
          <X className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">Alarm preview</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

const setupScrollerClass = 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y px-4 pb-6';


/* ══════════════════════════════════════════════════════════
   1. MATH CONFIG
   ══════════════════════════════════════════════════════════ */

function MathConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(value.difficulty ?? 'easy');
  const [count, setCount]           = useState(value.count ?? 1);
  const [problem, setProblem]       = useState<{ q: string; a: number } | null>(null);
  const [userInput, setUserInput]   = useState('');
  const [isError, setIsError]       = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [solved, setSolved]         = useState(0);
  const timers                       = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const generateProblem = () => {
    let a: number, b: number, q: string, ans: number;
    if (difficulty === 'easy') {
      a = Math.floor(Math.random() * 9) + 1;
      b = Math.floor(Math.random() * 9) + 1;
      q = `${a}+${b}`; ans = a + b;
    } else if (difficulty === 'medium') {
      a = Math.floor(Math.random() * 50) + 10;
      b = Math.floor(Math.random() * 50) + 10;
      const op = Math.random() > 0.5;
      q = op ? `${a}+${b}` : `${Math.max(a,b)}-${Math.min(a,b)}`;
      ans = op ? a + b : Math.abs(a - b);
    } else {
      a = Math.floor(Math.random() * 9) + 2;
      b = Math.floor(Math.random() * 9) + 2;
      q = `${a}×${b}`; ans = a * b;
    }
    setProblem({ q, a: ans });
    setUserInput('');
    setIsError(false);
  };

  // Regenerate the sample problem whenever the difficulty changes.
  useEffect(() => { generateProblem(); /* eslint-disable-next-line */ }, [difficulty]);

  const startPreview = () => {
    setSolved(0);
    generateProblem();
    setPreviewing(true);
  };

  const exitPreview = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPreviewing(false);
    setUserInput('');
    setSolved(0);
  };

  const handleKey = (k: string) => {
    if (!problem) return;
    void lightImpact();
    if (k === '⌫') { setUserInput((p) => p.slice(0, -1)); return; }
    const next = userInput + k;
    setUserInput(next);
    const expected = problem.a.toString();
    if (next === expected) {
      void successNotification();
      const done = solved + 1;
      setSolved(done);
      if (done >= count) {
        toast.success('Preview complete — alarm would dismiss ✓');
        later(exitPreview, 700);
      } else {
        toast.success(`Correct! ${done}/${count}`);
        later(generateProblem, 400);
      }
    } else if (next.length >= expected.length) {
      void errorNotification();
      setIsError(true);
      later(() => { setIsError(false); setUserInput(''); }, 500);
    }
  };

  const handleComplete = () => {
    onSave({ ...value, difficulty, count });
    toast.success('Math mission configured ✓');
    onClose();
  };

  return (
    <div className="relative flex flex-col h-full bg-background">
      <ConfigHeader title="Math" onClose={onClose} />

      {/* SETUP — no keypad here, only a static sample of the problem */}
      <div className={cn(setupScrollerClass, 'flex flex-col gap-4 pt-3')}>
        <MissionStage kind="math" headline={`Solve ${count} ${count === 1 ? 'problem' : 'problems'}`} sub="Wake the brain up before the body">
          <p className="text-5xl font-black tabular-nums text-foreground">
            {problem?.q} <span className="text-primary">=</span> <span className="text-muted-foreground/40">?</span>
          </p>
          <button
            onClick={() => { void lightImpact(); generateProblem(); }}
            className="mt-4 flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground active:scale-95 transition-transform"
          >
            <RefreshCw className="h-3.5 w-3.5" /> New example
          </button>
        </MissionStage>

        <DifficultySlider value={difficulty} onChange={setDifficulty} />
        <CountPicker value={count} onChange={setCount} max={10} label="times" />
      </div>

      <ActionButtons onPreview={startPreview} onComplete={handleComplete} />

      {/* PREVIEW — full-screen challenge with the working keypad */}
      {previewing && (
        <PreviewShell title="Math challenge" onExit={exitPreview}>
          <MathMission
            requiredSolves={count}
            perProblemSeconds={({ easy: 120, medium: 60, hard: 30 } as Record<string, number>)[difficulty] ?? 60}
            onComplete={() => { toast.success('Preview complete — alarm would dismiss ✓'); later(exitPreview, 700); }}
          />
        </PreviewShell>
      )}
    </div>
  );
}



/* ══════════════════════════════════════════════════════════
   2. SHAKE CONFIG
   ══════════════════════════════════════════════════════════ */

function ShakeConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(value.difficulty ?? 'easy');
  const [count, setCount]           = useState(value.count ?? 3);
  const [previewing, setPreviewing] = useState(false);


  const requiredShakes = count * (difficulty === 'hard' ? 15 : difficulty === 'easy' ? 5 : 10);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ConfigHeader title="Shake" onClose={onClose} />

      <div className={cn(setupScrollerClass, 'flex flex-col gap-4 pt-3')}>

        <MissionStage kind="shake" target={requiredShakes} headline={`Shake ${requiredShakes} times`} sub="Hard enough that you cannot do it half-asleep" />

        <DifficultySlider value={difficulty} onChange={setDifficulty} />
        <CountPicker value={count} onChange={setCount} max={10} label="rounds" />

        <div className="bg-muted rounded-xl p-3">
          <p className="text-muted-foreground text-xs text-center">
            Total shakes: <span className="text-foreground font-bold">{requiredShakes}</span>
          </p>
        </div>
      </div>

      <ActionButtons
        onPreview={() => setPreviewing(true)}
        onComplete={() => { onSave({ ...value, difficulty, count }); toast.success('Shake mission configured ✓'); onClose(); }}
      />
      {previewing && (
        <PreviewShell title="Shake challenge" onExit={() => setPreviewing(false)}>
          <ShakeMission requiredShakes={requiredShakes} onComplete={() => {
            toast.success('Preview complete — alarm would dismiss ✓');
            setPreviewing(false);
          }} />
        </PreviewShell>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   2b. STEPS CONFIG — walk to dismiss
   ══════════════════════════════════════════════════════════ */

function StepsConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(value.difficulty ?? 'medium');
  const [count, setCount]           = useState(value.count ?? 3);
  const [previewing, setPreviewing] = useState(false);
  const per = difficulty === 'hard' ? 40 : difficulty === 'easy' ? 10 : 20;
  const total = count * per;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ConfigHeader title="Steps" onClose={onClose} />
      <div className={cn(setupScrollerClass, 'flex flex-col gap-4 pt-3')}>
        <MissionStage kind="steps" target={total} headline={`Walk ${total} steps`} sub="It only stops once you are out of bed and moving" />
        <DifficultySlider value={difficulty} onChange={setDifficulty} />
        <CountPicker value={count} onChange={setCount} max={10} label="rounds" />
        <div className="bg-muted rounded-xl p-3">
          <p className="text-muted-foreground text-xs text-center">
            Total steps: <span className="text-foreground font-bold">{total}</span> · fast shaking is not counted
          </p>
        </div>
      </div>
      <ActionButtons
        onPreview={() => setPreviewing(true)}
        onComplete={() => { onSave({ ...value, difficulty, count }); toast.success('Step mission configured ✓'); onClose(); }}
      />
      {previewing && (
        <PreviewShell title="Steps challenge" onExit={() => setPreviewing(false)}>
          <StepMission requiredSteps={total} onComplete={() => {
            toast.success('Preview complete — alarm would dismiss ✓');
            setPreviewing(false);
          }} />
        </PreviewShell>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   3. QR / BARCODE CONFIG
   ══════════════════════════════════════════════════════════ */

function QrConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [scanned, setScanned]           = useState(value.targetBarcode ?? '');
  const [isScanning, setIsScanning]     = useState(false);
  const [previewing, setPreviewing]     = useState(false);
  const manualRef                        = useRef<HTMLInputElement>(null);

  const doScan = async () => {
    setIsScanning(true);
    try {
      if (isNative) {
        const { scanBarcode } = await import('@/lib/capacitor/barcodeScannerBridge');
        const result = await scanBarcode('');
        if (result.success && result.value) {
          setScanned(result.value);
          toast.success(`Registered: ${result.value}`);
        }
      } else {
        // Web fallback — manual input
        manualRef.current?.focus();
        toast.info('Enter barcode manually below (web mode)');
      }
    } catch (e) {
      toast.error('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ConfigHeader title="QR/Barcode" onClose={onClose} />

      <div className={cn(setupScrollerClass, 'flex flex-col items-center gap-5 pt-4')}>
        <p className="text-foreground text-2xl font-bold text-center leading-snug">
          Scan a code of a part of{'\n'}your morning routine
        </p>

        {/* Example / scanned image */}
        <div className="w-full max-w-xs rounded-2xl overflow-hidden bg-muted aspect-square flex items-center justify-center">
          {scanned ? (
            <div className="flex flex-col items-center gap-3 p-6">
              <Check className="h-16 w-16 text-primary" />
              <p className="text-primary font-bold text-center break-all">{scanned}</p>
              <p className="text-muted-foreground text-xs text-center">Tap Scan to change</p>
            </div>
          ) : (
            /* Barcode illustration */
            <div className="flex flex-col items-center gap-3 p-6">
              <MissionStage kind="qr" headline="No code registered yet" sub="Toothpaste, coffee jar, a sticker by the sink" className="w-full border-0 shadow-none" />
            </div>
          )}
        </div>

        {/* Manual input for web */}
        {!isNative && (
          <input
            ref={manualRef}
            placeholder="Type barcode value manually"
            value={scanned}
            onChange={(e) => setScanned(e.target.value)}
            className="w-full bg-muted text-foreground rounded-xl px-4 py-3 text-sm outline-none border border-border focus:border-primary"
          />
        )}

        <p className="text-muted-foreground text-sm text-center px-4">
          You'll need to scan this code every morning to dismiss your alarm.
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-sm">
        <Button
          type="button"
          onClick={doScan}
          disabled={isScanning}
          variant="outline"
          className="h-12 font-bold"
        >
          {isScanning ? 'Opening scanner...' : scanned ? 'Re-scan' : 'Scan'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!scanned) { toast.error('Register a QR code or barcode first'); return; }
            setPreviewing(true);
          }}
          variant="outline"
          className="h-12 font-bold"
        >
          Preview
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!scanned.trim()) { toast.error('Please register a barcode first'); return; }
            onSave({ ...value, targetBarcode: scanned.trim() });
            toast.success('QR/Barcode mission configured ✓');
            onClose();
          }}
          className="col-span-2 h-12 font-bold"
        >
          Save
        </Button>
      </div>
      {previewing && (
        <PreviewShell title="QR/Barcode challenge" onExit={() => setPreviewing(false)}>
          <BarcodeMission targetBarcode={scanned} onComplete={() => {
            toast.success('Preview complete — alarm would dismiss ✓');
            setPreviewing(false);
          }} />
        </PreviewShell>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   4. PHOTO CONFIG
   ══════════════════════════════════════════════════════════ */

function PhotoConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(value.photoDataUrl ?? null);
  const [location,     setLocation]     = useState(value.photoLocation ?? '');
  const [capturing,    setCapturing]    = useState(false);
  const [previewing,   setPreviewing]   = useState(false);
  const fileRef                          = useRef<HTMLInputElement>(null);

  const takePhoto = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      if (isNative) {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        const photo = await Camera.getPhoto({
          quality:      70,
          resultType:   CameraResultType.DataUrl,
          source:       CameraSource.Camera,
          allowEditing: false,
          saveToGallery: false,
        });
        if (photo.dataUrl) setPhotoDataUrl(photo.dataUrl);
      } else {
        fileRef.current?.click();
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/cancel/i.test(msg)) toast.error('Camera failed');
    } finally {
      setCapturing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ConfigHeader title="Photo" onClose={onClose} />

      <div className={cn(setupScrollerClass, 'flex flex-col items-center gap-4 pt-3')}>
        <p className="text-foreground text-2xl font-bold text-center leading-snug">
          Take a photo of a part of{'\n'}your morning routine
        </p>

        {/* Photo preview / camera placeholder */}
        <div
          className="w-full max-w-xs rounded-2xl overflow-hidden relative"
          style={{ aspectRatio: '3/4' }}
        >
          {photoDataUrl ? (
            <>
              <img src={photoDataUrl} alt="Reference" className="w-full h-full object-cover" />
              {/* Viewfinder overlay */}
              <div className="absolute inset-0 flex items-start justify-start p-3">
                <div className="w-5 h-5 border-t-2 border-l-2 border-white rounded-tl" />
              </div>
              <div className="absolute inset-0 flex items-start justify-end p-3">
                <div className="w-5 h-5 border-t-2 border-r-2 border-white rounded-tr" />
              </div>
              <div className="absolute inset-0 flex items-end justify-start p-3">
                <div className="w-5 h-5 border-b-2 border-l-2 border-white rounded-bl" />
              </div>
              <div className="absolute inset-0 flex items-end justify-end p-3">
                <div className="w-5 h-5 border-b-2 border-r-2 border-white rounded-br" />
              </div>
              {/* Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 relative">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/60" />
                  <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/60" />
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-3">
              <MissionStage kind="photo" headline="No photo registered" sub="Tap the shutter to capture your spot" className="w-full h-full border-0 shadow-none rounded-none" />
            </div>
          )}

          {/* Shutter button overlay */}
          <button
            onClick={takePhoto}
            disabled={capturing}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-red-500" />
          </button>
        </div>

        {/* Location label */}
        <div className="w-full">
          <p className="text-muted-foreground text-xs mb-1.5">Location name (optional)</p>
          <input
            placeholder="e.g. Bathroom sink, Kitchen counter"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-muted text-foreground rounded-xl px-4 py-3 text-sm outline-none border border-border focus:border-primary"
          />
        </div>

        <p className="text-muted-foreground text-sm text-center px-2">
          Every morning you'll need to take a photo of this spot to dismiss the alarm.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!photoDataUrl) { toast.error('Take a reference photo first'); return; }
            setPreviewing(true);
          }}
          className="h-12 font-bold"
        >
          Preview
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!photoDataUrl) { toast.error('Please take a reference photo first'); return; }
            onSave({ ...value, photoDataUrl, photoLocation: location.trim() || 'Morning spot' });
            toast.success('Photo mission configured ✓');
            onClose();
          }}
          className="h-12 font-bold"
        >
          Save
        </Button>
      </div>
      {previewing && photoDataUrl && (
        <PreviewShell title="Photo challenge" onExit={() => setPreviewing(false)}>
          <PhotoMission
            registeredPlace={location.trim() || 'your morning spot'}
            registeredPhotoUrl={photoDataUrl}
            onComplete={() => {
              toast.success('Preview complete — alarm would dismiss ✓');
              setPreviewing(false);
            }}
          />
        </PreviewShell>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   5. TYPING CONFIG
   ══════════════════════════════════════════════════════════ */

const PRESET_PHRASES = [
  'Keep shining',
  'I am ready for today',
  'Rise and conquer',
  'Every morning is a fresh start',
  'Bismillah',
  'Alhamdulillah for today',
  'Make today count',
  'I choose to be productive',
  'بسم الله الرحمن الرحيم',
  'আজকে আমি সেরাটা দেব',
];

function TypingConfigPage({ value, onSave, onClose }: { value: MissionConfig; onSave: (c: MissionConfig) => void; onClose: () => void }) {
  const [phrase,          setPhrase]          = useState(value.typingPhrase ?? PRESET_PHRASES[0]);
  const [difficulty,      setDifficulty]      = useState<MissionDifficulty>(value.difficulty ?? 'easy');
  const [count,           setCount]           = useState(value.count ?? 1);
  const [showPhraseList,  setShowPhraseList]  = useState(false);
  const [customPhrase,    setCustomPhrase]    = useState('');
  const [previewing,      setPreviewing]      = useState(false);
  const [previewInput,    setPreviewInput]    = useState('');
  const [typedCount,      setTypedCount]      = useState(0);
  const [previewDone,     setPreviewDone]     = useState(false);
  const previewTimers                          = useRef<number[]>([]);
  const previewRef                             = useRef<HTMLInputElement>(null);

  useEffect(() => () => { previewTimers.current.forEach(clearTimeout); previewTimers.current = []; }, []);

  // Autofocus the input (and therefore the OS keyboard) only inside preview.
  useEffect(() => {
    if (!previewing) return;
    const id = window.setTimeout(() => previewRef.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [previewing]);

  const exitPreview = () => {
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [];
    setPreviewing(false);
    setPreviewInput('');
    setTypedCount(0);
    setPreviewDone(false);
  };

  const handlePreviewType = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setPreviewInput(v);
    // 'hard' requires exact case; easier levels are case-insensitive.
    const match = difficulty === 'hard' ? v === phrase : v.toLowerCase() === phrase.toLowerCase();
    if (!match) return;
    void successNotification();
    const done = typedCount + 1;
    setTypedCount(done);
    setPreviewDone(true);
    if (done >= count) {
      toast.success('Preview complete — alarm would dismiss ✓');
      previewTimers.current.push(window.setTimeout(exitPreview, 700));
    } else {
      toast.success(`Correct! ${done}/${count}`);
      previewTimers.current.push(window.setTimeout(() => { setPreviewInput(''); setPreviewDone(false); }, 500));
    }
  };

  if (showPhraseList) {
    return (
      <div className="flex flex-col h-full bg-background">
        <ConfigHeader title="Select phrase" onBack={() => setShowPhraseList(false)} onClose={onClose} />
        <div className={cn(setupScrollerClass, 'flex flex-col gap-2 pt-3')}>
          {/* Custom */}
          <div className="mb-2">
            <p className="text-muted-foreground text-xs mb-1.5">Custom phrase</p>
            <div className="flex gap-2">
              <input
                placeholder="Type your own phrase..."
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                className="flex-1 bg-muted text-foreground rounded-xl px-4 py-3 text-sm outline-none border border-border focus:border-primary"
              />
              <button
                onClick={() => {
                  if (!customPhrase.trim()) { toast.error('Type a phrase first'); return; }
                  void mediumImpact();
                  setPhrase(customPhrase.trim());
                  setShowPhraseList(false);
                }}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Use
              </button>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">Or choose a preset</p>
          {PRESET_PHRASES.map((p) => (
            <button
              key={p}
              onClick={() => { void lightImpact(); setPhrase(p); setShowPhraseList(false); }}
              className={cn(
                'w-full text-left px-4 py-4 rounded-xl text-base font-medium transition-colors active:scale-[0.99]',
                phrase === p ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-muted text-foreground hover:bg-muted/70',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-background">
      <ConfigHeader title="Typing" onClose={onClose} />

      {/* SETUP — read-only example, no text field so the keyboard stays closed */}
      <div className={cn(setupScrollerClass, 'flex flex-col gap-4 pt-3')}>
        <MissionStage kind="typing" headline={phrase} sub={`Type it ${count} ${count === 1 ? 'time' : 'times'} to stop the alarm`} />

        <DifficultySlider value={difficulty} onChange={setDifficulty} />
        <CountPicker value={count} onChange={setCount} max={5} label="times" />

        <button
          onClick={() => { void lightImpact(); setShowPhraseList(true); }}
          className="w-full flex items-center justify-between bg-muted rounded-xl px-4 py-4 active:scale-[0.99] transition-transform"
        >
          <span className="text-foreground font-medium">Select phrase</span>
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">{PRESET_PHRASES.length} phrases</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </div>

      <ActionButtons
        onPreview={() => { setTypedCount(0); setPreviewInput(''); setPreviewDone(false); setPreviewing(true); }}
        onComplete={() => {
          onSave({ ...value, typingPhrase: phrase, count, difficulty });
          toast.success('Typing mission configured ✓');
          onClose();
        }}
      />

      {/* PREVIEW — full-screen challenge, keyboard opens here only */}
      {previewing && (
        <PreviewShell title="Typing challenge" onExit={exitPreview}>
          <TypingMission
            phrase={phrase}
            requiredCount={count}
            onComplete={() => { toast.success('Preview complete — alarm would dismiss ✓'); exitPreview(); }}
          />
        </PreviewShell>
      )}
    </div>

  );
}