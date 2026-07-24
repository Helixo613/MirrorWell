import { readFileSync } from 'node:fs';
import { Children, isValidElement, Fragment, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App.tsx';

describe('App DebugHud routing', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_ENABLE_LIVE_DEMO', 'false');
    vi.stubEnv('VITE_ENABLE_LIVE_V1_HARNESS', 'false');
    vi.stubEnv('VITE_ENABLE_CAPTURE_HARNESS', 'false');
    vi.stubEnv('VITE_ENABLE_DEBUG_HUD', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders ProductApp alongside the passive DebugOverlay', async () => {
    const app = App();

    expect(app.type).toBe(Fragment);
    const children = Children.toArray(app.props.children);
    expect(children).toHaveLength(2);
    expect(isValidElement(children[0])).toBe(true);

    // The overlay must be DebugOverlay; NOT DebugHud. DebugHud owns its own CaptureService
    // loop, so mounting it over the product app would put two consumers on CaptureService's
    // single <video> (the camera rule, ARCH §11).
    const loader = (children[1] as ReactElement<{ loader: () => Promise<{ default: unknown }> }>)
      .props.loader;
    const mod = (await loader()) as { default: unknown };
    expect((mod.default as { name?: string }).name).toBe('DebugOverlay');
  });

  it('keeps a camera harness exclusive', () => {
    vi.stubEnv('VITE_ENABLE_CAPTURE_HARNESS', 'true');

    const app = App();

    expect(app.type).toBe('div');
    const children = Children.toArray(app.props.children).filter(isValidElement);
    expect(children).toHaveLength(2);
  });

  it('DebugOverlay never touches the camera or inference pipeline', () => {
    // Structural invariant: the overlay is a PASSIVE reader of src/log.ts's dev tap. If it ever
    // imports the capture/inference stack it would contend with the product screens for the one
    // shared <video>, which is exactly the defect that made the old HUD un-overlayable.
    const src = readFileSync(new URL('../../src/dev/DebugOverlay.tsx', import.meta.url), 'utf8');
    // Assert on the IMPORT graph, not raw text; the prose above these imports legitimately
    // names CaptureService when explaining why the overlay must not use it.
    const imports = src.split('\n').filter((l) => l.trimStart().startsWith('import'));

    expect(imports.join('\n')).not.toMatch(/sensing|metrics|session/);
    expect(src).not.toContain('getUserMedia');
    expect(imports.join('\n')).toContain('tapDevLog');
  });
});
