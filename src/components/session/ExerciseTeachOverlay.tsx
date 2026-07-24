import { Button } from '@/components/ui/button';

export interface ExerciseTeachOverlayProps {
  visible: boolean;
  title: string;
  body: string;
  steps: string;
  closeLabel: string;
  closeAriaLabel: string;
  onClose: () => void;
}

export function ExerciseTeachOverlay(props: ExerciseTeachOverlayProps) {
  if (!props.visible) return null;
  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-background/70 p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-teach-title"
    >
      <div className="w-full rounded-2xl border border-border bg-background p-5 shadow-xl sm:mx-auto sm:max-w-md">
        <div aria-hidden="true" className="mb-4 flex items-center justify-center gap-3">
          <span className="h-3 w-3 rounded-full bg-primary/40" />
          <span className="h-5 w-5 rounded-full border-4 border-primary" />
          <span className="h-3 w-3 rounded-full bg-primary/40" />
        </div>
        <h2 id="exercise-teach-title" className="text-xl font-semibold text-foreground">
          {props.title}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{props.body}</p>
        <p className="mt-3 text-base leading-relaxed text-foreground">{props.steps}</p>
        <Button
          type="button"
          size="lg"
          className="mt-5 w-full"
          aria-label={props.closeAriaLabel}
          onClick={props.onClose}
        >
          {props.closeLabel}
        </Button>
      </div>
    </div>
  );
}
