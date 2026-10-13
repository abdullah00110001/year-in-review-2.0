/** Mission-specific setup. Preview always mounts the same challenge used by the alarm. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, Camera, RefreshCw, Check, Minus, Plus, ChevronRight, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { isNative } from '@/lib/capacitor/platform';
import { cn } from '@/lib/utils';
import { MathMission } from './MathMission';
import { ShakeMission } from './ShakeMission';
import { BarcodeMission } from './BarcodeMission';
import { PhotoMission } from './PhotoMission';
import { TypingMission } from './TypingMission';
import { StepMission, requiredStepsFor } from './StepMission';
import { MissionStage, type MissionKind } from './MissionStage';

export type MissionDifficulty = 'easy' | 'medium' | 'hard';
export interface MissionConfig {
  difficulty: MissionDifficulty;
  count: number;
  targetBarcode?: string;
  photoLocation?: string;
  photoDataUrl?: string;
  typingPhrase?: string;
}
interface Props { missionId: string; value: MissionConfig; onSave: (cfg: MissionConfig) => void; onClose: () => void }
const titles: Record<MissionKind, string> = { math: 'Math', shake: 'Shake', steps: 'Steps', qr: 'QR / Barcode', photo: 'Photo', typing: 'Typing' };
const phrases = ['Keep shining', 'I am ready for today', 'Rise and conquer', 'Every morning is a fresh start', 'Bismillah', 'Alhamdulillah for today', 'Make today count', 'I choose to be productive', 'بسم الله الرحمن الرحيم', 'আজকে আমি সেরাটা দেব'];
const inputClass = 'w-full min-w-0 rounded-lg border border-border bg-muted px-3 py-3 text-sm text-foreground outline-none focus:border-primary';

export function MissionConfigRouter(props: Props) {
  const alias = props.missionId === 'barcode' ? 'qr' : props.missionId === 'walking' ? 'steps' : props.missionId;
  if (!(alias in titles)) return null;
  return createPortal(<MissionSetup key={alias} {...props} kind={alias as MissionKind} />, document.querySelector('[data-rise-editor-host]') ?? document.body);
}

function MissionSetup({ kind, value, onSave, onClose }: Props & { kind: MissionKind }) {
  const [cfg, setCfg] = useState<MissionConfig>(() => ({ ...value, difficulty: value.difficulty ?? 'medium', count: Math.max(1, Math.min(kind === 'typing' ? 5 : 10, value.count || 1)), typingPhrase: value.typingPhrase || phrases[0] }));
  const [preview, setPreview] = useState(false);
  const [phraseList, setPhraseList] = useState(false);
  const [customPhrase, setCustomPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const patch = (partial: Partial<MissionConfig>) => setCfg(previous => ({ ...previous, ...partial }));
  const exit = () => { if (preview) setPreview(false); else if (phraseList) setPhraseList(false); else onClose(); };
  // Keep native back and browser Escape inside the current setup layer.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exit(); } };
    document.addEventListener('keydown', onKey, true);
    let cancelled = false;
    let remove: (() => void) | undefined;
    if (isNative) void import('@capacitor/app').then(({ App }) => App.addListener('backButton', exit)).then(handle => { if (cancelled) void handle.remove(); else remove = () => { void handle.remove(); }; });
    return () => { document.removeEventListener('keydown', onKey, true); cancelled = true; remove?.(); };
  }, [preview, phraseList, onClose]);

  const totalShakes = cfg.count * (cfg.difficulty === 'easy' ? 5 : cfg.difficulty === 'hard' ? 15 : 10);
  const totalSteps = requiredStepsFor(cfg.count, cfg.difficulty);
  const ready = kind === 'qr' ? Boolean(cfg.targetBarcode?.trim()) : kind === 'photo' ? Boolean(cfg.photoDataUrl) : kind === 'typing' ? Boolean(cfg.typingPhrase?.trim()) : true;
  const finished = () => { if (alive.current) { setPreview(false); toast.success('Preview complete'); } };
  const registerCode = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { scanBarcode } = await import('@/lib/capacitor/barcodeScannerBridge');
      const result = await scanBarcode();
      if (!alive.current) return;
      if (result.success && result.value) patch({ targetBarcode: result.value.trim() });
      else if (result.error !== 'cancelled') toast.error('Could not scan the code. Try again.');
    } catch { if (alive.current) toast.error('Could not open the scanner.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const capturePhoto = async () => {
    if (!isNative) { fileRef.current?.click(); return; }
    if (busy) return;
    setBusy(true);
    try {
      const { Camera: NativeCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const result = await NativeCamera.getPhoto({ quality: 70, resultType: CameraResultType.DataUrl, source: CameraSource.Camera, allowEditing: false, saveToGallery: false });
      if (alive.current && result.dataUrl) patch({ photoDataUrl: result.dataUrl });
    } catch (error) { if (alive.current && !/cancel/i.test(String(error))) toast.error('Camera unavailable. Check camera permission and try again.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const headline = kind === 'math' ? `${cfg.count} ${cfg.count === 1 ? 'problem' : 'problems'}` : kind === 'shake' ? `${totalShakes} shakes` : kind === 'steps' ? `${totalSteps} steps` : kind === 'typing' ? cfg.typingPhrase || phrases[0] : kind === 'photo' ? 'Your morning spot' : cfg.targetBarcode ? 'Code registered' : 'Find your morning code';
  const a = cfg.difficulty === 'easy' ? 4 + example % 5 : cfg.difficulty === 'hard' ? 7 + example % 4 : 24 + example % 20;
  const b = cfg.difficulty === 'easy' ? 3 : cfg.difficulty === 'hard' ? 8 : 17;
  const per = cfg.difficulty === 'easy' ? 120 : cfg.difficulty === 'hard' ? 30 : 60;

  return <div data-mission-setup={kind} className="fixed inset-0 z-[99999] flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <Button type="button" variant="ghost" size="icon" aria-label={preview ? 'Exit preview' : phraseList ? 'Back' : 'Close mission'} onClick={exit} className="h-11 w-11 shrink-0 rounded-full bg-muted">
        {preview ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
      </Button>
      <div className="min-w-0"><h2 className="text-lg font-bold">{phraseList ? 'Choose your phrase' : titles[kind]}</h2><p className="text-xs text-muted-foreground">{preview ? 'Preview' : 'Wake-up mission'}</p></div>
      {!preview && !phraseList && <span className="ml-auto text-xs font-semibold text-primary">{kind === 'qr' || kind === 'photo' ? ready ? 'Registered' : 'Not registered' : `${cfg.count} ${cfg.count === 1 ? 'round' : 'rounds'}`}</span>}
    </header>
    {preview ? <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
      {kind === 'math' && <MathMission difficulty={cfg.difficulty} requiredSolves={cfg.count} perProblemSeconds={per} onComplete={finished} />}
      {kind === 'shake' && <ShakeMission requiredShakes={totalShakes} onComplete={finished} />}
      {kind === 'steps' && <StepMission requiredSteps={totalSteps} onComplete={finished} />}
      {kind === 'qr' && <BarcodeMission targetBarcode={cfg.targetBarcode || ''} onComplete={finished} />}
      {kind === 'photo' && <PhotoMission registeredPlace={cfg.photoLocation || 'your morning spot'} registeredPhotoUrl={cfg.photoDataUrl} onComplete={finished} />}
      {kind === 'typing' && <TypingMission phrase={cfg.typingPhrase} requiredCount={cfg.count} difficulty={cfg.difficulty} onComplete={finished} />}
    </div> : phraseList ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <label htmlFor="custom-mission-phrase" className="mb-2 block text-sm font-bold">Your own phrase</label>
      <div className="mb-6 flex gap-2"><input id="custom-mission-phrase" maxLength={160} className={inputClass} value={customPhrase} onChange={e => setCustomPhrase(e.target.value)} placeholder="A fresh start begins today" /><Button disabled={!customPhrase.trim()} onClick={() => { patch({ typingPhrase: customPhrase.trim() }); setPhraseList(false); }}>Use</Button></div>
      <div className="divide-y divide-border">{phrases.map(phrase => <Button key={phrase} variant="ghost" onClick={() => { patch({ typingPhrase: phrase }); setPhraseList(false); }} className={cn('h-auto min-h-14 w-full justify-between whitespace-normal rounded-none px-0 py-4 text-left', cfg.typingPhrase === phrase && 'text-primary')}><span className="min-w-0 break-words">{phrase}</span>{cfg.typingPhrase === phrase && <Check className="ml-3 h-5 w-5 shrink-0" />}</Button>)}</div>
    </div> : <>
      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-6">
        {kind === 'photo' ? <section className="py-5">
          <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
            {cfg.photoDataUrl ? <img src={cfg.photoDataUrl} alt="Registered morning spot" className="h-full w-full object-cover" /> : <MissionStage kind="photo" headline="Your morning spot" />}
            <Button aria-label="Capture reference photo" size="icon" disabled={busy} onClick={capturePhoto} className="absolute bottom-3 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full border-4 border-background"><Camera className="h-6 w-6" /></Button>
          </div>
          <p className="mt-3 text-center text-sm font-semibold">{cfg.photoDataUrl ? 'Morning spot registered' : 'No reference photo yet'}</p>
          <label htmlFor="mission-location" className="mb-2 mt-5 block text-sm font-bold">Location name</label><input id="mission-location" className={inputClass} value={cfg.photoLocation || ''} onChange={e => patch({ photoLocation: e.target.value })} placeholder="Bathroom sink" />
        </section> : <MissionStage kind={kind} target={kind === 'steps' ? totalSteps : totalShakes} headline={headline} sub={kind === 'math' ? `${per} seconds per problem` : kind === 'typing' ? `${cfg.count} ${cfg.count === 1 ? 'repetition' : 'repetitions'}` : undefined}>
          {kind === 'math' && <div className="w-full border-b border-border pb-5 text-center"><p className="text-xs font-bold uppercase text-muted-foreground">Morning warm-up</p><p className="my-4 text-4xl font-black tabular-nums">{a} {cfg.difficulty === 'hard' ? '×' : '+'} {b} <span className="text-primary">= ?</span></p><Button variant="ghost" size="sm" onClick={() => setExample(n => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />New example</Button></div>}
        </MissionStage>}
        {(kind === 'math' || kind === 'shake' || kind === 'steps') && <DifficultyPicker value={cfg.difficulty} onChange={difficulty => patch({ difficulty })} labels={kind === 'math' ? ['Addition', 'Mixed sums', 'Multiply'] : kind === 'steps' ? ['10 / round', '20 / round', '40 / round'] : ['5 / round', '10 / round', '15 / round']} />}
        {kind !== 'qr' && kind !== 'photo' && <CountPicker value={cfg.count} max={kind === 'typing' ? 5 : 10} onChange={count => patch({ count })} label={kind === 'math' ? 'Problems' : kind === 'typing' ? 'Repetitions' : 'Rounds'} />}
        {kind === 'steps' && <div className="mt-3 flex items-center justify-between border-t border-border py-4"><span className="text-sm text-muted-foreground">Walking target</span><span className="text-lg font-black text-primary">{totalSteps} steps</span></div>}
        {kind === 'shake' && <div className="mt-3 flex items-center justify-between border-t border-border py-4"><span className="text-sm text-muted-foreground">Movement target</span><span className="text-lg font-black text-primary">{totalShakes} shakes</span></div>}
        {kind === 'typing' && <>
          <Button variant="ghost" onClick={() => setPhraseList(true)} className="my-3 h-14 w-full justify-between rounded-lg bg-muted px-4"><span>Change phrase</span><ChevronRight className="h-5 w-5" /></Button>
          <label className="flex items-center justify-between gap-4 border-t border-border py-4"><span className="text-sm font-semibold">Match capital letters</span><Switch checked={cfg.difficulty === 'hard'} onCheckedChange={checked => patch({ difficulty: checked ? 'hard' : 'easy' })} aria-label="Match capital letters" /></label>
        </>}
        {kind === 'qr' && <div className="border-t border-border py-4">
          <label htmlFor="mission-code" className="mb-2 block text-sm font-bold">{isNative ? 'Registered code' : 'Barcode value'}</label>
          <input id="mission-code" className={cn(inputClass, 'font-mono')} value={cfg.targetBarcode || ''} readOnly={isNative} onChange={e => patch({ targetBarcode: e.target.value })} placeholder="Enter the code on your morning item" />
          {isNative && <Button variant="outline" disabled={busy} onClick={registerCode} className="mt-3 h-12 w-full">{busy ? 'Opening scanner…' : cfg.targetBarcode ? 'Scan another code' : 'Scan a code'}</Button>}
        </div>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
          const file = e.target.files?.[0]; if (!file) return;
          if (!file.type.startsWith('image/')) { toast.error('Choose an image file.'); return; }
          const reader = new FileReader(); reader.onerror = () => toast.error('Could not read this photo.');
          reader.onload = () => { if (alive.current && typeof reader.result === 'string') patch({ photoDataUrl: reader.result }); }; reader.readAsDataURL(file); e.target.value = '';
        }} />
      </main>
      <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <Button variant="outline" disabled={!ready || busy} onClick={() => setPreview(true)} className="h-12"><Play className="mr-2 h-4 w-4" />Preview</Button>
        <Button disabled={!ready || busy} onClick={() => { onSave({ ...cfg, targetBarcode: cfg.targetBarcode?.trim(), typingPhrase: cfg.typingPhrase?.trim() }); onClose(); }} className="h-12"><Save className="mr-2 h-4 w-4" />Save</Button>
      </footer>
    </>}
  </div>;
}

function DifficultyPicker({ value, onChange, labels }: { value: MissionDifficulty; onChange: (value: MissionDifficulty) => void; labels: string[] }) {
  return <section className="border-t border-border py-4"><h3 className="mb-3 text-sm font-bold">Difficulty</h3><div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">{(['easy', 'medium', 'hard'] as const).map((level, i) => <Button key={level} role="radio" aria-checked={level === value} variant={level === value ? 'default' : 'outline'} onClick={() => onChange(level)} className="h-auto min-w-0 flex-col gap-1 whitespace-normal rounded-lg px-1 py-3"><span className="text-sm capitalize">{level}</span><span className="text-[10px] opacity-80">{labels[i]}</span></Button>)}</div></section>;
}
function CountPicker({ value, max, onChange, label }: { value: number; max: number; onChange: (value: number) => void; label: string }) {
  return <section className="border-t border-border py-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{label}</h3><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Fewer rounds" disabled={value <= 1} onClick={() => onChange(value - 1)} className="h-11 w-11 rounded-full"><Minus className="h-4 w-4" /></Button><output className="w-8 text-center text-2xl font-black tabular-nums text-primary">{value}</output><Button variant="outline" size="icon" aria-label="More rounds" disabled={value >= max} onClick={() => onChange(value + 1)} className="h-11 w-11 rounded-full"><Plus className="h-4 w-4" /></Button></div></div><div aria-hidden="true" className="mt-4 flex h-1.5 gap-1">{Array.from({ length: max }, (_, i) => <span key={i} className={cn('min-w-0 flex-1 rounded-full', i < value ? 'bg-primary' : 'bg-muted')} />)}</div></section>;
}
