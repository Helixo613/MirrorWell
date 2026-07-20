import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AccessibleDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function AccessibleDialog({
  open,
  title,
  description,
  onClose,
  children,
  className,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="accessible-dialog-title"
      aria-describedby={description ? 'accessible-dialog-desc' : undefined}
      className={cn(
        'fixed inset-0 z-50 m-auto w-[min(100%-2rem,24rem)] max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg backdrop:bg-black/40 open:motion-safe:animate-fade-in',
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <h2
        id="accessible-dialog-title"
        className="text-lg font-semibold text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p
          id="accessible-dialog-desc"
          className="mt-2 text-base leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">{children}</div>
    </dialog>
  );
}
