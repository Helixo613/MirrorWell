import { strings } from '@/config/strings';
import type { PlantStage } from '@/screens/home/gardenData';
import { cn } from '@/lib/utils';

interface AdherenceGardenProps {
  weeks: PlantStage[];
}

function PlantIllustration({ stage }: { stage: PlantStage }) {
  return (
    <svg aria-hidden="true" className="h-20 w-full" viewBox="0 0 80 88">
      <ellipse className="fill-primary/10" cx="40" cy="75" rx="28" ry="7" />
      <path
        className="fill-primary/20"
        d="M17 73c8-6 38-6 46 0-7 8-39 8-46 0Z"
      />

      {stage === 0 ? (
        <>
          <path
            className="fill-primary/70"
            d="M35 65c0-7 5-11 12-9 0 7-5 11-12 9Z"
          />
          <path
            className="stroke-primary/40"
            d="M40 65v7"
            fill="none"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            className="stroke-primary"
            d={stage === 1 ? 'M40 72V45' : 'M40 72V27'}
            fill="none"
            strokeLinecap="round"
            strokeWidth="3"
          />
          <path
            className="fill-primary/75"
            d="M39 56c-12 1-18-5-17-15 11-1 17 5 17 15Zm2-3c11 0 17-6 16-16-10 0-16 6-16 16Z"
          />
          {stage >= 2 ? (
            <path
              className="fill-primary/55"
              d="M39 42c-9 0-14-5-13-13 8 0 13 5 13 13Zm2-4c9 0 14-5 13-13-8 0-13 5-13 13Z"
            />
          ) : null}
          {stage === 3 ? (
            <>
              <circle className="fill-card stroke-primary" cx="40" cy="20" r="7" strokeWidth="2" />
              <path
                className="fill-primary/20 stroke-primary"
                d="M40 13c-7-13-15-2-7 3-14-1-10 12-1 8-5 12 9 13 10 3 9 9 17-2 8-7 12-7 5-19-4-10-1-13-10-11-10 3Z"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
              <circle className="fill-primary" cx="40" cy="20" r="3" />
            </>
          ) : null}
        </>
      )}
    </svg>
  );
}

export function AdherenceGarden({ weeks }: AdherenceGardenProps) {
  const growingWeeks = weeks.filter((stage) => stage > 0).length;

  return (
    <section
      aria-label={strings.home.garden.label}
      className="overflow-hidden rounded-2xl border bg-secondary/30 p-sm sm:p-md"
    >
      <div className="mb-md flex flex-wrap items-end justify-between gap-sm">
        <div>
          <h2 className="text-xl font-medium tracking-tight">
            {strings.home.garden.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {strings.home.garden.subtitle}
          </p>
        </div>
        <p className="rounded-full border bg-card/70 px-3 py-1 text-sm text-muted-foreground">
          {strings.home.garden.growingWeeks(growingWeeks)}
        </p>
      </div>

      <div
        className="grid gap-xs [grid-template-columns:repeat(auto-fit,minmax(min(100%,4.5rem),1fr))]"
        aria-label={strings.home.garden.ariaLabel(growingWeeks, weeks.length)}
      >
        {weeks.map((stage, index) => (
          <figure
            key={index}
            aria-label={strings.home.garden.weekAriaLabel(index + 1, stage)}
            className={cn(
              'motion-safe:animate-fade-in rounded-xl border bg-card/80 px-2 pb-3 pt-2 text-center',
              index === weeks.length - 1 && 'border-primary/30 bg-card',
            )}
          >
            <PlantIllustration stage={stage} />
            <figcaption className="space-y-0.5">
              <span className="block text-xs font-medium text-muted-foreground">
                {strings.home.garden.weekLabel(index + 1)}
              </span>
              <span className="block text-sm font-medium text-primary">
                {strings.home.garden.stageLabel(stage)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
