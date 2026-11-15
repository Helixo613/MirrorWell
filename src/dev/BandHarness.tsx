// DEV-ONLY: shows the live band card (over a camera placeholder) and the post-session summary,
// fed by VITE_COMPANION_MOCK fixtures. Enable with VITE_ENABLE_BAND_HARNESS=true. No camera.
import { LiveBandCard } from '@/components/session/LiveBandCard';
import { BandSummary } from '@/components/summary/BandSummary';

export function BandHarness() {
  return (
    <div className="mx-auto flex max-w-standalone flex-col gap-3 p-4">
      <LiveBandCard active />
      <div className="flex h-56 items-center justify-center rounded-2xl border border-border/60 bg-muted text-muted-foreground">
        camera view (placeholder)
      </div>
      <BandSummary sessionId="harness" />
    </div>
  );
}
