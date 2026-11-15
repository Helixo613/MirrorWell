import { useEffect, useState } from 'react';
import { fetchSummary } from '@/companion/companionApi';
import { pollSummary, type SummaryView } from '@/companion/liveBand';
import { strings } from '@/config/strings';

export function BandSummaryView({ view }: { view: SummaryView }) {
  const b = strings.bandCard;
  return (
    <section
      aria-label={b.summaryTitle}
      className="rounded-2xl border border-border/60 bg-card p-4"
    >
      <h2 className="mb-2 text-base font-semibold text-foreground">{b.summaryTitle}</h2>
      {view.status === 'waiting' ? (
        <p className="text-base text-muted-foreground" role="status">
          {b.summaryWaiting}
        </p>
      ) : view.status === 'none' ? (
        <p className="text-base text-muted-foreground">{b.summaryNone}</p>
      ) : (
        <ul className="space-y-1 text-base leading-relaxed text-foreground">
          {view.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Fetches the band summary for a finished companion session (every 5 s, up to 180 s). */
export function BandSummary({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<SummaryView>({ status: 'waiting' });
  useEffect(() => {
    const poller = pollSummary({
      fetchOnce: () => fetchSummary(sessionId),
      onView: setView,
    });
    return () => poller.stop();
  }, [sessionId]);
  return <BandSummaryView view={view} />;
}
