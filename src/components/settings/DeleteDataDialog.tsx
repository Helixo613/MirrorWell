import { useEffect, useId, useState } from 'react';
import { AccessibleDialog } from '@/components/feedback/AccessibleDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { strings } from '@/config/strings';

export interface DeleteDataDialogProps {
  open: boolean;
  phase: 'confirm' | 'deleting';
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteDataDialog({
  open,
  phase,
  onCancel,
  onConfirm,
}: DeleteDataDialogProps) {
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const token = strings.settings.delete.confirmToken;
  const canConfirm = typed === token && phase === 'confirm';

  useEffect(() => {
    if (!open) {
      setTyped('');
    }
  }, [open]);

  return (
    <AccessibleDialog
      open={open}
      title={strings.settings.delete.dialogTitle}
      description={strings.settings.delete.dialogBody}
      onClose={onCancel}
    >
      {phase === 'confirm' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={inputId}>{strings.settings.delete.confirmLabel}</Label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={strings.settings.delete.confirmPlaceholder}
              aria-describedby="delete-dialog-hint"
              onChange={(event) => setTyped(event.target.value)}
            />
            <p id="delete-dialog-hint" className="sr-only">
              {strings.settings.delete.confirmLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={!canConfirm}
            aria-label={strings.settings.delete.confirmButtonAriaLabel}
            onClick={onConfirm}
          >
            {strings.settings.delete.confirmButton}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            aria-label={strings.settings.delete.cancelAriaLabel}
            onClick={onCancel}
          >
            {strings.settings.delete.cancel}
          </Button>
        </>
      ) : (
        <p className="text-base text-muted-foreground" role="status" aria-live="polite">
          {strings.settings.delete.deleting}
        </p>
      )}
    </AccessibleDialog>
  );
}
