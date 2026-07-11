import { Button } from '@/components/ui/button';
import { AccessibleDialog } from '@/components/feedback/AccessibleDialog';

export interface QualityOfferCardProps {
  open: boolean;
  title: string;
  body: string;
  continueLabel: string;
  endLabel: string;
  onContinue: () => void;
  onEnd: () => void;
}

export function QualityOfferCard({
  open,
  title,
  body,
  continueLabel,
  endLabel,
  onContinue,
  onEnd,
}: QualityOfferCardProps) {
  return (
    <AccessibleDialog
      open={open}
      title={title}
      description={body}
      onClose={onContinue}
    >
      <Button type="button" size="lg" className="w-full" onClick={onContinue}>
        {continueLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={onEnd}
      >
        {endLabel}
      </Button>
    </AccessibleDialog>
  );
}
