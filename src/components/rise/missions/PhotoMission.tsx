/**
 * PhotoMission — alarm ring সময়ে দেখায়।
 *
 * Fix 1: Android 13+ permission loop — CameraSource.Photos এর বদলে Camera use করো
 * Fix 2: Reference photo (registeredPhotoUrl) থাকলে side-by-side দেখাও
 */
import { useState, useRef } from 'react';
import { Camera, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNative } from '@/lib/capacitor/platform';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PhotoMissionProps {
  onComplete:            () => void;
  registeredPlace?:      string;
  registeredPhotoUrl?:   string;   // ← reference photo from mission_config.photoDataUrl
}

export function PhotoMission({
  onComplete,
  registeredPlace    = 'your morning spot',
  registeredPhotoUrl,
}: PhotoMissionProps) {
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [confirming,  setConfirming]  = useState(false);
  const [capturing,   setCapturing]   = useState(false);
  const fileRef                        = useRef<HTMLInputElement>(null);

  const takePhoto = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      if (isNative) {
        // ✅ Fix: CameraSource.Camera — Android 13+ permission loop নেই
        const photo = await CapCamera.getPhoto({
          quality:       70,
          resultType:    CameraResultType.DataUrl,
          source:        CameraSource.Camera,   // ← Photos এর বদলে Camera
          allowEditing:  false,
          saveToGallery: false,
        });
        if (photo.dataUrl) {
          setPhotoUri(photo.dataUrl);
          setConfirming(true);
        }
      } else {
        fileRef.current?.click();
      }
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/cancel|user cancel/i.test(msg)) return; // silent
      toast.error('Camera failed to open');
    } finally {
      setCapturing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUri(reader.result as string);
      setConfirming(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirm = () => {
    toast.success('Photo verified! Good morning ☀️');
    setTimeout(() => onComplete(), 400);
  };

  /* ── Confirmation screen ── */
  if (confirming && photoUri) {
    return (
      <div className="flex flex-col min-h-full shrink-0 bg-background text-foreground p-6">
        <div className="flex items-center gap-3 mb-6 mt-4">
          <div className="p-3 bg-primary/20 rounded-2xl">
            <Camera className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Confirm photo</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4">

          {/* Side-by-side if reference photo exists */}
          {registeredPhotoUrl ? (
            <div className="flex gap-3 w-full">
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-foreground/40 text-xs text-center">Reference</p>
                <div className="rounded-2xl overflow-hidden aspect-square">
                  <img src={registeredPhotoUrl} alt="Reference" className="w-full h-full object-cover opacity-70" />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-foreground/40 text-xs text-center">Your photo</p>
                <div className="rounded-2xl overflow-hidden aspect-square border-2 border-primary">
                  <img src={photoUri} alt="Captured" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-xs break-words rounded-2xl overflow-hidden aspect-square border border-border/10">
              <img src={photoUri} alt="Captured" className="w-full h-full object-cover" />
            </div>
          )}

          <p className="text-foreground/60 text-sm text-center max-w-xs break-words">
            Does this look like <span className="font-semibold text-primary">{registeredPlace}</span>?
          </p>
        </div>

        <div className="space-y-3 pb-4">
          <Button
            onClick={confirm}
            className="w-full h-14 bg-primary hover:bg-primary text-foreground rounded-2xl text-lg font-semibold flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-5 w-5" />
            Yes, dismiss alarm
          </Button>
          <Button
            onClick={() => { setPhotoUri(null); setConfirming(false); }}
            className="w-full h-12 text-foreground/60 flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Retake
          </Button>
        </div>
      </div>
    );
  }

  /* ── Main screen ── */
  return (
    <div className="flex flex-col min-h-full shrink-0 bg-background text-foreground p-6">
      <div className="flex items-center gap-3 mb-8 mt-4">
        <div className="p-3 bg-primary/20 rounded-2xl">
          <Camera className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Photo Mission</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">

        {/* Reference photo preview (small, top) */}
        {registeredPhotoUrl && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-foreground/40 text-xs uppercase tracking-widest">Reference photo</p>
            <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary/40">
              <img src={registeredPhotoUrl} alt="Reference" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        <div className="h-40 w-40 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Camera className="h-16 w-16 text-primary" />
        </div>

        <div>
          <h3 className="text-2xl font-bold mb-2">Get out of bed!</h3>
          <p className="text-foreground/50 text-sm max-w-xs break-words">
            Walk to your{' '}
            <span className="text-primary font-semibold">{registeredPlace}</span>
            {' '}and take a photo to dismiss the alarm.
          </p>
        </div>
      </div>

      <div className="pb-4">
        <Button
          onClick={takePhoto}
          disabled={capturing}
          className="w-full h-14 bg-primary hover:bg-primary disabled:opacity-50 text-foreground rounded-2xl text-lg font-semibold flex items-center justify-center gap-2"
        >
          <Camera className="h-5 w-5" />
          {capturing ? 'Opening camera...' : 'Open Camera'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
