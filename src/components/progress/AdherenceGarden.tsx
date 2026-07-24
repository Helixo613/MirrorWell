import { strings } from '@/config/strings';
import type { PlantStage } from '@/screens/home/gardenData';

interface AdherenceGardenProps {
  weeks: PlantStage[];
}

const PLANTS: Record<PlantStage, string> = {
  0: 'M12 20v-3',
  1: 'M12 20v-8m0 4c-4 0-5-3-5-5 3 0 5 1 5 5',
  2: 'M12 20V9m0 7c-5 0-6-4-6-6 4 0 6 2 6 6m0-3c5 0 6-4 6-6-4 0-6 2-6 6',
  3: 'M12 20V9m0 4c-5 0-6-4-6-6 4 0 6 2 6 6m0-3c5 0 6-4 6-6-4 0-6 2-6 6m0-4c-3-4 3-4 0 0m0 0c3-4-3-4 0 0',
};

export function AdherenceGarden({ weeks }: AdherenceGardenProps) {
  const growingWeeks = weeks.filter((stage) => stage > 0).length;

  return (
    <section aria-label={strings.home.garden.label} className="rounded-2xl border bg-card p-5">
      <style>{`@keyframes garden-grow { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }`}</style>
      <p className="mb-4 text-sm font-medium text-muted-foreground">
        {strings.home.garden.title}
      </p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8" aria-label={strings.home.garden.ariaLabel(growingWeeks, weeks.length)}>
        {weeks.map((stage, index) => (
          <svg
            key={index}
            role="img"
            aria-label={strings.home.garden.weekAriaLabel(index + 1, stage)}
            className="motion-safe:animate-[garden-grow_400ms_ease-out_both] h-14 w-full text-primary"
            viewBox="0 0 24 24"
          >
            <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d={PLANTS[stage]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        ))}
      </div>
    </section>
  );
}
