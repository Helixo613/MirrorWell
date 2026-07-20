import { cn } from '@/lib/utils';

export interface PlainLanguageListProps {
  items: readonly string[];
  className?: string;
}

export function PlainLanguageList({ items, className }: PlainLanguageListProps) {
  return (
    <ul
      className={cn(
        'list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
