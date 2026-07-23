import { Children, createElement, Fragment, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { DebugHud } from '../../src/dev/DebugHud.tsx';

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

  it('renders ProductApp with a camera-disabled DebugHud overlay', () => {
    const app = App();

    expect(app.type).toBe(Fragment);
    const children = Children.toArray(app.props.children);
    expect(children).toHaveLength(2);
    expect(isValidElement(children[0])).toBe(true);
    expect(
      (children[1] as ReactElement<{ componentProps?: { cameraControls?: boolean } }>).props
        .componentProps,
    ).toEqual({ cameraControls: false });
  });

  it('keeps a camera harness exclusive while allowing the full DebugHud', () => {
    vi.stubEnv('VITE_ENABLE_CAPTURE_HARNESS', 'true');

    const app = App();

    expect(app.type).toBe('div');
    const children = Children.toArray(app.props.children).filter(isValidElement);
    expect(children).toHaveLength(2);
    expect(
      (children[1] as ReactElement<{ componentProps?: { cameraControls?: boolean } }>).props
        .componentProps,
    ).toBeUndefined();
  });

  it('removes DebugHud camera controls in product-overlay mode', () => {
    const markup = renderToStaticMarkup(createElement(DebugHud, { cameraControls: false }));

    expect(markup).not.toContain('>Start<');
    expect(markup).not.toContain('>Stop<');
    expect(markup).toContain('>Seed<');
    expect(markup).toContain('fps:');
  });
});
