import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { scanBarcode, isBarcodeMismatch, isScanCancelled } from '@/lib/capacitor/barcodeScannerBridge';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from '@/lib/capacitor/platform';

interface BarcodeMissionProps {
  onComplete: () => void;
  targetBarcode: string;
}

type ScanState = 'idle' | 'scanning' | 'success' | 'mismatch' | 'error';

export function BarcodeMission({ onComplete, targetBarcode }: BarcodeMissionProps) {
  const [scanState, setScanState]   = useState<ScanState>('idle');
  const [errorMsg,  setErrorMsg]    = useState<string>('');
  const [attempts,  setAttempts]    = useState(0);

  // Auto-start scan on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      startScan();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const startScan = async () => {
    if (scanState === 'scanning') return;

    setScanState('scanning');
    setErrorMsg('');

    try {
      const result = await scanBarcode(targetBarcode);

      if (result.success) {
        // ✅ Success
        setScanState('success');
        if (isNative) {
          await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        }
        // 800ms delay — user কে success দেখতে দাও
        setTimeout(() => {
          onComplete();
        }, 800);

      } else if (isScanCancelled(result.error)) {
        // User cancel করেছে — idle এ ফিরে যাও
        setScanState('idle');

      } else if (isBarcodeMismatch(result.error)) {
        // Wrong barcode
        setScanState('mismatch');
        setAttempts(prev => prev + 1);
        if (isNative) {
          await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
        }
        // 2s পরে আবার scan করতে দাও
        setTimeout(() => setScanState('idle'), 2000);

      } else {
        // Other error
        setScanState('error');
        setErrorMsg(result.error ?? 'Scan failed');
        setTimeout(() => setScanState('idle'), 2000);
      }

    } catch (e: any) {
      setScanState('error');
      setErrorMsg(e?.message ?? 'Unexpected error');
      setTimeout(() => setScanState('idle'), 2000);
    }
  };

  // ──────────────────────────────────────────
  // UI States
  // ──────────────────────────────────────────

  if (scanState === 'success') {
    return (
      <div className="flex flex-col min-h-full shrink-0 items-center justify-center bg-background text-foreground p-6">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-pulse">
          <span className="text-5xl">✅</span>
        </div>
        <h2 className="text-2xl font-bold text-primary">Barcode Scanned!</h2>
        <p className="text-foreground/60 mt-2">Mission complete!</p>
      </div>
    );
  }

  if (scanState === 'mismatch') {
    return (
      <div className="flex flex-col min-h-full shrink-0 items-center justify-center bg-background text-foreground p-6">
        <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
          <span className="text-5xl">❌</span>
        </div>
        <h2 className="text-2xl font-bold text-destructive">Wrong Barcode!</h2>
        <p className="text-foreground/60 mt-2 text-center">
          This is not the correct barcode.{'\n'}Please scan the right one.
        </p>
        <p className="text-foreground/30 mt-4 text-sm">Attempts: {attempts}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full shrink-0 bg-background text-foreground">

      {/* Header */}
      <div className="flex flex-col items-center pt-6 pb-8 px-6">
        <div className={`w-24 h-24 rounded-2xl mb-6 flex items-center justify-center
          ${scanState === 'scanning'
            ? 'bg-primary/20 animate-pulse'
            : 'bg-muted'
          }`}>
          <span className="text-5xl">
            {scanState === 'scanning' ? '📷' : '📱'}
          </span>
        </div>

        <h2 className="text-2xl font-bold mb-2">
          {scanState === 'scanning' ? 'Scanner Opening...' : 'Barcode Mission'}
        </h2>

        <p className="text-foreground/60 text-center text-sm leading-relaxed">
          {scanState === 'scanning'
            ? 'Point camera at the barcode'
            : 'Scan the required barcode to dismiss alarm'}
        </p>

        {/* Target barcode hint */}
        {targetBarcode && targetBarcode !== 'WAKE-UP' && (
          <div className="mt-4 px-4 py-2 bg-muted rounded-xl border border-border/10">
            <p className="text-foreground/40 text-xs text-center">Target barcode</p>
            <p className="text-foreground/80 text-sm font-mono text-center mt-1">
              {targetBarcode}
            </p>
          </div>
        )}

        {/* Error message */}
        {scanState === 'error' && errorMsg && (
          <div className="mt-4 px-4 py-2 bg-destructive/10 rounded-xl border border-destructive/20">
            <p className="text-destructive text-sm text-center">{errorMsg}</p>
          </div>
        )}

        {/* Attempt counter */}
        {attempts > 0 && (
          <p className="mt-3 text-foreground/30 text-xs">
            Failed attempts: {attempts}
          </p>
        )}
      </div>

      {/* Scan button */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">

        {/* Viewfinder decoration */}
        <div className="relative w-56 h-56 mb-4">
          {/* Corner borders */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg" />

          {/* Center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl opacity-20">
              {scanState === 'scanning' ? '🔍' : '▢'}
            </span>
          </div>

          {/* Scan line animation */}
          {scanState === 'scanning' && (
            <div className="absolute left-2 right-2 h-0.5 bg-primary/60 animate-bounce"
                 style={{ top: '50%' }} />
          )}
        </div>

        {/* Scan button */}
        <Button
          onClick={startScan}
          disabled={scanState === 'scanning'}
          className="w-full h-14 bg-primary hover:bg-primary disabled:opacity-50
                     rounded-2xl text-lg font-bold text-slate-950 shadow-lg
                     active:scale-95 transition-transform"
        >
          {scanState === 'scanning'
            ? '📷 Scanner Opening...'
            : attempts > 0
              ? '🔄 Try Again'
              : '📷 Open Scanner'}
        </Button>

        <p className="text-foreground/30 text-xs text-center px-8">
          The scanner will open automatically.{'\n'}
          Point at your barcode to complete the mission.
        </p>
      </div>
    </div>
  );
}
