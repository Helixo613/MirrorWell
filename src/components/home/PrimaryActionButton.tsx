import type { ButtonHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PrimaryActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function PrimaryActionButton({
  label,
  className,
  ...props
}: PrimaryActionButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      className={cn('w-full font-medium shadow-sm', className)}
      {...props}
    >
      {label}
    </Button>
  );
}
