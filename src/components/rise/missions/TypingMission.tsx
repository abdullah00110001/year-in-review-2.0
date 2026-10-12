/**
 * TypingMission — alarm ring সময়ে দেখায়।
 * User কে registered phrase N বার type করতে হবে।
 */
import { useState, useRef } from 'react';
import { Type, Check } from 'lucide-react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from '@/lib/capacitor/platform';
import { toast } from 'sonner';

interface TypingMissionProps {
  onComplete: () => void;
  phrase?: string;
  requiredCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export function TypingMission({
  onComplete,
  phrase = 'I am ready for today',
  requiredCount = 1,
  difficulty = 'easy',
}: TypingMissionProps) {
  const [input,       setInput]       = useState('');
  const [doneCount,   setDoneCount]   = useState(0);
  const [isError,     setIsError]     = useState(false);
  const [isSuccess,   setIsSuccess]   = useState(false);
  const inputRef                       = useRef<HTMLInputElement>(null);

  const progress = (doneCount / requiredCount) * 100;
  const remaining = requiredCount - doneCount;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setIsError(false);

    if (isSuccess) return;
    if (difficulty === 'hard' ? val === phrase : val.toLowerCase() === phrase.toLowerCase()) {
      const next = doneCount + 1;
      setDoneCount(next);
      setInput('');

      if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});

      if (next >= requiredCount) {
        setIsSuccess(true);
        if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        toast.success('Mission complete! ☀️');
        setTimeout(() => onComplete(), 600);
      } else {
        toast.success(`${next}/${requiredCount} ✓`);
      }
    } else if (val.length > phrase.length) {
      // Typed more than phrase — shake error
      setIsError(true);
      if (isNative) Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      setTimeout(() => {
        setIsError(false);
        setInput('');
      }, 500);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col min-h-full shrink-0 items-center justify-center bg-background text-foreground p-6">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-pulse">
          <Check className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Done! Rise and shine ☀️</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full shrink-0 bg-background text-foreground">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <div className="p-3 bg-primary/20 rounded-2xl">
          <Type className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Typing Mission</h2>
        <div className="ml-auto text-sm font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
          {doneCount}/{requiredCount}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 mb-6">
        <div className="h-1.5 bg-muted/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">

        {/* Phrase to type */}
        <div className="w-full bg-muted/5 rounded-2xl p-6 border border-border/10">
          <p className="text-foreground/40 text-xs text-center uppercase tracking-widest mb-3">
            Type this phrase
          </p>
          <p className="text-foreground text-2xl font-bold text-center leading-relaxed">
            {phrase}
          </p>
          {remaining > 0 && (
            <p className="text-foreground/30 text-xs text-center mt-3">
              {remaining} time{remaining !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>

        {/* Input */}
        <div className="w-full">
          <div className={`
            rounded-2xl border-2 overflow-hidden transition-all duration-150
            ${isError ? 'border-destructive bg-destructive/10' : input ? 'border-primary bg-primary/5' : 'border-border/10 bg-muted/5'}
          `}>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={handleChange}
              placeholder="Start typing..."
              className="w-full bg-transparent text-foreground text-xl font-medium px-5 py-4 outline-none placeholder:text-foreground/20"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          {/* Character progress hint */}
          {input.length > 0 && (
            <div className="mt-2 flex gap-0.5 px-1">
              {phrase.split('').map((char, i) => {
                const typedChar = input[i];
                const correct   = typedChar?.toLowerCase() === char.toLowerCase();
                const typed     = i < input.length;
                return (
                  <div
                    key={i}
                    className={`h-0.5 flex-1 rounded-full transition-colors ${
                      !typed ? 'bg-muted/10' : correct ? 'bg-primary' : 'bg-destructive'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Completed rounds */}
        {doneCount > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: requiredCount }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i < doneCount ? 'bg-primary' : 'bg-muted/10'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
