// Same-origin GETs for the live card and summary. In `vite dev` only, VITE_COMPANION_MOCK=<fixture>
// serves calm-band/sim/fixtures/<fixture>.json instead. The mock branch is dead code in any
// production build (import.meta.env.DEV is false), so it cannot be enabled there.
import { companionUi, type LiveSnapshot, type SummarySnapshot } from '@/companion/liveBand';

// DEV only: the fixture comes from the env var, or from ?mock=<fixture> on the page URL.
const mockName: string | undefined = import.meta.env.DEV
  ? ((import.meta.env.VITE_COMPANION_MOCK as string | undefined) ??
    (typeof location !== 'undefined'
      ? (new URLSearchParams(location.search).get('mock') ?? undefined)
      : undefined))
  : undefined;

async function mockGet(path: string): Promise<unknown> {
  const { loadFixture } = await import('./mockFixtures');
  const wanted = mockName ?? '';
  const name = path.endsWith('/live')
    ? wanted.startsWith('live-') ? wanted : 'live-usable'
    : wanted.startsWith('summary-') ? wanted : 'summary-settled';
  if (name === 'summary-404') throw new Error('companion 404');
  return loadFixture(name);
}

async function getJson(path: string, timeoutMs: number): Promise<unknown> {
  if (import.meta.env.DEV && mockName) return mockGet(path);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: ctl.signal });
    if (!res.ok) throw new Error(`companion ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const fetchLive = () =>
  getJson('/api/companion/live', companionUi.liveTimeoutMs) as Promise<LiveSnapshot>;

export const fetchSummary = (id: string) =>
  getJson(
    `/api/companion/sessions/${encodeURIComponent(id)}/summary`,
    companionUi.summaryPollMs,
  ) as Promise<SummarySnapshot>;
