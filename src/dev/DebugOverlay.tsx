// src/dev/DebugOverlay.tsx — passive live-state overlay for the REAL product app (dev-only).
//
// Unlike DebugHud (which owns its own CaptureService + LandmarkEngine loop and therefore must
// run standalone), this overlay opens NO camera and runs NO inference. It subscribes to
// src/log.ts's dev tap and renders whatever the product screens already log. That means:
//   * zero contention for CaptureService's single <video> (the camera rule is untouched), and
//   * what you see is the state of the ACTUAL calibration/session pipeline, not a duplicate.
//
// Dev-only twice over: src/dev/ is dropped from production bundles, and tapDevLog() is a no-op
// outside import.meta.env.DEV.
import { useEffect, useState } from 'react';
import { StorageService } from '../data/storage.ts';
import { tapDevLog } from '../log.ts';
import { seedDev } from './seed.ts';

/** Which quality gate each state maps to — the gates are evaluated in a fixed order
 *  (src/sensing/quality.ts), so the state name uniquely identifies the failing gate. */
const GATE_HINT: Record<string, string> = {
  QUALITY_OK: 'all gates pass',
  FACE_LOST: 'no face detected (or inference failed)',
  LOW_LIGHT: 'face-region luma < lumaMin (60)',
  TOO_FAR: 'eyes < interOcularMinFrac (0.09) of frame width — move closer',
  POSE_OUT_OF_RANGE: 'head angle > poseMaxDeg (15°)',
  LOW_CONFIDENCE: 'jitter > jitterMaxPct (0.005) — landmark instability',
};

type Line = { id: number; scope: string; msg: string; data: string };

const MAX_LINES = 8;

export function DebugOverlay() {
  const [quality, setQuality] = useState<string | null>(null);
  const [capture, setCapture] = useState<{ approved: number; total: number } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let nextId = 0;
    return tapDevLog((scope, msg, data) => {
      const d = (data ?? {}) as Record<string, unknown>;
      if (msg === 'quality' && typeof d.state === 'string') setQuality(d.state);
      if (scope === 'Capture' && msg === 'frame') {
        if (typeof d.state === 'string') setQuality(d.state);
        if (typeof d.approved === 'number' && typeof d.total === 'number') {
          setCapture({ approved: d.approved, total: d.total });
        }
        return; // per-frame spam stays out of the scrolling log
      }
      setLines((prev) =>
        [...prev, { id: nextId++, scope, msg, data: data ? JSON.stringify(data) : '' }].slice(-MAX_LINES),
      );
    });
  }, []);

  const ok = quality === 'QUALITY_OK';
  const pct = capture && capture.total > 0 ? Math.round((capture.approved / capture.total) * 100) : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 99999,
        width: collapsed ? 'auto' : 340,
        maxHeight: '90vh',
        overflow: 'auto',
        background: 'rgba(17,17,17,0.92)',
        color: '#e6e6e6',
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        border: '1px solid #444',
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: '#9ad' }}>DEBUG</strong>
        <button onClick={() => setCollapsed((c) => !c)} style={btn}>
          {collapsed ? 'show' : 'hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#999' }}>quality</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ok ? '#7fd67f' : '#ffb27f' }}>
              {quality ?? '— (no frames yet)'}
            </div>
            {quality && GATE_HINT[quality] && (
              <div style={{ fontSize: 11, color: '#aaa' }}>{GATE_HINT[quality]}</div>
            )}
          </div>

          {capture && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#999' }}>capture window</div>
              <div style={{ color: pct !== null && pct >= 70 ? '#7fd67f' : '#ff8f8f' }}>
                {capture.approved}/{capture.total} approved{pct !== null ? ` (${pct}%)` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>needs ≥70% (calibration.minQualityScore)</div>
            </div>
          )}

          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button
              onClick={() => {
                setSeeding(true);
                setActionError(null);
                // Reload after success so AppState / Home / Trends pick up the new rows;
                // silent failures previously left users thinking seed did nothing.
                void seedDev()
                  .then(() => {
                    window.location.assign('/home');
                  })
                  .catch((err: unknown) => {
                    setActionError(err instanceof Error ? err.message : String(err));
                    setSeeding(false);
                  });
              }}
              disabled={seeding || clearing}
              style={btn}
            >
              {seeding ? 'seeding…' : 'seed db'}
            </button>
            <button
              onClick={() => {
                setClearing(true);
                setActionError(null);
                // Dev reset: profile/baseline/sessions persist in IndexedDB by design (local-
                // first), so reopening localhost resumes where you left off. This wipes every
                // table and reloads for a truly fresh start. Corner: while DEMO mode is active,
                // StorageService structurally refuses the clear (by design; this overlay may not
                // import SafetyGate — the import-graph invariant in app-debug-hud.test.ts) — the
                // reload still exits demo (in-memory flag), so a second click then wipes the DB.
                void StorageService.deleteAllData()
                  // Full navigation (not just reload) so RootRedirect / GateRoute re-run on a
                  // wiped DB → UNATTESTED → /onboarding. A bare reload while still on
                  // /calibration|/home can feel like "delete did nothing" if the URL sticks.
                  .then(() => window.location.assign('/onboarding'))
                  .catch((err: unknown) => {
                    setActionError(err instanceof Error ? err.message : String(err));
                    setClearing(false);
                  });
              }}
              disabled={seeding || clearing}
              style={btn}
            >
              {clearing ? 'clearing…' : 'clear db + reload'}
            </button>
          </div>
          {actionError ? (
            <div style={{ marginTop: 8, color: '#ff8f8f', fontSize: 11 }}>
              seed/clear error: {actionError}
            </div>
          ) : null}

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#999' }}>log</div>
            {lines.length === 0 ? (
              <div style={{ color: '#777' }}>—</div>
            ) : (
              lines.map((l) => (
                <div key={l.id} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ color: '#9ad' }}>{l.scope}</span> {l.msg}{' '}
                  <span style={{ color: '#888' }}>{l.data}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  font: 'inherit',
};
