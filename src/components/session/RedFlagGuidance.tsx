import { Button } from '@/components/ui/button';
import { ScreenShell } from '@/components/layout/ScreenShell';

export interface RedFlagGuidanceProps {
  title: string;
  body: readonly string[];
  doneLabel: string;
  doneAriaLabel: string;
  textScale: number;
  onDone: () => void;
}

export function RedFlagGuidance({
  title,
  body,
  doneLabel,
  doneAriaLabel,
  textScale,
  onDone,
}: RedFlagGuidanceProps) {
  return (
    <ScreenShell textScale={textScale}>
      <article className="flex flex-1 flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        </header>
        <div className="space-y-4">
          {body.map((paragraph) => (
            <p
              key={paragraph}
              className="text-base leading-relaxed text-muted-foreground"
            >
              {paragraph}
            </p>
          ))}
        </div>
        <Button
          type="button"
          size="lg"
          className="mt-auto w-full"
          aria-label={doneAriaLabel}
          onClick={onDone}
        >
          {doneLabel}
        </Button>
      </article>
    </ScreenShell>
  );
}
