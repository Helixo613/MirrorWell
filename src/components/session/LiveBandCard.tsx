import { useEffect, useMemo, useState } from 'react';
import { fetchLive } from '@/companion/companionApi';
import { liveView, startPolling, type LiveBandView, type LiveSnapshot } from '@/companion/liveBand';
import { strings } from '@/config/strings';
import { cn } from '@/lib/utils';

/** Polls /api/companion/live while `active`. Failures only ever show "Band offline". */
export function useLiveBand(active: boolean): LiveBandView {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    const poller = startPolling<LiveSnapshot>({
      fetchOnce: fetchLive,
      onValue: setSnap,
      onError: () => setSnap(null),
    });
    return () => poller.stop();
  }, [active]);
  return useMemo(() => liveView(snap), [snap]);
}

export function LiveBandCardView({ view, className }: { view: LiveBandView; className?: string }) {
  const b = strings.bandCard;
  const beating = view.beatIntervalMs !== null;
  return (
    <section
      aria-label={b.label}
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-card/95 px-3 py-2 text-sm shadow-sm',
        className,
      )}
    >
      {view.offline ? (
        <p className="text-muted-foreground">{b.offline}</p>
      ) : (
        <>
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            {view.cueAtMs !== null ? (
              <span
                key={view.cueAtMs}
                aria-hidden="true"
                className="band-cue-pulse absolute inset-0 rounded-full bg-primary/40"
              />
            ) : null}
            <svg
              role="img"
              aria-label={beating ? b.heartAriaLabel : b.heartQuiet}
              viewBox="0 0 24 24"
              className={cn(
                'relative h-5 w-5 text-primary',
                beating ? 'band-heart-beating' : 'opacity-30',
              )}
              style={beating ? { animationDuration: `${view.beatIntervalMs}ms` } : undefined}
            >
              <path
                fill="currentColor"
                d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.4 1.1 4.1 2.3h3C14.2 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21Z"
                transform="translate(0 -1)"
              />
            </svg>
          </span>
          <span
            role="img"
            aria-label={b.signalAriaLabel(view.signal)}
            className="inline-flex items-end gap-0.5"
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                aria-hidden="true"
                className={cn('w-1 rounded-sm bg-foreground', n <= view.signal ? '' : 'opacity-20')}
                style={{ height: `${n * 5 + 3}px` }}
              />
            ))}
          </span>
          {view.steadinessLabel ? <span className="font-medium">{view.steadinessLabel}</span> : null}
          {view.settlingLabel ? <span className="font-medium">{view.settlingLabel}</span> : null}
          {view.reason ? (
            <span className="basis-full text-muted-foreground" role="status">
              {view.reason}
            </span>
          ) : null}
          {view.duringCueHint ? (
            <span className="basis-full text-xs text-muted-foreground">{view.duringCueHint}</span>
          ) : null}
        </>
      )}
    </section>
  );
}

export function LiveBandCard({ active, className }: { active: boolean; className?: string }) {
  const view = useLiveBand(active);
  if (!active) return null;
  return <LiveBandCardView view={view} className={className} />;
}
