import { Button } from '@/components/ui/button';
import { AccessibleDialog } from '@/components/feedback/AccessibleDialog';

export interface StopConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  justStopLabel: string;
  justStopAriaLabel: string;
  feltWrongLabel: string;
  feltWrongAriaLabel: string;
  cancelLabel: string;
  cancelAriaLabel: string;
  onJustStop: () => void;
  onFeltWrong: () => void;
  onCancel: () => void;
}

export function StopConfirmDialog({
  open,
  title,
  body,
  justStopLabel,
  justStopAriaLabel,
  feltWrongLabel,
  feltWrongAriaLabel,
  cancelLabel,
  cancelAriaLabel,
  onJustStop,
  onFeltWrong,
  onCancel,
}: StopConfirmDialogProps) {
  return (
    <AccessibleDialog
      open={open}
      title={title}
      description={body}
      onClose={onCancel}
    >
      <Button
        type="button"
        size="lg"
        className="w-full"
        aria-label={justStopAriaLabel}
        onClick={onJustStop}
      >
        {justStopLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="w-full"
        aria-label={feltWrongAriaLabel}
        onClick={onFeltWrong}
      >
        {feltWrongLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="w-full"
        aria-label={cancelAriaLabel}
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </AccessibleDialog>
  );
}
